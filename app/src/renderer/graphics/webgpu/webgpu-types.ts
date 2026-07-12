export const WEBGPU_BUFFER_USAGE = {
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
} as const;

export const WEBGPU_TEXTURE_USAGE = {
  RENDER_ATTACHMENT: 0x0010,
} as const;

export const WEBGPU_SHADER_STAGE = {
  VERTEX: 0x1,
  FRAGMENT: 0x2,
} as const;

export interface WebGpuApi {
  requestAdapter(options?: object): Promise<WebGpuAdapter | null>;
  getPreferredCanvasFormat(): string;
}

export interface WebGpuAdapter {
  requestDevice(descriptor?: object): Promise<WebGpuDeviceHandle>;
}

export interface WebGpuDeviceLostInfo {
  readonly reason?: string;
  readonly message: string;
}

export interface WebGpuQueue {
  writeBuffer(
    buffer: WebGpuBufferHandle,
    bufferOffset: number,
    data: ArrayBuffer | ArrayBufferView,
    dataOffset?: number,
    size?: number,
  ): void;
  submit(commandBuffers: readonly WebGpuCommandBuffer[]): void;
}

export interface WebGpuDeviceHandle {
  readonly queue: WebGpuQueue;
  readonly lost: Promise<WebGpuDeviceLostInfo>;
  createBuffer(descriptor: object): WebGpuBufferHandle;
  createShaderModule(descriptor: object): WebGpuShaderModule;
  createBindGroupLayout(descriptor: object): WebGpuBindGroupLayout;
  createPipelineLayout(descriptor: object): WebGpuPipelineLayout;
  createRenderPipeline(descriptor: object): WebGpuRenderPipeline;
  createBindGroup(descriptor: object): WebGpuBindGroup;
  createCommandEncoder(descriptor?: object): WebGpuCommandEncoder;
  pushErrorScope(filter: 'validation'): void;
  popErrorScope(): Promise<WebGpuError | null>;
  addEventListener?(
    type: 'uncapturederror',
    listener: (event: WebGpuUncapturedErrorEvent) => void,
  ): void;
  destroy?(): void;
}

export interface WebGpuBufferHandle {
  destroy?(): void;
}

export interface WebGpuShaderModule {
  compilationInfo?(): Promise<WebGpuCompilationInfo>;
}

export interface WebGpuCompilationInfo {
  readonly messages: readonly WebGpuCompilationMessage[];
}

export interface WebGpuCompilationMessage {
  readonly type: 'error' | 'warning' | 'info';
  readonly message: string;
  readonly lineNum?: number;
  readonly linePos?: number;
  readonly offset?: number;
  readonly length?: number;
}

export interface WebGpuError {
  readonly message: string;
}

export interface WebGpuUncapturedErrorEvent {
  readonly error: WebGpuError;
}

export type WebGpuBindGroupLayout = object;
export type WebGpuPipelineLayout = object;
export type WebGpuRenderPipeline = object;
export type WebGpuBindGroup = object;
export type WebGpuTextureView = object;
export type WebGpuCommandBuffer = object;

export interface WebGpuTexture {
  createView(descriptor?: object): WebGpuTextureView;
}

export interface WebGpuCanvasContext {
  configure(configuration: object): void;
  getCurrentTexture(): WebGpuTexture;
}

export interface WebGpuRenderPassEncoder {
  setPipeline(pipeline: WebGpuRenderPipeline): void;
  setBindGroup(index: number, bindGroup: WebGpuBindGroup, dynamicOffsets?: readonly number[]): void;
  setVertexBuffer(slot: number, buffer: WebGpuBufferHandle, offset?: number, size?: number): void;
  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void;
  end(): void;
}

export interface WebGpuCommandEncoder {
  beginRenderPass(descriptor: object): WebGpuRenderPassEncoder;
  finish(descriptor?: object): WebGpuCommandBuffer;
}

export interface WebGpuCanvasElement extends HTMLCanvasElement {
  getContext(contextId: 'webgpu'): WebGpuCanvasContext | null;
}

export interface NavigatorWithWebGpu extends Navigator {
  readonly gpu?: WebGpuApi;
}
