export class Camera2D {
  constructor(
    private zoom: number = 1,
    private centerX: number = 0,
    private centerY: number = 0,
  ) {}

  getZoom(): number {
    return this.zoom;
  }

  getCenter(): { x: number; y: number } {
    return { x: this.centerX, y: this.centerY };
  }
}
