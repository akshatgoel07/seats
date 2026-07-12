import { describe, expect, it } from 'vitest';

import { SeatRenderer, type SeatLayoutCoreLike } from '../../renderer/SeatRenderer';
import type { GraphicsDevice } from '../../renderer/graphics/GraphicsDevice';
import type {
  GraphicsBuffer,
  GraphicsPipeline,
  RenderBackend,
  StableDescriptorValue,
} from '../../renderer/graphics/RenderTypes';
import { SEAT_UNIFORM_STRUCT_SIZE_BYTES } from '../../renderer/graphics/shaders/shader-contract';
import {
  SEAT_INSTANCE_STRIDE_BYTES,
  SEAT_INSTANCE_WORDS,
  SEAT_STATE_FLAG_HOVERED,
  SEAT_STATE_FLAG_SELECTED,
  SEAT_STATE_FLAG_UNAVAILABLE,
} from '../../shared/instance-layout';
import type { SeatLayoutEvents } from '../../shared/events';
import type { FlattenedSeatMap, SeatMapDocument } from '../../shared/seat-map';
import type { SeatInstanceBufferViews, WasmRangeBufferView } from '../../wasm/SeatLayoutCore';

type CanvasListener = (event: PointerEvent & MouseEvent) => void;

class MockCore implements SeatLayoutCoreLike {
  hitIndex = -1;
  readonly hitTestCalls: Array<{
    readonly x: number;
    readonly y: number;
    readonly radius: number;
  }> = [];
  readonly setStateFlagCalls: Array<{ readonly index: number; readonly flags: number }> = [];

  private count = 0;
  private f32 = new Float32Array();
  private u32 = new Uint32Array();
  private bytes = new Uint8Array();

  get instanceCount(): number {
    return this.count;
  }

  get instanceStrideBytes(): number {
    return SEAT_INSTANCE_STRIDE_BYTES;
  }

  get instanceViews(): SeatInstanceBufferViews {
    return {
      f32: this.f32,
      u32: this.u32,
      bytes: this.bytes,
    };
  }

  get dirtyRanges(): WasmRangeBufferView {
    return {
      data: new Uint32Array(),
      length: 0,
      rangeCount: 0,
    };
  }

  loadFlattened(flat: FlattenedSeatMap): void {
    const buffer = new ArrayBuffer(flat.count * SEAT_INSTANCE_STRIDE_BYTES);
    this.count = flat.count;
    this.f32 = new Float32Array(buffer);
    this.u32 = new Uint32Array(buffer);
    this.bytes = new Uint8Array(buffer);

    for (let index = 0; index < flat.count; index += 1) {
      const base = index * SEAT_INSTANCE_WORDS;
      this.f32[base + 0] = flat.x[index];
      this.f32[base + 1] = flat.y[index];
      this.f32[base + 2] = flat.size[index];
      this.f32[base + 3] = flat.rotation[index];
      this.u32[base + 4] = flat.colorIndex[index];
      this.u32[base + 5] = flat.stateFlags[index];
    }
  }

  queryViewport(): WasmRangeBufferView {
    return {
      data: new Uint32Array(),
      length: 0,
      rangeCount: 0,
    };
  }

  hitTest(x: number, y: number, radius: number): number {
    this.hitTestCalls.push({ x, y, radius });
    return this.hitIndex;
  }

  setStateFlags(index: number, flags: number): boolean {
    if (index < 0 || index >= this.count) {
      return false;
    }

    this.u32[index * SEAT_INSTANCE_WORDS + 5] = flags >>> 0;
    this.setStateFlagCalls.push({ index, flags: flags >>> 0 });
    return true;
  }

  clearDirtyRanges(): void {}
}

class MockBuffer implements GraphicsBuffer {
  readonly id = 'mock-buffer';
  readonly sizeBytes = 0;
  readonly usages: GraphicsBuffer['usages'] = ['vertex', 'copy-dst'];

  dispose(): void {}
}

class MockGraphicsDevice implements GraphicsDevice {
  readonly backend: RenderBackend = 'webgpu';

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  resize(): void {}

  createBuffer(): GraphicsBuffer {
    return new MockBuffer();
  }

  uploadBuffer(): void {}

  encodeDraw(): void {}

  submit(): void {}

  getOrCreatePipeline<TPipeline>(
    descriptor: StableDescriptorValue,
    factory: () => TPipeline,
  ): TPipeline {
    void descriptor;
    return factory();
  }

  getOrCreateBindGroup<TBindGroup>(
    descriptor: StableDescriptorValue,
    factory: () => TBindGroup,
  ): TBindGroup {
    void descriptor;
    return factory();
  }

  getDrawingBufferSize(): { width: number; height: number } {
    return { width: 100, height: 100 };
  }

  dispose(): void {}
}

const mockPipeline: GraphicsPipeline<unknown> = {
  id: 'mock-seat-pipeline',
  descriptor: 'mock-seat-pipeline',
  uniformStructSizeBytes: SEAT_UNIFORM_STRUCT_SIZE_BYTES,
  encodeDraw: () => {},
};

describe('SeatRenderer interaction layer', () => {
  it('throttles hover picking to one animation frame and toggles the hover flag', async () => {
    const { canvas, core, raf, renderer } = await createRendererFixture();
    const hovers: SeatLayoutEvents['seatHover'][] = [];
    renderer.on('seatHover', (payload) => {
      hovers.push(payload);
    });

    core.hitIndex = 0;
    canvas.emit('pointermove', pointerEvent(1, 50, 50));
    canvas.emit('pointermove', pointerEvent(1, 51, 50));

    expect(core.hitTestCalls).toHaveLength(0);
    expect(raf.pendingCount()).toBe(1);

    raf.flush();

    expect(core.hitTestCalls).toHaveLength(1);
    expect(core.hitTestCalls[0].radius).toBeCloseTo(8 / renderer.camera.getZoom());
    expect(stateFlags(core, 0) & SEAT_STATE_FLAG_HOVERED).toBe(SEAT_STATE_FLAG_HOVERED);
    expect(canvas.style.cursor).toBe('pointer');
    expect(hovers.map((payload) => payload && payload.seatIndex)).toEqual([0]);

    core.hitIndex = -1;
    canvas.emit('pointermove', pointerEvent(1, 75, 50));
    raf.flush();

    expect(stateFlags(core, 0) & SEAT_STATE_FLAG_HOVERED).toBe(0);
    expect(canvas.style.cursor).toBe('');
    expect(hovers.map((payload) => payload && payload.seatIndex)).toEqual([0, null]);

    renderer.dispose();
  });

  it('toggles available seats and rejects unavailable seats', async () => {
    const { canvas, core, renderer } = await createRendererFixture();
    const seatSelects: SeatLayoutEvents['seatSelect'][] = [];
    const selectionChanges: SeatLayoutEvents['selectionChange'][] = [];
    renderer.on('seatSelect', (payload) => {
      seatSelects.push(payload);
    });
    renderer.on('selectionChange', (payload) => {
      selectionChanges.push(payload);
    });

    core.hitIndex = 0;
    tap(canvas, 50, 50);

    expect(renderer.getSelection()).toEqual([0]);
    expect(stateFlags(core, 0) & SEAT_STATE_FLAG_SELECTED).toBe(SEAT_STATE_FLAG_SELECTED);
    expect(seatSelects.map(selectionEventSummary)).toEqual([{ seatIndex: 0, selected: true }]);
    expect(selectionChanges.map((payload) => payload.selectedIndices)).toEqual([[0]]);

    tap(canvas, 50, 50);

    expect(renderer.getSelection()).toEqual([]);
    expect(stateFlags(core, 0) & SEAT_STATE_FLAG_SELECTED).toBe(0);
    expect(seatSelects.map(selectionEventSummary)).toEqual([
      { seatIndex: 0, selected: true },
      { seatIndex: 0, selected: false },
    ]);
    expect(selectionChanges.map((payload) => payload.selectedIndices)).toEqual([[0], []]);

    core.hitIndex = 1;
    tap(canvas, 50, 50);

    expect(stateFlags(core, 1) & SEAT_STATE_FLAG_UNAVAILABLE).toBe(SEAT_STATE_FLAG_UNAVAILABLE);
    expect(renderer.getSelection()).toEqual([]);
    expect(seatSelects).toHaveLength(2);
    expect(selectionChanges).toHaveLength(2);

    renderer.dispose();
  });

  it('setSelection filters unavailable seats, emits sorted payloads, and clearSelection clears all', async () => {
    const { core, renderer } = await createRendererFixture();
    const selectionChanges: SeatLayoutEvents['selectionChange'][] = [];
    renderer.on('selectionChange', (payload) => {
      selectionChanges.push(payload);
    });

    renderer.setSelection([2, 1, 0]);

    expect(renderer.getSelection()).toEqual([0, 2]);
    expect(stateFlags(core, 0) & SEAT_STATE_FLAG_SELECTED).toBe(SEAT_STATE_FLAG_SELECTED);
    expect(stateFlags(core, 1) & SEAT_STATE_FLAG_SELECTED).toBe(0);
    expect(stateFlags(core, 2) & SEAT_STATE_FLAG_SELECTED).toBe(SEAT_STATE_FLAG_SELECTED);
    expect(selectionChanges.map((payload) => payload.selectedIndices)).toEqual([[0, 2]]);

    renderer.clearSelection();

    expect(renderer.getSelection()).toEqual([]);
    expect(selectionChanges.map((payload) => payload.selectedIndices)).toEqual([[0, 2], []]);

    renderer.dispose();
  });
});

async function createRendererFixture(): Promise<{
  readonly canvas: FakeCanvas;
  readonly core: MockCore;
  readonly raf: MockRaf;
  readonly renderer: SeatRenderer;
}> {
  const canvas = fakeCanvas();
  const core = new MockCore();
  const raf = new MockRaf();
  const renderer = new SeatRenderer(canvas, {
    core,
    device: new MockGraphicsDevice(),
    pipeline: mockPipeline,
    autoRender: false,
    attachCameraEvents: false,
    attachInteractionEvents: true,
    requestAnimationFrame: raf.requestAnimationFrame,
    cancelAnimationFrame: raf.cancelAnimationFrame,
  });

  await renderer.initialize();
  renderer.loadDocument(createInteractionDocument());
  return { canvas, core, raf, renderer };
}

function createInteractionDocument(): SeatMapDocument {
  return {
    id: 'interaction-test',
    name: 'Interaction test',
    bounds: { minX: -1, minY: -1, maxX: 3, maxY: 1 },
    categories: [{ id: 'standard', name: 'Standard', color: '#2563eb' }],
    sections: [
      {
        id: 'section-a',
        name: 'Section A',
        transform: { x: 0, y: 0, rotation: 0 },
        rows: [
          {
            id: 'row-a',
            label: 'A',
            seats: [
              {
                id: 'seat-0',
                label: '1',
                x: 0,
                y: 0,
                size: 1,
                rotation: 0,
                categoryIndex: 0,
                status: 'available',
              },
              {
                id: 'seat-1',
                label: '2',
                x: 1,
                y: 0,
                size: 1,
                rotation: 0,
                categoryIndex: 0,
                status: 'sold',
              },
              {
                id: 'seat-2',
                label: '3',
                x: 2,
                y: 0,
                size: 1,
                rotation: 0,
                categoryIndex: 0,
                status: 'available',
              },
            ],
          },
        ],
      },
    ],
  };
}

function stateFlags(core: MockCore, index: number): number {
  return core.instanceViews.u32[index * SEAT_INSTANCE_WORDS + 5];
}

function selectionEventSummary(payload: SeatLayoutEvents['seatSelect']): {
  readonly seatIndex: number;
  readonly selected: boolean;
} {
  return { seatIndex: payload.seatIndex, selected: payload.selected };
}

function tap(canvas: FakeCanvas, clientX: number, clientY: number): void {
  canvas.emit('pointerdown', pointerEvent(1, clientX, clientY));
  canvas.emit('pointerup', pointerEvent(1, clientX, clientY));
  canvas.emit('click', mouseEvent(clientX, clientY));
}

function pointerEvent(
  pointerId: number,
  clientX: number,
  clientY: number,
): PointerEvent & MouseEvent {
  return {
    pointerId,
    clientX,
    clientY,
  } as PointerEvent & MouseEvent;
}

function mouseEvent(clientX: number, clientY: number): PointerEvent & MouseEvent {
  return {
    clientX,
    clientY,
  } as PointerEvent & MouseEvent;
}

interface FakeCanvas extends HTMLCanvasElement {
  readonly style: CSSStyleDeclaration & { cursor: string };
  emit(type: string, event: PointerEvent & MouseEvent): void;
}

function fakeCanvas(): FakeCanvas {
  const listeners = new Map<string, CanvasListener[]>();
  const style = { cursor: '' } as CSSStyleDeclaration & { cursor: string };
  const canvas = {
    width: 100,
    height: 100,
    style,
    addEventListener(type: string, listener: CanvasListener) {
      const typeListeners = listeners.get(type) ?? [];
      typeListeners.push(listener);
      listeners.set(type, typeListeners);
    },
    removeEventListener(type: string, listener: CanvasListener) {
      const typeListeners = listeners.get(type) ?? [];
      listeners.set(
        type,
        typeListeners.filter((candidate) => candidate !== listener),
      );
    },
    getBoundingClientRect() {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 100,
        bottom: 100,
        width: 100,
        height: 100,
        toJSON: () => ({}),
      };
    },
    emit(type: string, event: PointerEvent & MouseEvent) {
      for (const listener of listeners.get(type) ?? []) {
        listener(event);
      }
    },
  };

  return canvas as unknown as FakeCanvas;
}

class MockRaf {
  private nextHandle = 1;
  private readonly callbacks = new Map<number, FrameRequestCallback>();

  readonly requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  };

  readonly cancelAnimationFrame = (handle: number): void => {
    this.callbacks.delete(handle);
  };

  flush(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();

    for (const callback of callbacks) {
      callback(0);
    }
  }

  pendingCount(): number {
    return this.callbacks.size;
  }
}
