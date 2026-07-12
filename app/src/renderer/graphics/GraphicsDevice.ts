export interface GraphicsDevice {
  readonly backend: 'webgpu' | 'webgl2' | 'none';
  initialize(): Promise<void>;
  dispose(): void;
}
