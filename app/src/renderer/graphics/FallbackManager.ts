import type { GraphicsDevice, GraphicsDeviceLostEvent } from './GraphicsDevice';
import type { GraphicsPipeline, RenderBackend } from './RenderTypes';
import { WebGl2Device } from './webgl2/WebGl2Device';
import { WebGl2SeatPipeline } from './webgl2/WebGl2SeatPipeline';
import { WebGpuDevice, type WebGpuSupportStatus } from './webgpu/WebGpuDevice';
import { WebGpuSeatPipeline } from './webgpu/WebGpuSeatPipeline';

export interface WebGpuBlocklistContext {
  readonly userAgent: string;
}

export type WebGpuBlocklistRule = (
  context: WebGpuBlocklistContext,
) => string | false | null | undefined;

export const WEBGPU_BLOCKLIST_RULES: WebGpuBlocklistRule[] = [];

export interface BackendSelectionInput {
  readonly forcedBackend?: RenderBackend | null;
  readonly webGpuSupported: boolean;
  readonly webGpuUnsupportedReason?: string;
  readonly blocklistReasons?: readonly string[];
}

export interface BackendSelectionDecision {
  readonly backend: RenderBackend;
  readonly reason: string;
  readonly forced: boolean;
  readonly blocklisted: boolean;
}

export interface GraphicsBackend {
  readonly backend: RenderBackend;
  readonly device: GraphicsDevice;
  readonly pipeline: GraphicsPipeline<unknown>;
  readonly getValidationError?: () => Error | null;
}

export interface GraphicsBackendCallbacks {
  readonly onDeviceLost?: (event: GraphicsDeviceLostEvent) => void;
  readonly onValidationError?: (error: Error) => void;
}

export interface GraphicsBackendFactory {
  detectWebGpuSupport(): Promise<WebGpuSupportStatus>;
  createBackend(
    backend: RenderBackend,
    callbacks: GraphicsBackendCallbacks,
    canvas: HTMLCanvasElement,
  ): Promise<GraphicsBackend>;
}

export interface ManagedSeatRenderer {
  backendName(): RenderBackend;
  replaceGraphicsBackend(
    device: GraphicsDevice,
    pipeline: GraphicsPipeline<unknown>,
    canvas?: HTMLCanvasElement,
  ): Promise<void>;
  renderNow(): void;
  requestRender(): void;
}

export interface GraphicsFallbackEvent {
  readonly from: RenderBackend;
  readonly to: RenderBackend;
  readonly reason: string;
}

export interface GraphicsFallbackManagerOptions {
  readonly search?: string;
  readonly blocklistRules?: readonly WebGpuBlocklistRule[];
  readonly backendFactory?: GraphicsBackendFactory;
  readonly validationSettleMs?: number;
  readonly onFallback?: (event: GraphicsFallbackEvent) => void;
  readonly onDeviceLost?: (event: GraphicsDeviceLostEvent) => void;
  readonly onCanvasReplaced?: (canvas: HTMLCanvasElement) => void;
  readonly onError?: (error: Error) => void;
}

const DEFAULT_VALIDATION_SETTLE_MS = 25;

export class GraphicsFallbackManager {
  private readonly backendFactory: GraphicsBackendFactory;
  private activeBackend: GraphicsBackend | null = null;
  private renderer: ManagedSeatRenderer | null = null;
  private fallbackPromise: Promise<void> | null = null;
  private selfTestStarted = false;
  private disposed = false;
  private fellBackValue = false;
  private fallbackReasonValue: string | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private readonly options: GraphicsFallbackManagerOptions = {},
  ) {
    this.backendFactory = options.backendFactory ?? createDefaultBackendFactory();
  }

  get activeBackendName(): RenderBackend | null {
    return this.activeBackend?.backend ?? null;
  }

  get fellBack(): boolean {
    return this.fellBackValue;
  }

  get fallbackReason(): string | null {
    return this.fallbackReasonValue;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  attachRenderer(renderer: ManagedSeatRenderer): void {
    this.renderer = renderer;
  }

  async createInitialBackend(): Promise<GraphicsBackend> {
    const forcedBackend = forcedBackendFromSearch(
      this.options.search ?? globalThis.location?.search ?? '',
    );
    const blocklistReasons =
      forcedBackend === null
        ? evaluateBlocklist(this.options.blocklistRules ?? WEBGPU_BLOCKLIST_RULES)
        : [];
    const support =
      forcedBackend === 'webgl2'
        ? {
            supported: false,
            reason: 'URL forced backend=webgl2',
          }
        : await this.backendFactory.detectWebGpuSupport();
    const decision = decideInitialBackend({
      forcedBackend,
      webGpuSupported: support.supported,
      webGpuUnsupportedReason: support.reason,
      blocklistReasons,
    });

    try {
      return await this.activateBackend(decision.backend, this.canvas);
    } catch (error) {
      if (decision.backend === 'webgpu') {
        const reason = `WebGPU startup failed: ${errorMessage(error)}`;
        const replacementCanvas = replaceCanvasForFallback(this.canvas);
        this.canvas = replacementCanvas;
        this.options.onCanvasReplaced?.(replacementCanvas);
        this.fellBackValue = true;
        this.fallbackReasonValue = reason;
        return this.activateBackend('webgl2', replacementCanvas);
      }

      throw error;
    }
  }

  async runWebGpuPostLoadSelfTest(renderer: ManagedSeatRenderer = this.requireRenderer()): Promise<void> {
    if (
      this.disposed ||
      this.selfTestStarted ||
      this.activeBackend?.backend !== 'webgpu' ||
      this.fallbackPromise
    ) {
      return;
    }

    this.selfTestStarted = true;

    try {
      renderer.renderNow();
      await wait(this.options.validationSettleMs ?? DEFAULT_VALIDATION_SETTLE_MS);
      const validationError = this.activeBackend?.getValidationError?.() ?? null;

      if (validationError) {
        throw validationError;
      }
    } catch (error) {
      await this.fallbackToWebGl2(`WebGPU self-test failed: ${errorMessage(error)}`);
    }
  }

  async forceWebGpuFailure(reason: string): Promise<void> {
    if (this.activeBackend?.backend !== 'webgpu') {
      return;
    }

    await this.fallbackToWebGl2(reason);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer = null;
  }

  private async activateBackend(
    backend: RenderBackend,
    canvas: HTMLCanvasElement,
  ): Promise<GraphicsBackend> {
    const nextBackend = await this.backendFactory.createBackend(
      backend,
      {
        onDeviceLost: (event) => {
          if (event.backend === 'webgpu') {
            void this.fallbackToWebGl2(`WebGPU device lost: ${event.reason}: ${event.message}`);
            return;
          }

          this.options.onDeviceLost?.(event);
        },
        onValidationError: (error) => {
          void this.fallbackToWebGl2(`WebGPU validation error: ${error.message}`);
        },
      },
      canvas,
    );

    this.activeBackend = nextBackend;
    return nextBackend;
  }

  private async fallbackToWebGl2(reason: string): Promise<void> {
    if (this.disposed || this.activeBackend?.backend !== 'webgpu') {
      return;
    }

    if (this.fallbackPromise) {
      return this.fallbackPromise;
    }

    this.fallbackPromise = this.performWebGl2Fallback(reason);
    await this.fallbackPromise;
  }

  private async performWebGl2Fallback(reason: string): Promise<void> {
    const previousBackend = this.activeBackend?.backend ?? 'webgpu';

    try {
      const replacementCanvas = replaceCanvasForFallback(this.canvas);
      const nextBackend = await this.activateBackend('webgl2', replacementCanvas);
      this.canvas = replacementCanvas;
      this.options.onCanvasReplaced?.(replacementCanvas);

      const renderer = this.requireRenderer();
      await renderer.replaceGraphicsBackend(
        nextBackend.device,
        nextBackend.pipeline,
        replacementCanvas,
      );
      renderer.requestRender();

      this.fellBackValue = true;
      this.fallbackReasonValue = reason;
      this.options.onFallback?.({
        from: previousBackend,
        to: 'webgl2',
        reason,
      });
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      this.options.onError?.(normalizedError);
      throw normalizedError;
    } finally {
      this.fallbackPromise = null;
    }
  }

  private requireRenderer(): ManagedSeatRenderer {
    if (!this.renderer) {
      throw new Error('Graphics fallback manager has no attached renderer');
    }

    return this.renderer;
  }
}

export function decideInitialBackend(input: BackendSelectionInput): BackendSelectionDecision {
  if (input.forcedBackend === 'webgl2') {
    return {
      backend: 'webgl2',
      reason: 'URL forced backend=webgl2',
      forced: true,
      blocklisted: false,
    };
  }

  if (input.forcedBackend === 'webgpu') {
    return {
      backend: 'webgpu',
      reason: 'URL forced backend=webgpu',
      forced: true,
      blocklisted: false,
    };
  }

  const blocklistReasons = input.blocklistReasons ?? [];

  if (blocklistReasons.length > 0) {
    return {
      backend: 'webgl2',
      reason: `WebGPU blocklisted: ${blocklistReasons.join('; ')}`,
      forced: false,
      blocklisted: true,
    };
  }

  if (input.webGpuSupported) {
    return {
      backend: 'webgpu',
      reason: 'WebGPU supported',
      forced: false,
      blocklisted: false,
    };
  }

  return {
    backend: 'webgl2',
    reason: input.webGpuUnsupportedReason ?? 'WebGPU unsupported',
    forced: false,
    blocklisted: false,
  };
}

export function forcedBackendFromSearch(search: string): RenderBackend | null {
  const params = new URLSearchParams(search);
  const backend = params.get('backend');

  return backend === 'webgpu' || backend === 'webgl2' ? backend : null;
}

function createDefaultBackendFactory(): GraphicsBackendFactory {
  return {
    detectWebGpuSupport: () => WebGpuDevice.detectSupport(),
    async createBackend(
      backend: RenderBackend,
      callbacks: GraphicsBackendCallbacks,
      canvas: HTMLCanvasElement,
    ): Promise<GraphicsBackend> {
      if (backend === 'webgpu') {
        const device = new WebGpuDevice(canvas, callbacks);
        await device.initialize();
        const pipeline = await WebGpuSeatPipeline.create(device);
        return {
          backend,
          device,
          pipeline,
          getValidationError: () => device.getValidationError(),
        };
      }

      const device = new WebGl2Device(canvas, {
        onDeviceLost: callbacks.onDeviceLost,
      });
      await device.initialize();
      const pipeline = WebGl2SeatPipeline.create(device);
      return { backend, device, pipeline };
    },
  };
}

function evaluateBlocklist(rules: readonly WebGpuBlocklistRule[]): string[] {
  const context = {
    userAgent: globalThis.navigator?.userAgent ?? '',
  } satisfies WebGpuBlocklistContext;
  const reasons: string[] = [];

  for (const rule of rules) {
    const reason = rule(context);

    if (reason) {
      reasons.push(reason);
    }
  }

  return reasons;
}

function replaceCanvasForFallback(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
  replacement.width = canvas.width;
  replacement.height = canvas.height;
  replacement.style.cssText = canvas.style.cssText;
  replacement.dataset.rendererStatus = canvas.dataset.rendererStatus;

  if (canvas.dataset.rendererReason) {
    replacement.dataset.rendererReason = canvas.dataset.rendererReason;
  }

  canvas.replaceWith(replacement);
  return replacement;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
