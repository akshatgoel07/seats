export class BenchApp {
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: Record<string, unknown> = {},
  ) {}

  mount(): void {
    void this.canvas;
    void this.opts;
  }
}
