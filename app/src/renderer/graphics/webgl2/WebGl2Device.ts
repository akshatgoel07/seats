import {
  GraphicsDeviceUnsupportedError,
  type GraphicsDevice,
  type GraphicsDeviceLostEvent,
} from '../GraphicsDevice';
import {
  DescriptorCache,
  coalesceInstanceDirtyRanges,
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

export interface WebGl2DeviceOptions {
  readonly onDeviceLost?: (event: GraphicsDeviceLostEvent) => void;
}

let nextBufferId = 1;

export class WebGl2Buffer implements GraphicsBuffer {
  readonly id: string;

  constructor(
    readonly nativeBuffer: WebGLBuffer,
    readonly sizeBytes: number,
    readonly usages: readonly GraphicsBufferUsage[],
    private readonly gl: WebGL2RenderingContext,
    readonly label?: string,
    readonly instanceStrideBytes?: number,
  ) {
    this.id = `webgl2-buffer-${nextBufferId}`;
    nextBufferId += 1;
  }

  dispose(): void {
    this.gl.deleteBuffer(this.nativeBuffer);
  }
}

export class WebGl2Device implements GraphicsDevice {
  readonly backend = 'webgl2' as const;

  private readonly pipelineCache = new DescriptorCache<unknown>();
  private readonly bindGroupCache = new DescriptorCache<unknown>();
  private readonly encodedDraws: GraphicsEncodedDraw<WebGL2RenderingContext>[] = [];
  private gl: WebGL2RenderingContext | null = null;
  private drawingBufferWidth = 1;
  private drawingBufferHeight = 1;
  private disposed = false;
  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();

    if (this.disposed) {
      return;
    }

    this.options.onDeviceLost?.({
      backend: this.backend,
      reason: 'context-lost',
      message: 'WebGL2 context was lost',
    });
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: WebGl2DeviceOptions = {},
  ) {}

  async initialize(): Promise<void> {
    if (this.gl) {
      return;
    }

    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
    });

    if (!gl) {
      throw new GraphicsDeviceUnsupportedError('webgl2', 'Canvas WebGL2 context is unavailable');
    }

    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.resize();
  }

  resize(widthCssPixels?: number, heightCssPixels?: number): void {
    const gl = this.gl;

    if (!gl) {
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
    gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  createBuffer(descriptor: GraphicsBufferDescriptor): GraphicsBuffer {
    const gl = this.requireContext();

    if (descriptor.sizeBytes <= 0) {
      throw new Error(`Expected a positive buffer size, received ${descriptor.sizeBytes}`);
    }

    const nativeBuffer = gl.createBuffer();

    if (!nativeBuffer) {
      throw new Error('WebGL2 createBuffer() returned null');
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, nativeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, descriptor.sizeBytes, bufferUsageHint(gl, descriptor.usages));
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    return new WebGl2Buffer(
      nativeBuffer,
      descriptor.sizeBytes,
      descriptor.usages,
      gl,
      descriptor.label,
      descriptor.instanceStrideBytes,
    );
  }

  uploadBuffer(
    buffer: GraphicsBuffer,
    data: ArrayBuffer | ArrayBufferView,
    options: GraphicsBufferUploadOptions = {},
  ): void {
    const gl = this.requireContext();
    const webGlBuffer = requireWebGl2Buffer(buffer);
    const sourceBytes = uniformStructBytes(data);
    const dirtyRanges = options.dirtyRanges ?? [];

    gl.bindBuffer(gl.ARRAY_BUFFER, webGlBuffer.nativeBuffer);

    if (dirtyRanges.length === 0) {
      if (sourceBytes.byteLength > webGlBuffer.sizeBytes) {
        throw new Error('Upload exceeds the destination WebGL2 buffer size');
      }

      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sourceBytes);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      return;
    }

    const instanceStrideBytes =
      options.instanceStrideBytes ?? buffer.instanceStrideBytes ?? webGlBuffer.instanceStrideBytes;

    if (!instanceStrideBytes) {
      throw new Error('Dirty-range uploads require an instance stride in bytes');
    }

    for (const range of coalesceInstanceDirtyRanges(dirtyRanges)) {
      const byteOffset = range.startInstance * instanceStrideBytes;
      const byteLength = range.instanceCount * instanceStrideBytes;

      if (byteOffset + byteLength > sourceBytes.byteLength) {
        throw new Error('Dirty range exceeds the supplied source buffer');
      }

      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        byteOffset,
        sourceBytes.subarray(byteOffset, byteOffset + byteLength),
      );
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  encodeDraw<TPass>(
    uniformStructData: UniformStructData,
    pipeline: GraphicsPipeline<TPass>,
    buffers: GraphicsDrawBuffers,
    instanceRange: DrawInstanceRange,
  ): void {
    this.encodedDraws.push({
      uniformStructData,
      pipeline: pipeline as GraphicsPipeline<WebGL2RenderingContext>,
      buffers,
      instanceRange,
    });
  }

  submit(): void {
    if (this.encodedDraws.length === 0) {
      return;
    }

    const gl = this.requireContext();

    try {
      gl.viewport(0, 0, this.drawingBufferWidth, this.drawingBufferHeight);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      for (const draw of this.encodedDraws) {
        draw.pipeline.encodeDraw(gl, draw, 0);
      }
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

  get nativeContext(): WebGL2RenderingContext {
    return this.requireContext();
  }

  getDrawingBufferSize(): { width: number; height: number } {
    return {
      width: this.drawingBufferWidth,
      height: this.drawingBufferHeight,
    };
  }

  dispose(): void {
    this.disposed = true;
    this.encodedDraws.length = 0;
    this.pipelineCache.clear();
    this.bindGroupCache.clear();
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.gl = null;
  }

  private requireContext(): WebGL2RenderingContext {
    if (!this.gl) {
      throw new Error('WebGL2 context has not been initialized');
    }

    return this.gl;
  }
}

function bufferUsageHint(
  gl: WebGL2RenderingContext,
  usages: readonly GraphicsBufferUsage[],
): number {
  return usages.includes('copy-dst') ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW;
}

function requireWebGl2Buffer(buffer: GraphicsBuffer): WebGl2Buffer {
  if (!(buffer instanceof WebGl2Buffer)) {
    throw new Error('Expected a WebGL2 buffer');
  }

  return buffer;
}

function fallbackCssWidth(canvas: HTMLCanvasElement): number {
  return canvas.clientWidth || globalThis.innerWidth || 1;
}

function fallbackCssHeight(canvas: HTMLCanvasElement): number {
  return canvas.clientHeight || globalThis.innerHeight || 1;
}
