import { describe, expect, it } from 'vitest';

import {
  GraphicsFallbackManager,
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

function fakeCanvas(): HTMLCanvasElement {
  const canvas = {
    width: 100,
    height: 100,
    style: { cssText: '' },
    dataset: {},
    cloneNode() {
      return fakeCanvas();
    },
    replaceWith() {},
  };

  return canvas as unknown as HTMLCanvasElement;
}
