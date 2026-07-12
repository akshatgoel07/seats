import { readFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it } from 'vitest';

import { SeatRenderer } from '../../renderer/SeatRenderer';
import type { GraphicsDevice } from '../../renderer/graphics/GraphicsDevice';
import type {
  DrawInstanceRange,
  GraphicsBuffer,
  GraphicsBufferDescriptor,
  GraphicsBufferUploadOptions,
  GraphicsDrawBuffers,
  GraphicsPipeline,
  RenderBackend,
  StableDescriptorValue,
  UniformStructData,
} from '../../renderer/graphics/RenderTypes';
import {
  SEAT_LOD_FULL_GLYPH,
  SEAT_UNIFORM_LOD_LEVEL_OFFSET_BYTES,
  SEAT_UNIFORM_STRUCT_SIZE_BYTES,
} from '../../renderer/graphics/shaders/shader-contract';
import type { SeatMapDocument } from '../../shared/seat-map';
import { SeatLayoutCore } from '../../wasm/SeatLayoutCore';

type MockOperation =
  | { readonly type: 'resize' }
  | { readonly type: 'createBuffer'; readonly sizeBytes: number }
  | {
      readonly type: 'upload';
      readonly dirtyRanges: readonly DrawInstanceRange[];
    }
  | {
      readonly type: 'draw';
      readonly range: DrawInstanceRange;
      readonly lodLevel: number;
    }
  | { readonly type: 'submit' };

class MockBuffer implements GraphicsBuffer {
  readonly id = 'mock-buffer';
  disposed = false;

  constructor(
    readonly sizeBytes: number,
    readonly usages: GraphicsBuffer['usages'],
    readonly label?: string,
    readonly instanceStrideBytes?: number,
  ) {}

  dispose(): void {
    this.disposed = true;
  }
}

class MockGraphicsDevice implements GraphicsDevice {
  readonly backend: RenderBackend = 'webgpu';
  readonly operations: MockOperation[] = [];

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {}

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  resize(): void {
    this.operations.push({ type: 'resize' });
  }

  createBuffer(descriptor: GraphicsBufferDescriptor): GraphicsBuffer {
    this.operations.push({ type: 'createBuffer', sizeBytes: descriptor.sizeBytes });
    return new MockBuffer(
      descriptor.sizeBytes,
      descriptor.usages,
      descriptor.label,
      descriptor.instanceStrideBytes,
    );
  }

  uploadBuffer(
    _buffer: GraphicsBuffer,
    _data: ArrayBuffer | ArrayBufferView,
    options: GraphicsBufferUploadOptions = {},
  ): void {
    this.operations.push({
      type: 'upload',
      dirtyRanges: (options.dirtyRanges ?? []).map((range) => ({
        startInstance: range.startInstance,
        instanceCount: range.instanceCount,
      })),
    });
  }

  encodeDraw(
    uniformStructData: UniformStructData,
    _pipeline: GraphicsPipeline<unknown>,
    _buffers: GraphicsDrawBuffers,
    instanceRange: DrawInstanceRange,
  ): void {
    const bytes = uniformBytes(uniformStructData);
    const words = new Uint32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    this.operations.push({
      type: 'draw',
      range: {
        startInstance: instanceRange.startInstance,
        instanceCount: instanceRange.instanceCount,
      },
      lodLevel: words[SEAT_UNIFORM_LOD_LEVEL_OFFSET_BYTES / 4],
    });
  }

  submit(): void {
    this.operations.push({ type: 'submit' });
  }

  getOrCreatePipeline<TPipeline>(
    _descriptor: StableDescriptorValue,
    factory: () => TPipeline,
  ): TPipeline {
    return factory();
  }

  getOrCreateBindGroup<TBindGroup>(
    _descriptor: StableDescriptorValue,
    factory: () => TBindGroup,
  ): TBindGroup {
    return factory();
  }

  getDrawingBufferSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  dispose(): void {}
}

const mockPipeline: GraphicsPipeline<unknown> = {
  id: 'mock-seat-pipeline',
  descriptor: 'mock-seat-pipeline',
  uniformStructSizeBytes: SEAT_UNIFORM_STRUCT_SIZE_BYTES,
  encodeDraw: () => {},
};

let wasmBytes: Buffer;

beforeEach(async () => {
  wasmBytes = await readFile(
    new URL('../../generated/wasm/seat_layout_core/seat_layout_core_bg.wasm', import.meta.url),
  );
});

describe('SeatRenderer', () => {
  it('uploads dirty ranges before drawing only WASM-visible ranges', async () => {
    let now = 0;
    const core = await SeatLayoutCore.create(wasmBytes);
    const device = new MockGraphicsDevice(100, 100);
    const renderer = new SeatRenderer(mockCanvas(), {
      core,
      device,
      pipeline: mockPipeline,
      autoRender: false,
      attachCameraEvents: false,
      now: () => {
        now += 1;
        return now;
      },
    });

    await renderer.initialize();
    renderer.loadDocument(createCullingDocument());
    renderer.camera.setView(10, 0, 8);
    renderer.renderNow();

    const uploadIndex = device.operations.findIndex((operation) => operation.type === 'upload');
    const drawIndex = device.operations.findIndex((operation) => operation.type === 'draw');
    const upload = device.operations.find(
      (operation): operation is Extract<MockOperation, { type: 'upload' }> =>
        operation.type === 'upload',
    );
    const draws = device.operations.filter(
      (operation): operation is Extract<MockOperation, { type: 'draw' }> =>
        operation.type === 'draw',
    );

    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(drawIndex).toBeGreaterThan(uploadIndex);
    expect(upload?.dirtyRanges).toEqual([{ startInstance: 0, instanceCount: 5 }]);
    expect(draws.map((draw) => draw.range)).toEqual([{ startInstance: 0, instanceCount: 3 }]);
    expect(draws[0].lodLevel).toBe(SEAT_LOD_FULL_GLYPH);
    expect(renderer.getFrameStats().lastVisibleInstanceCount).toBe(3);
    expect(renderer.getFrameStats().lastDrawRangeCount).toBe(1);

    renderer.dispose();
  });
});

function createCullingDocument(): SeatMapDocument {
  return {
    id: 'renderer-culling-test',
    name: 'Renderer culling test',
    bounds: { minX: -1, minY: -1, maxX: 111, maxY: 1 },
    categories: [{ id: 'standard', name: 'Standard', color: '#2563eb' }],
    sections: [
      {
        id: 'section',
        name: 'Section',
        transform: { x: 0, y: 0, rotation: 0 },
        rows: [
          {
            id: 'row',
            label: 'A',
            seats: [0, 10, 20, 100, 110].map((x, index) => ({
              id: `seat-${index}`,
              label: `${index + 1}`,
              x,
              y: 0,
              size: 1,
              rotation: 0,
              categoryIndex: 0,
              status: 'available',
            })),
          },
        ],
      },
    ],
  };
}

function mockCanvas(): HTMLCanvasElement {
  return {
    width: 100,
    height: 100,
  } as HTMLCanvasElement;
}

function uniformBytes(data: UniformStructData): Uint8Array {
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }

  return new Uint8Array(data);
}
