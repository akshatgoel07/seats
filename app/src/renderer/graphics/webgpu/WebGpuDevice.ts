import type { GraphicsDevice } from '../GraphicsDevice';

export class WebGpuDevice implements GraphicsDevice {
  readonly backend = 'webgpu' as const;

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): void {}
}
