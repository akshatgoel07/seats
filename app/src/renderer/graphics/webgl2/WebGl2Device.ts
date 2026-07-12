import type { GraphicsDevice } from '../GraphicsDevice';

export class WebGl2Device implements GraphicsDevice {
  readonly backend = 'webgl2' as const;

  async initialize(): Promise<void> {
    return Promise.resolve();
  }

  dispose(): void {}
}
