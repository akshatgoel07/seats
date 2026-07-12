import type { RenderBackend } from './graphics/RenderTypes';

export class SeatRenderer {
  constructor(private readonly backend: RenderBackend) {}

  backendName(): RenderBackend {
    return this.backend;
  }

  dispose(): void {
    void this.backend;
  }
}
