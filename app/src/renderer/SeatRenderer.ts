import type { GraphicsDevice, GraphicsDeviceLostEvent } from './graphics/GraphicsDevice';
import type {
  DrawInstanceRange,
  GraphicsBuffer,
  GraphicsPipeline,
  InstanceDirtyRange,
  RenderBackend,
} from './graphics/RenderTypes';
import {
  DEFAULT_SEAT_PALETTE,
  SEAT_LOD_DOTS,
  SEAT_LOD_FULL_GLYPH,
  SEAT_UNIFORM_STRUCT_SIZE_BYTES,
  type SeatPalette,
  writeSeatUniformData,
} from './graphics/shaders/shader-contract';
import { WebGl2Device } from './graphics/webgl2/WebGl2Device';
import { WebGl2SeatPipeline } from './graphics/webgl2/WebGl2SeatPipeline';
import { WebGpuDevice } from './graphics/webgpu/WebGpuDevice';
import { WebGpuSeatPipeline } from './graphics/webgpu/WebGpuSeatPipeline';
import { Camera2D, type CameraRect } from './camera/Camera2D';
import {
  SEAT_INSTANCE_STRIDE_BYTES,
  SEAT_INSTANCE_WORDS,
  SEAT_STATE_FLAG_HOVERED,
  SEAT_STATE_FLAG_SELECTED,
  SEAT_STATE_FLAG_UNAVAILABLE,
} from '../shared/instance-layout';
import {
  SeatLayoutEventEmitter,
  type SeatLayoutEventListener,
  type SeatLayoutEventName,
  type SeatLayoutSeatInfo,
  type SeatLayoutSeatSelectPayload,
} from '../shared/events';
import { flattenSeatMap, type FlattenedSeatMap, type SeatMapDocument } from '../shared/seat-map';
import {
  SeatLayoutCore,
  type SeatInstanceBufferViews,
  type WasmRangeBufferView,
} from '../wasm/SeatLayoutCore';

export const SEAT_LOD_FULL_GLYPH_MIN_SCREEN_PX = 6;
export const TODO_SEAT_LABEL_MIN_SCREEN_PX = 18;

const INITIAL_FIT_PADDING_PX = 40;
const CULLING_MARGIN_SCREEN_PX = 32;
const FRAME_STATS_SAMPLE_COUNT = 120;
const FULL_BUFFER_UPLOAD_DIRTY_FRACTION = 1 / 3;
const PICK_RADIUS_CSS_PX = 8;
const TAP_SLOP_CSS_PX = 5;
const NO_SEAT_INDEX = -1;

export interface SeatLayoutFrameStats {
  frameCount: number;
  lastFrameMs: number;
  avgFrameMs: number;
  p95FrameMs: number;
  lastVisibleInstanceCount: number;
  lastDrawRangeCount: number;
  lastLodLevel: number;
}

export interface SeatRendererOptions {
  readonly core?: SeatLayoutCoreLike;
  readonly device?: GraphicsDevice;
  readonly pipeline?: GraphicsPipeline<unknown>;
  readonly createPipeline?: (device: GraphicsDevice) => Promise<GraphicsPipeline<unknown>>;
  readonly palette?: SeatPalette;
  readonly autoRender?: boolean;
  readonly attachCameraEvents?: boolean;
  readonly attachInteractionEvents?: boolean;
  readonly onDeviceLost?: (event: GraphicsDeviceLostEvent) => void;
  readonly onValidationError?: (error: Error) => void;
  readonly onFrame?: (stats: SeatLayoutFrameStats) => void;
  readonly onError?: (error: Error) => void;
  readonly now?: () => number;
  readonly requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelAnimationFrame?: (handle: number) => void;
}

export interface SeatLayoutCoreLike {
  readonly instanceCount: number;
  readonly instanceStrideBytes: number;
  readonly instanceViews: SeatInstanceBufferViews;
  readonly dirtyRanges: WasmRangeBufferView;
  loadFlattened(flat: FlattenedSeatMap): void;
  queryViewport(minX: number, minY: number, maxX: number, maxY: number): WasmRangeBufferView;
  hitTest(x: number, y: number, radius: number): number;
  setStateFlags(index: number, flags: number): boolean;
  clearDirtyRanges(): void;
  dispose?(): void;
}

interface DeviceWithDrawingBufferSize extends GraphicsDevice {
  getDrawingBufferSize(): { width: number; height: number };
}

interface ClientPoint {
  readonly x: number;
  readonly y: number;
}

interface ScreenPickPoint {
  readonly screenX: number;
  readonly screenY: number;
  readonly cssToScreenScale: number;
}

interface TapCandidate {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
}

interface FrameStatsGlobal {
  __seatLayoutFrameStats?: SeatLayoutFrameStats;
}

export class SeatRenderer {
  readonly camera = new Camera2D();

  private core: SeatLayoutCoreLike | null = null;
  private ownsCore = false;
  private device: GraphicsDevice | null = null;
  private pipeline: GraphicsPipeline<unknown> | null = null;
  private instanceBuffer: GraphicsBuffer | null = null;
  private instanceCountValue = 0;
  private maxSeatSize = 1;
  private palette: SeatPalette;
  private loaded = false;
  private disposed = false;
  private dirty = false;
  private animationFrameHandle: number | null = null;
  private hoverFrameHandle: number | null = null;
  private detachCameraEvents: (() => void) | null = null;
  private detachInteractionEvents: (() => void) | null = null;
  private suppressNextClick = false;
  private hoveredSeatIndex = NO_SEAT_INDEX;
  private latestHoverClientPoint: ClientPoint | null = null;
  private tapCandidate: TapCandidate | null = null;
  private readonly selectedSeatIndices = new Set<number>();
  private readonly events = new SeatLayoutEventEmitter();
  private seatInfo: SeatLayoutSeatInfo[] = [];
  private readonly visibleRect: CameraRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private readonly dirtyUploadRanges: InstanceDirtyRange[] = [];
  private readonly uniformData = new Uint8Array(SEAT_UNIFORM_STRUCT_SIZE_BYTES);
  private readonly frameSamples = new Float32Array(FRAME_STATS_SAMPLE_COUNT);
  private readonly frameSamplesSorted = new Float32Array(FRAME_STATS_SAMPLE_COUNT);
  private frameSampleCursor = 0;
  private frameSampleCount = 0;
  private readonly stats: SeatLayoutFrameStats = {
    frameCount: 0,
    lastFrameMs: 0,
    avgFrameMs: 0,
    p95FrameMs: 0,
    lastVisibleInstanceCount: 0,
    lastDrawRangeCount: 0,
    lastLodLevel: SEAT_LOD_DOTS,
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private readonly options: SeatRendererOptions = {},
  ) {
    this.palette = options.palette ?? DEFAULT_SEAT_PALETTE;
    this.publishStats();
  }

  async initialize(): Promise<void> {
    if (this.core || this.device || this.pipeline) {
      return;
    }

    const ownsCore = !this.options.core;
    const core = this.options.core ?? (await SeatLayoutCore.create());

    if (this.disposed) {
      if (ownsCore) {
        core.dispose?.();
      }
      return;
    }

    const device = this.options.device ?? this.createDefaultDevice();
    try {
      await device.initialize();

      if (this.disposed) {
        device.dispose();
        if (ownsCore) {
          core.dispose?.();
        }
        return;
      }

      const pipeline =
        this.options.pipeline ??
        (await (this.options.createPipeline ?? createDefaultPipeline)(device));

      if (this.disposed) {
        device.dispose();
        if (ownsCore) {
          core.dispose?.();
        }
        return;
      }

      this.core = core;
      this.ownsCore = ownsCore;
      this.device = device;
      this.pipeline = pipeline;
    } catch (error) {
      device.dispose();
      if (ownsCore) {
        core.dispose?.();
      }
      throw error;
    }

    this.syncViewport();

    if (this.options.attachCameraEvents !== false) {
      this.detachCameraEvents = this.camera.attachToElement(this.canvas, () => {
        this.requestRender();
      });
    }

    if (this.options.attachInteractionEvents ?? this.options.attachCameraEvents !== false) {
      this.detachInteractionEvents = this.attachInteractionEvents();
    }
  }

  backendName(): RenderBackend {
    return this.requireDevice().backend;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  get instanceCount(): number {
    return this.instanceCountValue;
  }

  getFrameStats(): SeatLayoutFrameStats {
    return this.stats;
  }

  on<TEvent extends SeatLayoutEventName>(
    type: TEvent,
    listener: SeatLayoutEventListener<TEvent>,
  ): () => void {
    return this.events.on(type, listener);
  }

  off<TEvent extends SeatLayoutEventName>(
    type: TEvent,
    listener: SeatLayoutEventListener<TEvent>,
  ): void {
    this.events.off(type, listener);
  }

  addEventListener<TEvent extends SeatLayoutEventName>(
    type: TEvent,
    listener: SeatLayoutEventListener<TEvent>,
  ): void {
    this.events.addEventListener(type, listener);
  }

  removeEventListener<TEvent extends SeatLayoutEventName>(
    type: TEvent,
    listener: SeatLayoutEventListener<TEvent>,
  ): void {
    this.events.removeEventListener(type, listener);
  }

  getSelection(): readonly number[] {
    return sortedSelection(this.selectedSeatIndices);
  }

  clearSelection(): void {
    this.setSelection([]);
  }

  setSelection(indices: Iterable<number>): void {
    const nextSelection = new Set<number>();

    for (const index of indices) {
      if (this.isValidSeatIndex(index) && this.isSeatAvailable(index)) {
        nextSelection.add(index);
      }
    }

    this.applySelection(nextSelection);
  }

  pickAtClient(clientX: number, clientY: number): SeatLayoutSeatInfo | null {
    return this.seatInfoForIndex(this.pickSeatIndexAtClient(clientX, clientY));
  }

  loadDocument(document: SeatMapDocument): void {
    const core = this.requireCore();
    const device = this.requireDevice();
    const flat = flattenSeatMap(document);

    core.loadFlattened(flat);
    this.instanceCountValue = core.instanceCount;
    this.maxSeatSize = maxSeatSize(flat);
    this.palette = paletteFromDocument(document);
    this.seatInfo = seatInfoFromDocument(document);
    this.hoveredSeatIndex = NO_SEAT_INDEX;
    this.latestHoverClientPoint = null;
    this.tapCandidate = null;
    this.suppressNextClick = false;
    this.selectedSeatIndices.clear();
    this.recreateInstanceBuffer(device, core);
    this.camera.setDocumentBounds(document.bounds);
    this.camera.fitToBounds(document.bounds, INITIAL_FIT_PADDING_PX);
    this.loaded = true;
    this.requestRender();
  }

  requestRender(): void {
    if (this.disposed) {
      return;
    }

    this.dirty = true;

    if (this.options.autoRender === false || this.animationFrameHandle !== null) {
      return;
    }

    const requestFrame = this.options.requestAnimationFrame ?? globalThis.requestAnimationFrame;
    this.animationFrameHandle = requestFrame(this.handleAnimationFrame);
  }

  renderNow(): void {
    if (this.disposed || !this.loaded) {
      return;
    }

    this.renderFrame();
  }

  async replaceGraphicsBackend(
    device: GraphicsDevice,
    pipeline?: GraphicsPipeline<unknown>,
    canvas: HTMLCanvasElement = this.canvas,
  ): Promise<void> {
    await device.initialize();

    const nextPipeline =
      pipeline ?? (await (this.options.createPipeline ?? createDefaultPipeline)(device));

    if (this.disposed) {
      device.dispose();
      return;
    }

    const previousDevice = this.device;
    const previousInstanceBuffer = this.instanceBuffer;
    const canvasChanged = canvas !== this.canvas;

    if (canvasChanged) {
      this.detachCameraEvents?.();
      this.detachCameraEvents = null;
      this.detachInteractionEvents?.();
      this.detachInteractionEvents = null;
      this.setCanvasCursor(false);
      this.canvas = canvas;
    }

    previousInstanceBuffer?.dispose();
    this.instanceBuffer = null;
    this.device = device;
    this.pipeline = nextPipeline;
    previousDevice?.dispose();
    this.syncViewport();

    const core = this.core;

    if (core && this.loaded) {
      this.recreateInstanceBuffer(device, core);

      if (core.instanceViews.bytes.byteLength > 0) {
        device.uploadBuffer(this.requireInstanceBuffer(), core.instanceViews.bytes);
      }

      core.clearDirtyRanges();
      this.refreshSelectionFromCore();
    }

    if (canvasChanged) {
      if (this.options.attachCameraEvents !== false) {
        this.detachCameraEvents = this.camera.attachToElement(this.canvas, () => {
          this.requestRender();
        });
      }

      if (this.options.attachInteractionEvents ?? this.options.attachCameraEvents !== false) {
        this.detachInteractionEvents = this.attachInteractionEvents();
      }
    }

    if (this.loaded) {
      this.requestRender();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.detachCameraEvents?.();
    this.detachCameraEvents = null;
    this.detachInteractionEvents?.();
    this.detachInteractionEvents = null;

    if (this.animationFrameHandle !== null) {
      const cancelFrame = this.options.cancelAnimationFrame ?? globalThis.cancelAnimationFrame;
      cancelFrame(this.animationFrameHandle);
      this.animationFrameHandle = null;
    }

    if (this.hoverFrameHandle !== null) {
      const cancelFrame = this.options.cancelAnimationFrame ?? globalThis.cancelAnimationFrame;
      cancelFrame(this.hoverFrameHandle);
      this.hoverFrameHandle = null;
    }

    this.setCanvasCursor(false);
    this.instanceBuffer?.dispose();
    this.instanceBuffer = null;
    this.device?.dispose();
    this.device = null;
    this.pipeline = null;
    if (this.ownsCore) {
      this.core?.dispose?.();
    }
    this.ownsCore = false;
    this.core = null;
  }

  private readonly handleAnimationFrame: FrameRequestCallback = () => {
    this.animationFrameHandle = null;

    if (this.disposed || !this.loaded || !this.dirty) {
      return;
    }

    this.renderFrame();
  };

  private readonly handleHoverAnimationFrame: FrameRequestCallback = () => {
    this.hoverFrameHandle = null;

    if (this.disposed) {
      return;
    }

    const point = this.latestHoverClientPoint;

    if (!point) {
      this.setHoveredSeatIndex(NO_SEAT_INDEX);
      this.setCanvasCursor(false);
      return;
    }

    const hitIndex = this.pickSeatIndexAtClient(point.x, point.y);
    this.setHoveredSeatIndex(hitIndex);
    this.setCanvasCursor(hitIndex !== NO_SEAT_INDEX);
  };

  private attachInteractionEvents(): () => void {
    const pointerDown = (event: PointerEvent) => {
      this.handleInteractionPointerDown(event);
    };
    const pointerMove = (event: PointerEvent) => {
      this.handleInteractionPointerMove(event);
    };
    const pointerUp = (event: PointerEvent) => {
      this.handleInteractionPointerUp(event);
    };
    const pointerLeave = () => {
      this.handleInteractionPointerLeave();
    };
    const click = (event: MouseEvent) => {
      this.handleInteractionClick(event);
    };

    this.canvas.addEventListener('pointerdown', pointerDown);
    this.canvas.addEventListener('pointermove', pointerMove);
    this.canvas.addEventListener('pointerup', pointerUp);
    this.canvas.addEventListener('pointercancel', pointerUp);
    this.canvas.addEventListener('pointerleave', pointerLeave);
    this.canvas.addEventListener('click', click);

    return () => {
      this.canvas.removeEventListener('pointerdown', pointerDown);
      this.canvas.removeEventListener('pointermove', pointerMove);
      this.canvas.removeEventListener('pointerup', pointerUp);
      this.canvas.removeEventListener('pointercancel', pointerUp);
      this.canvas.removeEventListener('pointerleave', pointerLeave);
      this.canvas.removeEventListener('click', click);
    };
  }

  private handleInteractionPointerDown(event: PointerEvent): void {
    this.tapCandidate = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
  }

  private handleInteractionPointerMove(event: PointerEvent): void {
    this.latestHoverClientPoint = { x: event.clientX, y: event.clientY };
    this.scheduleHoverPick();
  }

  private handleInteractionPointerUp(event: PointerEvent): void {
    const candidate = this.tapCandidate;
    this.tapCandidate = null;

    if (!candidate || candidate.pointerId !== event.pointerId) {
      return;
    }

    this.suppressNextClick = true;

    if (
      Math.hypot(event.clientX - candidate.startClientX, event.clientY - candidate.startClientY) >
      TAP_SLOP_CSS_PX
    ) {
      return;
    }

    this.toggleSelectionAtClient(event.clientX, event.clientY);
  }

  private handleInteractionPointerLeave(): void {
    this.latestHoverClientPoint = null;
    this.setHoveredSeatIndex(NO_SEAT_INDEX);
    this.setCanvasCursor(false);
  }

  private handleInteractionClick(event: MouseEvent): void {
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      return;
    }

    this.toggleSelectionAtClient(event.clientX, event.clientY);
  }

  private scheduleHoverPick(): void {
    if (this.hoverFrameHandle !== null) {
      return;
    }

    const requestFrame = this.options.requestAnimationFrame ?? globalThis.requestAnimationFrame;
    this.hoverFrameHandle = requestFrame(this.handleHoverAnimationFrame);
  }

  private toggleSelectionAtClient(clientX: number, clientY: number): void {
    const hitIndex = this.pickSeatIndexAtClient(clientX, clientY);

    if (hitIndex === NO_SEAT_INDEX || !this.isSeatAvailable(hitIndex)) {
      return;
    }

    const nextSelection = new Set(this.selectedSeatIndices);

    if (nextSelection.has(hitIndex)) {
      nextSelection.delete(hitIndex);
    } else {
      nextSelection.add(hitIndex);
    }

    this.applySelection(nextSelection, hitIndex);
  }

  private pickSeatIndexAtClient(clientX: number, clientY: number): number {
    if (!this.loaded || this.disposed) {
      return NO_SEAT_INDEX;
    }

    const core = this.requireCore();
    const pickPoint = this.clientToScreen(clientX, clientY);
    const world = this.camera.screenToWorld(pickPoint.screenX, pickPoint.screenY);
    const pickRadius = (PICK_RADIUS_CSS_PX * pickPoint.cssToScreenScale) / this.camera.getZoom();
    const hitIndex = core.hitTest(world.x, world.y, pickRadius);

    return this.isValidSeatIndex(hitIndex) ? hitIndex : NO_SEAT_INDEX;
  }

  private clientToScreen(clientX: number, clientY: number): ScreenPickPoint {
    const rect = this.canvas.getBoundingClientRect();
    const viewport = this.camera.getViewportSize();
    const scaleX = rect.width > 0 ? viewport.width / rect.width : 1;
    const scaleY = rect.height > 0 ? viewport.height / rect.height : 1;

    return {
      screenX: (clientX - rect.left) * scaleX,
      screenY: (clientY - rect.top) * scaleY,
      cssToScreenScale: (scaleX + scaleY) * 0.5,
    };
  }

  private setHoveredSeatIndex(nextIndex: number): void {
    const normalizedIndex = this.isValidSeatIndex(nextIndex) ? nextIndex : NO_SEAT_INDEX;

    if (normalizedIndex === this.hoveredSeatIndex) {
      return;
    }

    const previousIndex = this.hoveredSeatIndex;
    this.hoveredSeatIndex = normalizedIndex;
    let updated = false;

    if (previousIndex !== NO_SEAT_INDEX) {
      updated = this.writeSeatStateFlag(previousIndex, SEAT_STATE_FLAG_HOVERED, false) || updated;
    }

    if (normalizedIndex !== NO_SEAT_INDEX) {
      updated = this.writeSeatStateFlag(normalizedIndex, SEAT_STATE_FLAG_HOVERED, true) || updated;
    }

    if (updated) {
      this.requestRender();
    }

    this.events.emit('seatHover', this.seatInfoForIndex(normalizedIndex));
  }

  private applySelection(nextSelection: ReadonlySet<number>, changedByClick?: number): void {
    const previousSelection = new Set(this.selectedSeatIndices);
    const changedIndices = new Set<number>();
    let updated = false;

    for (const index of previousSelection) {
      if (!nextSelection.has(index)) {
        this.selectedSeatIndices.delete(index);
        changedIndices.add(index);
        updated = this.writeSeatStateFlag(index, SEAT_STATE_FLAG_SELECTED, false) || updated;
      }
    }

    for (const index of nextSelection) {
      if (!previousSelection.has(index)) {
        this.selectedSeatIndices.add(index);
        changedIndices.add(index);
        updated = this.writeSeatStateFlag(index, SEAT_STATE_FLAG_SELECTED, true) || updated;
      }
    }

    if (changedIndices.size === 0) {
      return;
    }

    if (updated) {
      this.requestRender();
    }

    const orderedChangedIndices = sortedSelection(changedIndices);
    if (changedByClick !== undefined && changedIndices.has(changedByClick)) {
      this.emitSeatSelect(changedByClick);
    } else {
      for (const index of orderedChangedIndices) {
        this.emitSeatSelect(index);
      }
    }

    this.events.emit('selectionChange', {
      selectedIndices: Object.freeze(sortedSelection(this.selectedSeatIndices)),
    });
  }

  private emitSeatSelect(index: number): void {
    const seatInfo = this.seatInfoForIndex(index);

    if (!seatInfo) {
      return;
    }

    this.events.emit('seatSelect', {
      ...seatInfo,
      selected: this.selectedSeatIndices.has(index),
    } satisfies SeatLayoutSeatSelectPayload);
  }

  private writeSeatStateFlag(index: number, flag: number, enabled: boolean): boolean {
    if (!this.isValidSeatIndex(index)) {
      return false;
    }

    const core = this.requireCore();
    const currentFlags = this.seatStateFlags(index);
    const nextFlags = enabled ? currentFlags | flag : currentFlags & ~flag;

    if (nextFlags === currentFlags) {
      return false;
    }

    return core.setStateFlags(index, nextFlags >>> 0);
  }

  private isSeatAvailable(index: number): boolean {
    return (
      this.isValidSeatIndex(index) &&
      (this.seatStateFlags(index) & SEAT_STATE_FLAG_UNAVAILABLE) === 0
    );
  }

  private seatStateFlags(index: number): number {
    if (!this.isValidSeatIndex(index)) {
      return 0;
    }

    return this.requireCore().instanceViews.u32[index * SEAT_INSTANCE_WORDS + 5] ?? 0;
  }

  private isValidSeatIndex(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < this.requireCore().instanceCount;
  }

  private seatInfoForIndex(index: number): SeatLayoutSeatInfo | null {
    return this.isValidSeatIndex(index) ? (this.seatInfo[index] ?? null) : null;
  }

  private setCanvasCursor(overSeat: boolean): void {
    const style = (this.canvas as HTMLCanvasElement & { style?: CSSStyleDeclaration }).style;

    if (style) {
      style.cursor = overSeat ? 'pointer' : '';
    }
  }

  private refreshSelectionFromCore(): void {
    const core = this.requireCore();

    this.selectedSeatIndices.clear();

    for (let index = 0; index < core.instanceCount; index += 1) {
      if ((this.seatStateFlags(index) & SEAT_STATE_FLAG_SELECTED) !== 0) {
        this.selectedSeatIndices.add(index);
      }
    }
  }

  private renderFrame(): void {
    const start = this.now();
    this.dirty = false;

    try {
      const core = this.requireCore();
      const device = this.requireDevice();
      const pipeline = this.requirePipeline();
      const instanceBuffer = this.requireInstanceBuffer();

      this.syncViewport();
      this.uploadDirtyRanges(device, core, instanceBuffer);

      const visibleRanges = this.queryVisibleRanges(core);
      const lodLevel = this.currentLodLevel();
      this.writeUniforms(lodLevel);

      const drawSummary = this.encodeVisibleDraws(device, pipeline, instanceBuffer, visibleRanges);
      device.submit();

      this.recordFrame(
        this.now() - start,
        drawSummary.visibleInstanceCount,
        drawSummary.rangeCount,
        lodLevel,
      );
      this.options.onFrame?.(this.stats);
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(normalizedError);
    }
  }

  private createDefaultDevice(): GraphicsDevice {
    return new WebGpuDevice(this.canvas, {
      onDeviceLost: this.options.onDeviceLost,
      onValidationError: this.options.onValidationError,
    });
  }

  private recreateInstanceBuffer(device: GraphicsDevice, core: SeatLayoutCoreLike): void {
    this.instanceBuffer?.dispose();
    this.instanceBuffer = device.createBuffer({
      label: 'seat-layout-instances',
      sizeBytes: Math.max(SEAT_INSTANCE_STRIDE_BYTES, core.instanceViews.bytes.byteLength),
      usages: ['vertex', 'copy-dst'],
      instanceStrideBytes: core.instanceStrideBytes,
    });
  }

  private syncViewport(): void {
    const device = this.requireDevice();
    device.resize();
    const { width, height } = drawingBufferSize(device, this.canvas);
    this.camera.setViewportSize(width, height);
  }

  private uploadDirtyRanges(
    device: GraphicsDevice,
    core: SeatLayoutCoreLike,
    instanceBuffer: GraphicsBuffer,
  ): void {
    const dirtyRanges = this.collectDirtyRanges(core.dirtyRanges, core.instanceCount);

    if (dirtyRanges.length === 0) {
      return;
    }

    device.uploadBuffer(instanceBuffer, core.instanceViews.bytes, {
      dirtyRanges,
      instanceStrideBytes: core.instanceStrideBytes,
    });
    core.clearDirtyRanges();
  }

  private collectDirtyRanges(
    dirtyRangeView: WasmRangeBufferView,
    instanceCount: number,
  ): readonly InstanceDirtyRange[] {
    this.dirtyUploadRanges.length = 0;

    if (dirtyRangeView.rangeCount === 0 || dirtyRangeView.length === 0) {
      return this.dirtyUploadRanges;
    }

    let dirtyInstanceCount = 0;
    for (let index = 0; index < dirtyRangeView.length; index += 2) {
      dirtyInstanceCount += dirtyRangeView.data[index + 1];
    }

    if (dirtyInstanceCount > instanceCount * FULL_BUFFER_UPLOAD_DIRTY_FRACTION) {
      this.dirtyUploadRanges.push({ startInstance: 0, instanceCount });
      return this.dirtyUploadRanges;
    }

    for (let index = 0; index < dirtyRangeView.length; index += 2) {
      this.dirtyUploadRanges.push({
        startInstance: dirtyRangeView.data[index],
        instanceCount: dirtyRangeView.data[index + 1],
      });
    }

    return this.dirtyUploadRanges;
  }

  private queryVisibleRanges(core: SeatLayoutCoreLike): WasmRangeBufferView {
    const marginWorld = Math.max(
      this.maxSeatSize,
      CULLING_MARGIN_SCREEN_PX / this.camera.getZoom(),
    );
    const rect = this.camera.getVisibleWorldRect(marginWorld, this.visibleRect);
    return core.queryViewport(rect.minX, rect.minY, rect.maxX, rect.maxY);
  }

  private currentLodLevel(): number {
    return this.maxSeatSize * this.camera.getZoom() >= SEAT_LOD_FULL_GLYPH_MIN_SCREEN_PX
      ? SEAT_LOD_FULL_GLYPH
      : SEAT_LOD_DOTS;
  }

  private writeUniforms(lodLevel: number): void {
    writeSeatUniformData(this.uniformData, {
      viewProjection: this.camera.getViewProjectionMatrix(),
      palette: this.palette,
      lodLevel,
    });
  }

  private encodeVisibleDraws(
    device: GraphicsDevice,
    pipeline: GraphicsPipeline<unknown>,
    instanceBuffer: GraphicsBuffer,
    visibleRanges: WasmRangeBufferView,
  ): { visibleInstanceCount: number; rangeCount: number } {
    let visibleInstanceCount = 0;
    let rangeCount = 0;

    for (let index = 0; index < visibleRanges.length; index += 2) {
      const range = {
        startInstance: visibleRanges.data[index],
        instanceCount: visibleRanges.data[index + 1],
      } satisfies DrawInstanceRange;

      if (range.instanceCount === 0) {
        continue;
      }

      visibleInstanceCount += range.instanceCount;
      rangeCount += 1;
      device.encodeDraw(this.uniformData, pipeline, { instanceBuffer }, range);
    }

    if (rangeCount === 0) {
      device.encodeDraw(
        this.uniformData,
        pipeline,
        { instanceBuffer },
        { startInstance: 0, instanceCount: 0 },
      );
    }

    return { visibleInstanceCount, rangeCount };
  }

  private recordFrame(
    frameMs: number,
    visibleInstanceCount: number,
    rangeCount: number,
    lodLevel: number,
  ): void {
    this.frameSamples[this.frameSampleCursor] = frameMs;
    this.frameSampleCursor = (this.frameSampleCursor + 1) % FRAME_STATS_SAMPLE_COUNT;
    this.frameSampleCount = Math.min(FRAME_STATS_SAMPLE_COUNT, this.frameSampleCount + 1);

    let total = 0;
    for (let index = 0; index < this.frameSampleCount; index += 1) {
      total += this.frameSamples[index];
      this.frameSamplesSorted[index] = this.frameSamples[index];
    }

    this.frameSamplesSorted.subarray(0, this.frameSampleCount).sort();

    const p95Index = Math.min(
      this.frameSampleCount - 1,
      Math.ceil(this.frameSampleCount * 0.95) - 1,
    );

    this.stats.frameCount += 1;
    this.stats.lastFrameMs = frameMs;
    this.stats.avgFrameMs = total / this.frameSampleCount;
    this.stats.p95FrameMs = this.frameSamplesSorted[p95Index] ?? frameMs;
    this.stats.lastVisibleInstanceCount = visibleInstanceCount;
    this.stats.lastDrawRangeCount = rangeCount;
    this.stats.lastLodLevel = lodLevel;
    this.publishStats();
  }

  private publishStats(): void {
    (globalThis as typeof globalThis & FrameStatsGlobal).__seatLayoutFrameStats = this.stats;
  }

  private requireCore(): SeatLayoutCoreLike {
    if (!this.core) {
      throw new Error('SeatRenderer has not been initialized with a WASM core');
    }

    return this.core;
  }

  private requireDevice(): GraphicsDevice {
    if (!this.device) {
      throw new Error('SeatRenderer has not been initialized with a graphics device');
    }

    return this.device;
  }

  private requirePipeline(): GraphicsPipeline<unknown> {
    if (!this.pipeline) {
      throw new Error('SeatRenderer has not been initialized with a graphics pipeline');
    }

    return this.pipeline;
  }

  private requireInstanceBuffer(): GraphicsBuffer {
    if (!this.instanceBuffer) {
      throw new Error('SeatRenderer has not loaded an instance buffer');
    }

    return this.instanceBuffer;
  }

  private now(): number {
    return this.options.now?.() ?? performance.now();
  }
}

async function createDefaultPipeline(device: GraphicsDevice): Promise<GraphicsPipeline<unknown>> {
  if (device instanceof WebGpuDevice) {
    return WebGpuSeatPipeline.create(device);
  }

  if (device instanceof WebGl2Device) {
    return WebGl2SeatPipeline.create(device);
  }

  throw new Error(`No seat pipeline factory configured for ${device.backend}`);
}

function drawingBufferSize(
  device: GraphicsDevice,
  canvas: HTMLCanvasElement,
): { width: number; height: number } {
  if (hasDrawingBufferSize(device)) {
    return device.getDrawingBufferSize();
  }

  return {
    width: Math.max(1, Math.floor(canvas.width || 1)),
    height: Math.max(1, Math.floor(canvas.height || 1)),
  };
}

function hasDrawingBufferSize(device: GraphicsDevice): device is DeviceWithDrawingBufferSize {
  return (
    typeof (device as Partial<DeviceWithDrawingBufferSize>).getDrawingBufferSize === 'function'
  );
}

function maxSeatSize(flat: FlattenedSeatMap): number {
  let maxSize = 1;

  for (let index = 0; index < flat.size.length; index += 1) {
    if (flat.size[index] > maxSize) {
      maxSize = flat.size[index];
    }
  }

  return maxSize;
}

function sortedSelection(indices: ReadonlySet<number>): number[] {
  return [...indices].sort((a, b) => a - b);
}

function seatInfoFromDocument(document: SeatMapDocument): SeatLayoutSeatInfo[] {
  const seats: SeatLayoutSeatInfo[] = [];
  let seatIndex = 0;

  for (const section of document.sections) {
    for (const row of section.rows) {
      for (const seat of row.seats) {
        seats.push({
          seatIndex,
          seatId: seat.id,
          sectionId: section.id,
          sectionName: section.name,
          rowId: row.id,
          rowLabel: row.label,
          seatLabel: seat.label,
        });
        seatIndex += 1;
      }
    }
  }

  return seats;
}

function paletteFromDocument(document: SeatMapDocument): SeatPalette {
  const palette: Array<[number, number, number, number]> = DEFAULT_SEAT_PALETTE.map((color) => [
    color[0],
    color[1],
    color[2],
    color[3],
  ]);

  for (let index = 0; index < Math.min(palette.length, document.categories.length); index += 1) {
    const parsedColor = parseHexColor(document.categories[index].color);

    if (parsedColor) {
      palette[index] = parsedColor;
    }
  }

  return palette;
}

function parseHexColor(value: string): [number, number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(value.trim());

  if (!match) {
    return null;
  }

  const color = Number.parseInt(match[1], 16);
  return [((color >> 16) & 0xff) / 255, ((color >> 8) & 0xff) / 255, (color & 0xff) / 255, 1];
}
