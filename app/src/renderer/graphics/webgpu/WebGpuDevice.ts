import {
  GraphicsDeviceUnsupportedError,
  type GraphicsDevice,
  type GraphicsDeviceLostEvent,
} from '../GraphicsDevice';
import {
  DescriptorCache,
  alignTo,
  coalesceInstanceDirtyRanges,
  createUniformBatch,
  uniformStructBytes,
  type DrawInstanceRange,
  type GraphicsBuffer,
  type GraphicsBufferDescriptor,
  type GraphicsBufferUploadOptions,
  type GraphicsBufferUsage,
  type GraphicsDrawBuffers,
  type GraphicsEncodedDraw,
  type GraphicsPipeline,
  type StableDescriptorValue,
  type UniformStructData,
} from '../RenderTypes';
import {
  WEBGPU_BUFFER_USAGE,
  WEBGPU_TEXTURE_USAGE,
  type NavigatorWithWebGpu,
  type WebGpuBindGroup,
  type WebGpuBindGroupLayout,
  type WebGpuBufferHandle,
  type WebGpuCanvasContext,
  type WebGpuCanvasElement,
  type WebGpuCompilationInfo,
  type WebGpuCompilationMessage,
  type WebGpuDeviceHandle,
  type WebGpuRenderPassEncoder,
  type WebGpuShaderModule,
} from './webgpu-types';

export interface WebGpuSupportStatus {
  readonly supported: boolean;
  readonly reason?: string;
}

export interface WebGpuDeviceOptions {
  readonly onDeviceLost?: (event: GraphicsDeviceLostEvent) => void;
  readonly onValidationError?: (error: Error) => void;
}

let nextBufferId = 1;

export class WebGpuBuffer implements GraphicsBuffer {
  readonly id: string;

  constructor(
    readonly nativeBuffer: WebGpuBufferHandle,
    readonly sizeBytes: number,
    readonly usages: readonly GraphicsBufferUsage[],
    readonly label?: string,
    readonly instanceStrideBytes?: number,
  ) {
    this.id = `webgpu-buffer-${nextBufferId}`;
    nextBufferId += 1;
  }

  dispose(): void {
    this.nativeBuffer.destroy?.();
  }
}

export class WebGpuDevice implements GraphicsDevice {
  readonly backend = 'webgpu' as const;

  private readonly pipelineCache = new DescriptorCache<unknown>();
  private readonly bindGroupCache = new DescriptorCache<unknown>();
  private readonly encodedDraws: GraphicsEncodedDraw<WebGpuRenderPassEncoder>[] = [];
  private adapterFormat = 'bgra8unorm';
  private context: WebGpuCanvasContext | null = null;
  private device: WebGpuDeviceHandle | null = null;
  private uniformBuffer: WebGpuBufferHandle | null = null;
  private uniformBufferSizeBytes = 0;
  private uniformBufferVersion = 0;
  private disposed = false;
  private drawingBufferWidth = 1;
  private drawingBufferHeight = 1;
  private validationError: Error | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: WebGpuDeviceOptions = {},
  ) {}

  static async detectSupport(): Promise<WebGpuSupportStatus> {
    const gpu = getNavigatorGpu();

    if (!gpu) {
      return { supported: false, reason: 'navigator.gpu is unavailable' };
    }

    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });

    if (!adapter) {
      return { supported: false, reason: 'navigator.gpu.requestAdapter() returned null' };
    }

    try {
      const device = await adapter.requestDevice();
      device.destroy?.();
      return { supported: true };
    } catch (error) {
      return {
        supported: false,
        reason: `requestDevice() failed: ${errorMessage(error)}`,
      };
    }
  }

  async initialize(): Promise<void> {
    if (this.device && this.context) {
      return;
    }

    const gpu = getNavigatorGpu();

    if (!gpu) {
      throw new GraphicsDeviceUnsupportedError('webgpu', 'navigator.gpu is unavailable');
    }

    const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });

    if (!adapter) {
      throw new GraphicsDeviceUnsupportedError(
        'webgpu',
        'navigator.gpu.requestAdapter() returned null',
      );
    }

    this.device = await adapter.requestDevice();
    this.adapterFormat = gpu.getPreferredCanvasFormat();
    this.context = (this.canvas as WebGpuCanvasElement).getContext('webgpu');

    if (!this.context) {
      throw new GraphicsDeviceUnsupportedError('webgpu', 'Canvas WebGPU context is unavailable');
    }

    this.device.lost.then((info) => {
      if (this.disposed) {
        return;
      }

      this.options.onDeviceLost?.({
        backend: this.backend,
        reason: info.reason ?? 'unknown',
        message: info.message,
      });
    });
    this.device.addEventListener?.('uncapturederror', (event) => {
      this.recordValidationError('WebGPU uncaptured validation error', event.error.message);
    });

    this.resize();
  }

  resize(widthCssPixels?: number, heightCssPixels?: number): void {
    const context = this.context;
    const device = this.device;

    if (!context || !device) {
      return;
    }

    const dpr = globalThis.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.floor(widthCssPixels ?? fallbackCssWidth(this.canvas)));
    const cssHeight = Math.max(1, Math.floor(heightCssPixels ?? fallbackCssHeight(this.canvas)));
    const pixelWidth = Math.max(1, Math.floor(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.floor(cssHeight * dpr));

    if (this.canvas.width !== pixelWidth) {
      this.canvas.width = pixelWidth;
    }

    if (this.canvas.height !== pixelHeight) {
      this.canvas.height = pixelHeight;
    }

    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.drawingBufferWidth = pixelWidth;
    this.drawingBufferHeight = pixelHeight;

    context.configure({
      device,
      format: this.adapterFormat,
      usage: WEBGPU_TEXTURE_USAGE.RENDER_ATTACHMENT,
      alphaMode: 'premultiplied',
    });
  }

  createBuffer(descriptor: GraphicsBufferDescriptor): GraphicsBuffer {
    const device = this.requireDevice();

    if (descriptor.sizeBytes <= 0) {
      throw new Error(`Expected a positive buffer size, received ${descriptor.sizeBytes}`);
    }

    const nativeBuffer = device.createBuffer({
      label: descriptor.label,
      size: descriptor.sizeBytes,
      usage: bufferUsageFlags(descriptor.usages),
    });

    return new WebGpuBuffer(
      nativeBuffer,
      descriptor.sizeBytes,
      descriptor.usages,
      descriptor.label,
      descriptor.instanceStrideBytes,
    );
  }

  uploadBuffer(
    buffer: GraphicsBuffer,
    data: ArrayBuffer | ArrayBufferView,
    options: GraphicsBufferUploadOptions = {},
  ): void {
    const device = this.requireDevice();
    const webGpuBuffer = requireWebGpuBuffer(buffer);
    const sourceBytes = uniformStructBytes(data);
    const dirtyRanges = options.dirtyRanges ?? [];

    if (dirtyRanges.length === 0) {
      device.queue.writeBuffer(
        webGpuBuffer.nativeBuffer,
        0,
        sourceBytes,
        0,
        sourceBytes.byteLength,
      );
      return;
    }

    const instanceStrideBytes =
      options.instanceStrideBytes ?? buffer.instanceStrideBytes ?? webGpuBuffer.instanceStrideBytes;

    if (!instanceStrideBytes) {
      throw new Error('Dirty-range uploads require an instance stride in bytes');
    }

    for (const range of coalesceInstanceDirtyRanges(dirtyRanges)) {
      const byteOffset = range.startInstance * instanceStrideBytes;
      const byteLength = range.instanceCount * instanceStrideBytes;

      if (byteOffset + byteLength > sourceBytes.byteLength) {
        throw new Error('Dirty range exceeds the supplied source buffer');
      }

      device.queue.writeBuffer(
        webGpuBuffer.nativeBuffer,
        byteOffset,
        sourceBytes,
        byteOffset,
        byteLength,
      );
    }
  }

  encodeDraw<TPass>(
    uniformStructData: UniformStructData,
    pipeline: GraphicsPipeline<TPass>,
    buffers: GraphicsDrawBuffers,
    instanceRange: DrawInstanceRange,
  ): void {
    this.throwIfValidationFailed();
    this.encodedDraws.push({
      uniformStructData,
      pipeline: pipeline as GraphicsPipeline<WebGpuRenderPassEncoder>,
      buffers,
      instanceRange,
    });
  }

  submit(): void {
    this.throwIfValidationFailed();

    if (this.encodedDraws.length === 0) {
      return;
    }

    const device = this.requireDevice();
    const context = this.requireContext();
    const uniformBatch = createUniformBatch(this.encodedDraws);
    this.ensureUniformBuffer(uniformBatch.data.byteLength);

    const uniformBuffer = this.uniformBuffer;

    if (!uniformBuffer) {
      throw new Error('Uniform buffer was not created');
    }

    device.queue.writeBuffer(uniformBuffer, 0, uniformBatch.data, 0, uniformBatch.data.byteLength);

    try {
      this.captureValidationErrorsLater('WebGPU submit', () => {
        const encoder = device.createCommandEncoder({ label: 'seat-layout-webgpu-frame' });
        const pass = encoder.beginRenderPass({
          label: 'seat-layout-webgpu-render-pass',
          colorAttachments: [
            {
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 1, g: 1, b: 1, a: 1 },
              loadOp: 'clear',
              storeOp: 'store',
            },
          ],
        });

        this.encodedDraws.forEach((draw, index) => {
          draw.pipeline.encodeDraw(pass, draw, uniformBatch.plan.offsets[index]);
        });
        pass.end();
        device.queue.submit([encoder.finish()]);
      });
    } finally {
      this.encodedDraws.length = 0;
    }
  }

  getOrCreatePipeline<TPipeline>(
    descriptor: StableDescriptorValue,
    factory: () => TPipeline,
  ): TPipeline {
    return this.pipelineCache.getOrCreate(descriptor, factory) as TPipeline;
  }

  getOrCreateBindGroup<TBindGroup>(
    descriptor: StableDescriptorValue,
    factory: () => TBindGroup,
  ): TBindGroup {
    return this.bindGroupCache.getOrCreate(descriptor, factory) as TBindGroup;
  }

  get presentationFormat(): string {
    return this.adapterFormat;
  }

  get nativeDevice(): WebGpuDeviceHandle {
    return this.requireDevice();
  }

  createValidatedShaderModule(descriptor: {
    readonly label: string;
    readonly code: string;
  }): Promise<WebGpuShaderModule> {
    return this.createValidatedShaderModuleAsync(descriptor);
  }

  async createValidatedRenderPipeline<TPipeline>(
    label: string,
    factory: () => TPipeline,
  ): Promise<TPipeline> {
    return this.captureValidationErrors(label, factory);
  }

  getDrawingBufferSize(): { width: number; height: number } {
    return {
      width: this.drawingBufferWidth,
      height: this.drawingBufferHeight,
    };
  }

  getValidationError(): Error | null {
    return this.validationError;
  }

  private async createValidatedShaderModuleAsync(descriptor: {
    readonly label: string;
    readonly code: string;
  }): Promise<WebGpuShaderModule> {
    const shaderModule = await this.captureValidationErrors(descriptor.label, () =>
      this.requireDevice().createShaderModule(descriptor),
    );
    await this.validateShaderCompilationInfo(descriptor.label, shaderModule);
    return shaderModule;
  }

  getUniformBindGroup(
    descriptor: StableDescriptorValue,
    layout: WebGpuBindGroupLayout,
    uniformStructSizeBytes: number,
  ): WebGpuBindGroup {
    const device = this.requireDevice();
    const uniformBuffer = this.uniformBuffer;

    if (!uniformBuffer) {
      throw new Error('Uniform bind group requested before submit prepared a uniform buffer');
    }

    return this.getOrCreateBindGroup(
      {
        descriptor,
        uniformBufferVersion: this.uniformBufferVersion,
        uniformStructSizeBytes,
      },
      () =>
        device.createBindGroup({
          label: 'seat-layout-uniform-bind-group',
          layout,
          entries: [
            {
              binding: 0,
              resource: {
                buffer: uniformBuffer,
                offset: 0,
                size: uniformStructSizeBytes,
              },
            },
          ],
        }),
    );
  }

  dispose(): void {
    this.disposed = true;
    this.encodedDraws.length = 0;
    this.pipelineCache.clear();
    this.bindGroupCache.clear();
    this.uniformBuffer?.destroy?.();
    this.uniformBuffer = null;
    this.uniformBufferSizeBytes = 0;
    this.device?.destroy?.();
    this.device = null;
    this.context = null;
  }

  private ensureUniformBuffer(requiredByteLength: number): void {
    const device = this.requireDevice();

    if (this.uniformBuffer && this.uniformBufferSizeBytes >= requiredByteLength) {
      return;
    }

    const nextSizeBytes = alignTo(
      Math.max(requiredByteLength, this.uniformBufferSizeBytes * 2, 256),
      256,
    );

    this.uniformBuffer?.destroy?.();
    this.uniformBuffer = device.createBuffer({
      label: 'seat-layout-uniform-batch-buffer',
      size: nextSizeBytes,
      usage: WEBGPU_BUFFER_USAGE.UNIFORM | WEBGPU_BUFFER_USAGE.COPY_DST,
    });
    this.uniformBufferSizeBytes = nextSizeBytes;
    this.uniformBufferVersion += 1;
    this.bindGroupCache.clear();
  }

  private requireDevice(): WebGpuDeviceHandle {
    if (!this.device) {
      throw new Error('WebGPU device has not been initialized');
    }

    return this.device;
  }

  private requireContext(): WebGpuCanvasContext {
    if (!this.context) {
      throw new Error('WebGPU canvas context has not been initialized');
    }

    return this.context;
  }

  private async captureValidationErrors<TValue>(label: string, action: () => TValue): Promise<TValue> {
    this.throwIfValidationFailed();

    const device = this.requireDevice();
    device.pushErrorScope('validation');

    let result: TValue;

    try {
      result = action();
    } catch (error) {
      void device.popErrorScope().catch(() => undefined);
      throw error;
    }

    let validationError: Awaited<ReturnType<WebGpuDeviceHandle['popErrorScope']>>;

    try {
      validationError = await device.popErrorScope();
    } catch (error) {
      throw this.recordValidationError(`${label} error-scope failure`, errorMessage(error));
    }

    if (validationError) {
      throw this.recordValidationError(label, validationError.message);
    }

    this.throwIfValidationFailed();
    return result;
  }

  private captureValidationErrorsLater<TValue>(label: string, action: () => TValue): TValue {
    this.throwIfValidationFailed();

    const device = this.requireDevice();
    device.pushErrorScope('validation');

    try {
      const result = action();
      void device
        .popErrorScope()
        .then((error) => {
          if (error) {
            this.recordValidationError(label, error.message);
          }
        })
        .catch((error: unknown) => {
          this.recordValidationError(`${label} error-scope failure`, errorMessage(error));
        });
      return result;
    } catch (error) {
      void device.popErrorScope().catch(() => undefined);
      throw error;
    }
  }

  private async validateShaderCompilationInfo(
    label: string,
    shaderModule: WebGpuShaderModule,
  ): Promise<void> {
    if (!shaderModule.compilationInfo) {
      return;
    }

    let info: WebGpuCompilationInfo;

    try {
      info = await shaderModule.compilationInfo();
    } catch (error) {
      throw this.recordValidationError(`${label} compilationInfo() failure`, errorMessage(error));
    }

    this.logShaderCompilationInfo(label, info);

    const errors = info.messages.filter((message) => message.type === 'error');
    if (errors.length > 0) {
      throw this.recordValidationError(
        label,
        `WGSL compilation failed:\n${formatCompilationMessages(errors)}`,
      );
    }
  }

  private logShaderCompilationInfo(label: string, info: WebGpuCompilationInfo): void {
    if (info.messages.length === 0) {
      return;
    }

    // eslint-disable-next-line no-console -- WGSL diagnostics must be visible for validation failures.
    console.warn(`[${label}] WGSL diagnostics:\n${formatCompilationMessages(info.messages)}`);
  }

  private recordValidationError(source: string, message: string): Error {
    const error = new Error(`${source}: ${message}`);

    if (!this.validationError) {
      this.validationError = error;
      this.canvas.dataset.rendererStatus = 'error';
      this.canvas.dataset.rendererReason = error.message;
      this.options.onValidationError?.(error);
    }

    return this.validationError;
  }

  private throwIfValidationFailed(): void {
    if (this.validationError) {
      throw this.validationError;
    }
  }
}

function getNavigatorGpu(): NavigatorWithWebGpu['gpu'] {
  const navigatorWithGpu = globalThis.navigator as NavigatorWithWebGpu | undefined;
  return navigatorWithGpu?.gpu;
}

function bufferUsageFlags(usages: readonly GraphicsBufferUsage[]): number {
  return usages.reduce((flags, usage) => flags | bufferUsageFlag(usage), 0);
}

function bufferUsageFlag(usage: GraphicsBufferUsage): number {
  switch (usage) {
    case 'vertex':
      return WEBGPU_BUFFER_USAGE.VERTEX;
    case 'index':
      return WEBGPU_BUFFER_USAGE.INDEX;
    case 'uniform':
      return WEBGPU_BUFFER_USAGE.UNIFORM;
    case 'copy-src':
      return WEBGPU_BUFFER_USAGE.COPY_SRC;
    case 'copy-dst':
      return WEBGPU_BUFFER_USAGE.COPY_DST;
  }
}

function requireWebGpuBuffer(buffer: GraphicsBuffer): WebGpuBuffer {
  if (!(buffer instanceof WebGpuBuffer)) {
    throw new Error('Expected a WebGPU buffer');
  }

  return buffer;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fallbackCssWidth(canvas: HTMLCanvasElement): number {
  return canvas.clientWidth || globalThis.innerWidth || 1;
}

function fallbackCssHeight(canvas: HTMLCanvasElement): number {
  return canvas.clientHeight || globalThis.innerHeight || 1;
}

function formatCompilationMessages(messages: readonly WebGpuCompilationMessage[]): string {
  return messages.map((message) => formatCompilationMessage(message)).join('\n');
}

function formatCompilationMessage(message: WebGpuCompilationMessage): string {
  const location =
    message.lineNum || message.linePos
      ? `${message.lineNum ?? '?'}:${message.linePos ?? '?'}`
      : `offset ${message.offset ?? '?'}`;
  const length = message.length ? ` length ${message.length}` : '';
  return `${message.type.toUpperCase()} ${location}${length}: ${message.message}`;
}
