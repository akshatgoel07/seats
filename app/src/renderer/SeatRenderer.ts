import type {
  GraphicsDevice,
  GraphicsDeviceLostEvent,
} from './graphics/GraphicsDevice';
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
import { WebGpuDevice } from './graphics/webgpu/WebGpuDevice';
import { WebGpuSeatPipeline } from './graphics/webgpu/WebGpuSeatPipeline';
import { Camera2D, type CameraRect } from './camera/Camera2D';
import { SEAT_INSTANCE_STRIDE_BYTES } from '../shared/instance-layout';
import {
  flattenSeatMap,
  type FlattenedSeatMap,
  type SeatMapDocument,
} from '../shared/seat-map';
import { SeatLayoutCore, type WasmRangeBufferView } from '../wasm/SeatLayoutCore';

export const SEAT_LOD_FULL_GLYPH_MIN_SCREEN_PX = 6;
export const TODO_SEAT_LABEL_MIN_SCREEN_PX = 18;

const INITIAL_FIT_PADDING_PX = 40;
const CULLING_MARGIN_SCREEN_PX = 32;
const FRAME_STATS_SAMPLE_COUNT = 120;
const FULL_BUFFER_UPLOAD_DIRTY_FRACTION = 1 / 3;

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
  readonly core?: SeatLayoutCore;
  readonly device?: GraphicsDevice;
  readonly pipeline?: GraphicsPipeline<unknown>;
  readonly createPipeline?: (device: GraphicsDevice) => Promise<GraphicsPipeline<unknown>>;
  readonly palette?: SeatPalette;
  readonly autoRender?: boolean;
  readonly attachCameraEvents?: boolean;
  readonly onDeviceLost?: (event: GraphicsDeviceLostEvent) => void;
  readonly onValidationError?: (error: Error) => void;
  readonly onFrame?: (stats: SeatLayoutFrameStats) => void;
  readonly onError?: (error: Error) => void;
  readonly now?: () => number;
  readonly requestAnimationFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelAnimationFrame?: (handle: number) => void;
}

interface DeviceWithDrawingBufferSize extends GraphicsDevice {
  getDrawingBufferSize(): { width: number; height: number };
}

interface FrameStatsGlobal {
  __seatLayoutFrameStats?: SeatLayoutFrameStats;
}

export class SeatRenderer {
  readonly camera = new Camera2D();

  private core: SeatLayoutCore | null = null;
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
  private detachCameraEvents: (() => void) | null = null;
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
    private readonly canvas: HTMLCanvasElement,
    private readonly options: SeatRendererOptions = {},
  ) {
    this.palette = options.palette ?? DEFAULT_SEAT_PALETTE;
    this.publishStats();
  }

  async initialize(): Promise<void> {
    if (this.core || this.device || this.pipeline) {
      return;
    }

    const core = this.options.core ?? (await SeatLayoutCore.create());
    const device = this.options.device ?? this.createDefaultDevice();
    await device.initialize();

    if (this.disposed) {
      device.dispose();
      return;
    }

    const pipeline =
      this.options.pipeline ??
      (await (this.options.createPipeline ?? createDefaultPipeline)(device));

    if (this.disposed) {
      device.dispose();
      return;
    }

    this.core = core;
    this.device = device;
    this.pipeline = pipeline;
    this.syncViewport();

    if (this.options.attachCameraEvents !== false) {
      this.detachCameraEvents = this.camera.attachToElement(this.canvas, () => {
        this.requestRender();
      });
    }
  }

  backendName(): RenderBackend {
    return this.requireDevice().backend;
  }

  get instanceCount(): number {
    return this.instanceCountValue;
  }

  getFrameStats(): SeatLayoutFrameStats {
    return this.stats;
  }

  loadDocument(document: SeatMapDocument): void {
    const core = this.requireCore();
    const device = this.requireDevice();
    const flat = flattenSeatMap(document);

    core.loadFlattened(flat);
    this.instanceCountValue = core.instanceCount;
    this.maxSeatSize = maxSeatSize(flat);
    this.palette = paletteFromDocument(document);
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

  dispose(): void {
    this.disposed = true;
    this.detachCameraEvents?.();
    this.detachCameraEvents = null;

    if (this.animationFrameHandle !== null) {
      const cancelFrame = this.options.cancelAnimationFrame ?? globalThis.cancelAnimationFrame;
      cancelFrame(this.animationFrameHandle);
      this.animationFrameHandle = null;
    }

    this.instanceBuffer?.dispose();
    this.instanceBuffer = null;
    this.device?.dispose();
    this.device = null;
    this.pipeline = null;
    this.core = null;
  }

  private readonly handleAnimationFrame: FrameRequestCallback = () => {
    this.animationFrameHandle = null;

    if (this.disposed || !this.loaded || !this.dirty) {
      return;
    }

    this.renderFrame();
  };

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

      this.recordFrame(this.now() - start, drawSummary.visibleInstanceCount, drawSummary.rangeCount, lodLevel);
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

  private recreateInstanceBuffer(device: GraphicsDevice, core: SeatLayoutCore): void {
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
    core: SeatLayoutCore,
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

  private queryVisibleRanges(core: SeatLayoutCore): WasmRangeBufferView {
    const marginWorld = Math.max(this.maxSeatSize, CULLING_MARGIN_SCREEN_PX / this.camera.getZoom());
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

  private requireCore(): SeatLayoutCore {
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
  return typeof (device as Partial<DeviceWithDrawingBufferSize>).getDrawingBufferSize === 'function';
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
  return [
    ((color >> 16) & 0xff) / 255,
    ((color >> 8) & 0xff) / 255,
    (color & 0xff) / 255,
    1,
  ];
}
