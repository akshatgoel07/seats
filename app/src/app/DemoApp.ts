import {
  SEAT_INSTANCE_COLOR_INDEX_OFFSET_BYTES,
  SEAT_INSTANCE_ROTATION_OFFSET_BYTES,
  SEAT_INSTANCE_SIZE_OFFSET_BYTES,
  SEAT_INSTANCE_STATE_FLAGS_OFFSET_BYTES,
  SEAT_INSTANCE_STRIDE_BYTES,
  SEAT_INSTANCE_X_OFFSET_BYTES,
  SEAT_INSTANCE_Y_OFFSET_BYTES,
  SEAT_STATE_FLAG_HOVERED,
  SEAT_STATE_FLAG_SELECTED,
  SEAT_STATE_FLAG_UNAVAILABLE,
} from '../shared/instance-layout';
import type { GraphicsBuffer } from '../renderer/graphics/RenderTypes';
import {
  DEFAULT_SEAT_PALETTE,
  SEAT_PALETTE_COLOR_COUNT,
  createSeatUniformData,
} from '../renderer/graphics/shaders/shader-contract';
import { WebGpuDevice } from '../renderer/graphics/webgpu/WebGpuDevice';
import { WebGpuSeatPipeline } from '../renderer/graphics/webgpu/WebGpuSeatPipeline';

export type DemoRenderStatus =
  | { readonly state: 'initializing' }
  | { readonly state: 'unsupported'; readonly reason: string }
  | { readonly state: 'rendered'; readonly backend: 'webgpu'; readonly instanceCount: number }
  | { readonly state: 'lost'; readonly reason: string; readonly message: string }
  | { readonly state: 'error'; readonly reason: string };

export interface DemoAppOptions {
  readonly rows?: number;
  readonly columns?: number;
}

interface DemoGlobal {
  __seatLayoutDemoStatus?: DemoRenderStatus;
}

interface DemoInstanceData {
  readonly data: Uint8Array;
  readonly instanceCount: number;
  readonly bounds: Bounds;
}

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export class DemoApp {
  private device: WebGpuDevice | null = null;
  private pipeline: WebGpuSeatPipeline | null = null;
  private instanceBuffer: GraphicsBuffer | null = null;
  private instanceData: DemoInstanceData | null = null;
  private disposed = false;

  private readonly handleResize = () => {
    if (!this.device || !this.pipeline || !this.instanceBuffer || !this.instanceData) {
      return;
    }

    this.render();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: DemoAppOptions = {},
  ) {}

  mount(): void {
    this.setStatus({ state: 'initializing' });
    window.addEventListener('resize', this.handleResize);
    void this.start();
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.handleResize);
    this.instanceBuffer?.dispose();
    this.device?.dispose();
  }

  private async start(): Promise<void> {
    const supportStatus = await WebGpuDevice.detectSupport();

    if (!supportStatus.supported) {
      this.setStatus({
        state: 'unsupported',
        reason: supportStatus.reason ?? 'WebGPU is unavailable',
      });
      return;
    }

    try {
      const device = new WebGpuDevice(this.canvas, {
        onDeviceLost: (event) => {
          this.setStatus({
            state: 'lost',
            reason: event.reason,
            message: event.message,
          });
        },
        onValidationError: (error) => {
          this.setStatus({
            state: 'error',
            reason: error.message,
          });
        },
      });

      await device.initialize();

      if (this.disposed) {
        device.dispose();
        return;
      }

      const instanceData = createDemoInstanceData(
        this.options.rows ?? 100,
        this.options.columns ?? 100,
      );
      const instanceBuffer = device.createBuffer({
        label: 'demo-seat-instances',
        sizeBytes: instanceData.data.byteLength,
        usages: ['vertex', 'copy-dst'],
        instanceStrideBytes: SEAT_INSTANCE_STRIDE_BYTES,
      });

      device.uploadBuffer(instanceBuffer, instanceData.data, {
        dirtyRanges: [{ startInstance: 0, instanceCount: instanceData.instanceCount }],
        instanceStrideBytes: SEAT_INSTANCE_STRIDE_BYTES,
      });

      const pipeline = await WebGpuSeatPipeline.create(device);

      if (this.disposed) {
        instanceBuffer.dispose();
        device.dispose();
        return;
      }

      this.device = device;
      this.pipeline = pipeline;
      this.instanceBuffer = instanceBuffer;
      this.instanceData = instanceData;
      this.render();
    } catch (error) {
      this.setStatus({
        state: 'error',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private render(): void {
    const device = this.device;
    const pipeline = this.pipeline;
    const instanceBuffer = this.instanceBuffer;
    const instanceData = this.instanceData;

    if (!device || !pipeline || !instanceBuffer || !instanceData) {
      return;
    }

    try {
      device.resize();
      const drawingBufferSize = device.getDrawingBufferSize();
      const viewProjection = createFitToBoundsViewProjection(
        instanceData.bounds,
        drawingBufferSize.width,
        drawingBufferSize.height,
      );
      const uniformData = createSeatUniformData({
        viewProjection,
        palette: DEFAULT_SEAT_PALETTE,
      });

      device.encodeDraw(
        uniformData,
        pipeline,
        { instanceBuffer },
        { startInstance: 0, instanceCount: instanceData.instanceCount },
      );
      device.submit();
      this.setStatus({
        state: 'rendered',
        backend: 'webgpu',
        instanceCount: instanceData.instanceCount,
      });
    } catch (error) {
      this.setStatus({
        state: 'error',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private setStatus(status: DemoRenderStatus): void {
    this.canvas.dataset.rendererStatus = status.state;

    if ('reason' in status) {
      this.canvas.dataset.rendererReason = status.reason;
    } else {
      delete this.canvas.dataset.rendererReason;
    }

    (globalThis as typeof globalThis & DemoGlobal).__seatLayoutDemoStatus = status;
  }
}

function createDemoInstanceData(rows: number, columns: number): DemoInstanceData {
  const instanceCount = rows * columns;
  const buffer = new ArrayBuffer(instanceCount * SEAT_INSTANCE_STRIDE_BYTES);
  const view = new DataView(buffer);
  const spacing = 10;
  const seatSize = 6.8;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const byteOffset = index * SEAT_INSTANCE_STRIDE_BYTES;
      const x = column * spacing;
      const y = row * spacing;
      let stateFlags = 0;

      if (index % 41 === 0) {
        stateFlags |= SEAT_STATE_FLAG_SELECTED;
      }

      if (index % 67 === 0) {
        stateFlags |= SEAT_STATE_FLAG_HOVERED;
      }

      if (index % 13 === 0) {
        stateFlags |= SEAT_STATE_FLAG_UNAVAILABLE;
      }

      view.setFloat32(byteOffset + SEAT_INSTANCE_X_OFFSET_BYTES, x, true);
      view.setFloat32(byteOffset + SEAT_INSTANCE_Y_OFFSET_BYTES, y, true);
      view.setFloat32(byteOffset + SEAT_INSTANCE_SIZE_OFFSET_BYTES, seatSize, true);
      view.setFloat32(byteOffset + SEAT_INSTANCE_ROTATION_OFFSET_BYTES, 0, true);
      view.setUint32(
        byteOffset + SEAT_INSTANCE_COLOR_INDEX_OFFSET_BYTES,
        (row + column) % SEAT_PALETTE_COLOR_COUNT,
        true,
      );
      view.setUint32(byteOffset + SEAT_INSTANCE_STATE_FLAGS_OFFSET_BYTES, stateFlags, true);
    }
  }

  return {
    data: new Uint8Array(buffer),
    instanceCount,
    bounds: {
      minX: -spacing,
      minY: -spacing,
      maxX: (columns - 1) * spacing + spacing,
      maxY: (rows - 1) * spacing + spacing,
    },
  };
}

function createFitToBoundsViewProjection(
  bounds: Bounds,
  pixelWidth: number,
  pixelHeight: number,
): number[] {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const viewAspect = pixelWidth / pixelHeight;
  const worldAspect = width / height;
  let minX = bounds.minX;
  let maxX = bounds.maxX;
  let minY = bounds.minY;
  let maxY = bounds.maxY;

  if (viewAspect > worldAspect) {
    const nextWidth = height * viewAspect;
    const delta = (nextWidth - width) * 0.5;
    minX -= delta;
    maxX += delta;
  } else {
    const nextHeight = width / viewAspect;
    const delta = (nextHeight - height) * 0.5;
    minY -= delta;
    maxY += delta;
  }

  const scaleX = 2 / (maxX - minX);
  const scaleY = -2 / (maxY - minY);
  const translateX = -(maxX + minX) / (maxX - minX);
  const translateY = (maxY + minY) / (maxY - minY);

  return [scaleX, 0, 0, 0, 0, scaleY, 0, 0, 0, 0, 1, 0, translateX, translateY, 0, 1];
}
