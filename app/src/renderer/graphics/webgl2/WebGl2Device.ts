import type { GraphicsDevice } from '../GraphicsDevice';
import { DescriptorCache, type GraphicsBuffer, type StableDescriptorValue } from '../RenderTypes';

export class WebGl2Device implements GraphicsDevice {
  readonly backend = 'webgl2' as const;

  private readonly pipelineCache = new DescriptorCache<unknown>();
  private readonly bindGroupCache = new DescriptorCache<unknown>();

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  resize(): void {}

  createBuffer(): GraphicsBuffer {
    throw new Error('WebGL2 graphics device is scheduled for T7');
  }

  uploadBuffer(): void {
    throw new Error('WebGL2 graphics device is scheduled for T7');
  }

  encodeDraw(): void {
    throw new Error('WebGL2 graphics device is scheduled for T7');
  }

  submit(): void {}

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

  dispose(): void {
    this.pipelineCache.clear();
    this.bindGroupCache.clear();
  }
}
