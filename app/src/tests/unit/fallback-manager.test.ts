import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  GraphicsFallbackManager,
  createDefaultBackendFactory,
  decideInitialBackend,
  type GraphicsBackend,
  type GraphicsBackendCallbacks,
  type GraphicsBackendFactory,
} from '../../renderer/graphics/FallbackManager';
import type { GraphicsDevice } from '../../renderer/graphics/GraphicsDevice';
import type {
  GraphicsBuffer,
  GraphicsPipeline,
  RenderBackend,
  StableDescriptorValue,
} from '../../renderer/graphics/RenderTypes';
import { WebGpuSeatPipeline } from '../../renderer/graphics/webgpu/WebGpuSeatPipeline';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('GraphicsFallbackManager backend decisions', () => {
  it('chooses WebGL2 when navigator.gpu is absent', () => {
    expect(
      decideInitialBackend({
        webGpuSupported: false,
        webGpuUnsupportedReason: 'navigator.gpu is unavailable',
      }),
    ).toMatchObject({
      backend: 'webgl2',
      reason: 'navigator.gpu is unavailable',
      forced: false,
      blocklisted: false,
    });
  });

  it('chooses WebGPU when adapter and device creation are supported', () => {
    expect(
      decideInitialBackend({
        webGpuSupported: true,
      }),
    ).toMatchObject({
      backend: 'webgpu',
      reason: 'WebGPU supported',
    });
  });

  it('uses WebGL2 when a blocklist rule matches', () => {
    expect(
      decideInitialBackend({
        webGpuSupported: true,
        blocklistReasons: ['known bad driver'],
      }),
    ).toMatchObject({
      backend: 'webgl2',
      blocklisted: true,
      reason: 'WebGPU blocklisted: known bad driver',
    });
  });

  it('forces a URL-selected backend ahead of support and blocklist checks', () => {
    expect(
      decideInitialBackend({
        forcedBackend: 'webgpu',
        webGpuSupported: false,
        blocklistReasons: ['known bad driver'],
      }),
    ).toMatchObject({
      backend: 'webgpu',
      forced: true,
      blocklisted: false,
    });
  });

  it('falls back to WebGL2 when the async WebGPU self-test reports validation failure', async () => {
    const factory = new FakeBackendFactory(new Error('validation failed after submit'));
    const canvas = fakeCanvas();
    const manager = new GraphicsFallbackManager(canvas, {
      backendFactory: factory,
      validationSettleMs: 0,
    });
    const initialBackend = await manager.createInitialBackend();
    const renderer = new FakeManagedRenderer(initialBackend.backend);
    manager.attachRenderer(renderer);

    await manager.runWebGpuPostLoadSelfTest(renderer);

    expect(factory.createdBackends).toEqual(['webgpu', 'webgl2']);
    expect(renderer.renderNowCount).toBe(1);
    expect(renderer.backend).toBe('webgl2');
    expect(renderer.replacementCanvas).not.toBe(canvas);
    expect(manager.fellBack).toBe(true);
    expect(manager.fallbackReason).toBe('WebGPU self-test failed: validation failed after submit');
  });

  it('does not replace the canvas or fire fallback callbacks after disposal during fallback', async () => {
    const factory = new DeferredFallbackBackendFactory();
    const canvas = fakeCanvas();
    const onCanvasReplaced = vi.fn();
    const onFallback = vi.fn();
    const onError = vi.fn();
    const manager = new GraphicsFallbackManager(canvas, {
      backendFactory: factory,
      onCanvasReplaced,
      onFallback,
      onError,
    });
    const initialBackend = await manager.createInitialBackend();
    const renderer = new FakeManagedRenderer(initialBackend.backend);
    manager.attachRenderer(renderer);

    const fallback = manager.forceWebGpuFailure('forced failure');
    await factory.waitForWebGl2Request();
    manager.dispose();
    factory.resolveWebGl2();
    await fallback;

    expect(canvas.replaceWithCount).toBe(0);
    expect(manager.fellBack).toBe(false);
    expect(renderer.replaceGraphicsBackendCount).toBe(0);
    expect(manager.getCanvas()).toBe(canvas);
    expect(manager.fallbackReason).toBeNull();
    expect(manager.activeBackendName).toBe('webgpu');
    expect(onCanvasReplaced).not.toHaveBeenCalled();
    expect(onFallback).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('destroys a created WebGPU device when default pipeline creation fails', async () => {
    const destroy = vi.fn();
    const fakeDevice = {
      lost: new Promise<never>(() => {}),
      destroy,
      addEventListener: vi.fn(),
    };
    const requestDevice = vi.fn().mockResolvedValue(fakeDevice);
    const requestAdapter = vi.fn().mockResolvedValue({ requestDevice });
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter,
        getPreferredCanvasFormat: () => 'bgra8unorm',
      },
      userAgent: '',
    });
    vi.spyOn(WebGpuSeatPipeline, 'create').mockRejectedValue(new Error('pipeline failed'));

    const factory = createDefaultBackendFactory();
    await expect(factory.createBackend('webgpu', {}, fakeWebGpuCanvas())).rejects.toThrow(
      'pipeline failed',
    );

    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

class FakeBackendFactory implements GraphicsBackendFactory {
  readonly createdBackends: RenderBackend[] = [];

  constructor(private readonly webGpuValidationError: Error | null = null) {}

  async detectWebGpuSupport(): Promise<{ supported: boolean }> {
    return { supported: true };
  }

  async createBackend(
    backend: RenderBackend,
    callbacks: GraphicsBackendCallbacks,
    canvas: HTMLCanvasElement,
  ): Promise<GraphicsBackend> {
    void callbacks;
    void canvas;

    this.createdBackends.push(backend);
    return {
      backend,
      device: new FakeDevice(backend),
      pipeline: fakePipeline,
      getValidationError: backend === 'webgpu' ? () => this.webGpuValidationError : undefined,
    };
  }
}

class DeferredFallbackBackendFactory implements GraphicsBackendFactory {
  readonly createdBackends: RenderBackend[] = [];
  private resolveWebGl2Request: (() => void) | null = null;
  private resolveWebGl2Backend: ((backend: GraphicsBackend) => void) | null = null;
  private readonly webGl2Requested = new Promise<void>((resolve) => {
    this.resolveWebGl2Request = resolve;
  });

  async detectWebGpuSupport(): Promise<{ supported: boolean }> {
    return { supported: true };
  }

  async createBackend(
    backend: RenderBackend,
    callbacks: GraphicsBackendCallbacks,
    canvas: HTMLCanvasElement,
  ): Promise<GraphicsBackend> {
    void callbacks;
    void canvas;

    this.createdBackends.push(backend);

    if (backend === 'webgpu') {
      return {
        backend,
        device: new FakeDevice(backend),
        pipeline: fakePipeline,
        getValidationError: () => null,
      };
    }

    this.resolveWebGl2Request?.();
    return new Promise<GraphicsBackend>((resolve) => {
      this.resolveWebGl2Backend = resolve;
    });
  }

  waitForWebGl2Request(): Promise<void> {
    return this.webGl2Requested;
  }

  resolveWebGl2(): void {
    this.resolveWebGl2Backend?.({
      backend: 'webgl2',
      device: new FakeDevice('webgl2'),
      pipeline: fakePipeline,
    });
  }
}

class FakeDevice implements GraphicsDevice {
  constructor(readonly backend: RenderBackend) {}

  async initialize(): Promise<void> {}

  resize(): void {}

  createBuffer(): GraphicsBuffer {
    throw new Error('not implemented');
  }

  uploadBuffer(): void {}

  encodeDraw(): void {}

  submit(): void {}

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

  dispose(): void {}
}

class FakeManagedRenderer {
  renderNowCount = 0;
  replaceGraphicsBackendCount = 0;
  replacementCanvas: HTMLCanvasElement | null = null;

  constructor(public backend: RenderBackend) {}

  backendName(): RenderBackend {
    return this.backend;
  }

  async replaceGraphicsBackend(
    device: GraphicsDevice,
    _pipeline: GraphicsPipeline<unknown>,
    canvas?: HTMLCanvasElement,
  ): Promise<void> {
    this.replaceGraphicsBackendCount += 1;
    this.backend = device.backend;
    this.replacementCanvas = canvas ?? null;
  }

  renderNow(): void {
    this.renderNowCount += 1;
  }

  requestRender(): void {}
}

const fakePipeline: GraphicsPipeline<unknown> = {
  id: 'fake-pipeline',
  descriptor: 'fake-pipeline',
  uniformStructSizeBytes: 0,
  encodeDraw: () => {},
};

interface FakeCanvas extends HTMLCanvasElement {
  replaceWithCount: number;
  replacedWith: HTMLCanvasElement | null;
}

function fakeCanvas(): FakeCanvas {
  const canvas = {
    width: 100,
    height: 100,
    clientWidth: 100,
    clientHeight: 100,
    style: { cssText: '' },
    dataset: {},
    cloneNode() {
      return fakeCanvas();
    },
    replaceWith(replacement: HTMLCanvasElement) {
      this.replaceWithCount += 1;
      this.replacedWith = replacement;
    },
    replaceWithCount: 0,
    replacedWith: null,
  };

  return canvas as unknown as FakeCanvas;
}

function fakeWebGpuCanvas(): HTMLCanvasElement {
  const canvas = fakeCanvas();
  return {
    ...canvas,
    getContext(contextId: string) {
      if (contextId !== 'webgpu') {
        return null;
      }

      return {
        configure: vi.fn(),
      };
    },
  } as unknown as HTMLCanvasElement;
}
