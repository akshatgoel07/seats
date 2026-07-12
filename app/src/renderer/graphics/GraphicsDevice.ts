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
} from './RenderTypes';

export interface GraphicsDeviceLostEvent {
  readonly backend: RenderBackend;
  readonly reason: string;
  readonly message: string;
}

export class GraphicsDeviceUnsupportedError extends Error {
  constructor(
    readonly backend: RenderBackend,
    message: string,
  ) {
    super(message);
    this.name = 'GraphicsDeviceUnsupportedError';
  }
}

export interface GraphicsDevice {
  readonly backend: RenderBackend;
  initialize(): Promise<void>;
  resize(widthCssPixels?: number, heightCssPixels?: number): void;
  createBuffer(descriptor: GraphicsBufferDescriptor): GraphicsBuffer;
  uploadBuffer(
    buffer: GraphicsBuffer,
    data: ArrayBuffer | ArrayBufferView,
    options?: GraphicsBufferUploadOptions,
  ): void;
  encodeDraw<TPass>(
    uniformStructData: UniformStructData,
    pipeline: GraphicsPipeline<TPass>,
    buffers: GraphicsDrawBuffers,
    instanceRange: DrawInstanceRange,
  ): void;
  submit(): void;
  getOrCreatePipeline<TPipeline>(
    descriptor: StableDescriptorValue,
    factory: () => TPipeline,
  ): TPipeline;
  getOrCreateBindGroup<TBindGroup>(
    descriptor: StableDescriptorValue,
    factory: () => TBindGroup,
  ): TBindGroup;
  dispose(): void;
}
