import { generateSeatMap, type LayoutKind } from '../fixtures/generate';
import { SeatRenderer } from '../renderer/SeatRenderer';
import type { RenderBackend } from '../renderer/graphics/RenderTypes';
import { WebGpuDevice } from '../renderer/graphics/webgpu/WebGpuDevice';
import type { Seat, SeatCategory, SeatMapDocument } from '../shared/seat-map';

export type DemoRenderStatus =
  | { readonly state: 'initializing' }
  | { readonly state: 'unsupported'; readonly reason: string }
  | { readonly state: 'rendered'; readonly backend: RenderBackend; readonly instanceCount: number }
  | { readonly state: 'lost'; readonly reason: string; readonly message: string }
  | { readonly state: 'error'; readonly reason: string };

export interface DemoAppOptions {
  readonly search?: string;
}

interface DemoGlobal {
  __seatLayoutDemoStatus?: DemoRenderStatus;
}

interface FixtureSelection {
  readonly layout: LayoutKind;
  readonly seatCount: number;
}

const DEFAULT_LAYOUT: LayoutKind = 'stadium';
const DEFAULT_SEAT_COUNT = 10_000;
const DEMO_SEAT_COUNTS = [1_000, 10_000, 100_000, 250_000] as const;
const DEMO_LAYOUTS = new Set<LayoutKind>(['grid', 'arena', 'stadium']);
const DEMO_FIXTURE_SEED = 20260712;

export class DemoApp {
  private renderer: SeatRenderer | null = null;
  private disposed = false;

  private readonly handleResize = () => {
    this.renderer?.requestRender();
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: DemoAppOptions = {},
  ) {}

  mount(): void {
    this.setStatus({ state: 'initializing' });
    window.addEventListener('resize', this.handleResize);
    void this.start();
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.handleResize);
    this.renderer?.dispose();
    this.renderer = null;
  }

  private async start(): Promise<void> {
    const supportStatus = await WebGpuDevice.detectSupport();

    if (!supportStatus.supported) {
      this.setStatus({
        state: 'unsupported',
        reason: supportStatus.reason ?? 'WebGPU is unavailable',
      });
      return;
    }

    try {
      let reportedFirstFrame = false;
      const renderer = new SeatRenderer(this.canvas, {
        onDeviceLost: (event) => {
          this.setStatus({
            state: 'lost',
            reason: event.reason,
            message: event.message,
          });
        },
        onValidationError: (error) => {
          this.setStatus({
            state: 'error',
            reason: error.message,
          });
        },
        onError: (error) => {
          this.setStatus({
            state: 'error',
            reason: error.message,
          });
        },
        onFrame: () => {
          if (reportedFirstFrame) {
            return;
          }

          reportedFirstFrame = true;
          this.setStatus({
            state: 'rendered',
            backend: renderer.backendName(),
            instanceCount: renderer.instanceCount,
          });
        },
      });

      await renderer.initialize();

      if (this.disposed) {
        renderer.dispose();
        return;
      }

      this.renderer = renderer;
      renderer.loadDocument(this.createDemoDocument());
    } catch (error) {
      this.setStatus({
        state: 'error',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private createDemoDocument(): SeatMapDocument {
    const selection = parseFixtureSelection(this.options.search ?? window.location.search);

    try {
      return generateSeatMap({
        layout: selection.layout,
        seatCount: selection.seatCount,
        seed: DEMO_FIXTURE_SEED,
      });
    } catch {
      return createFallbackSeatMap();
    }
  }

  private setStatus(status: DemoRenderStatus): void {
    this.canvas.dataset.rendererStatus = status.state;

    if ('reason' in status) {
      this.canvas.dataset.rendererReason = status.reason;
    } else {
      delete this.canvas.dataset.rendererReason;
    }

    (globalThis as typeof globalThis & DemoGlobal).__seatLayoutDemoStatus = status;
  }
}

function parseFixtureSelection(search: string): FixtureSelection {
  const params = new URLSearchParams(search);
  const layoutParam = params.get('layout');
  const layout =
    layoutParam && DEMO_LAYOUTS.has(layoutParam as LayoutKind)
      ? (layoutParam as LayoutKind)
      : DEFAULT_LAYOUT;

  return {
    layout,
    seatCount: clampSeatCount(params.get('seats')),
  };
}

function clampSeatCount(value: string | null): number {
  const parsed = value === null ? DEFAULT_SEAT_COUNT : Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SEAT_COUNT;
  }

  for (const seatCount of DEMO_SEAT_COUNTS) {
    if (parsed <= seatCount) {
      return seatCount;
    }
  }

  return DEMO_SEAT_COUNTS[DEMO_SEAT_COUNTS.length - 1];
}

function createFallbackSeatMap(): SeatMapDocument {
  const rows = 100;
  const columns = 100;
  const spacing = 1;
  const size = 0.7;
  const categories: SeatCategory[] = [
    { id: 'fallback-standard', name: 'Standard', color: '#2563eb' },
    { id: 'fallback-premium', name: 'Premium', color: '#dc2626' },
    { id: 'fallback-access', name: 'Access', color: '#16a34a' },
  ];
  const documentRows = [];

  for (let row = 0; row < rows; row += 1) {
    const seats: Seat[] = [];

    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      seats.push({
        id: `fallback-r${row}-s${column}`,
        label: `${column + 1}`,
        x: column * spacing,
        y: row * spacing,
        size,
        rotation: 0,
        categoryIndex: index % categories.length,
        status: index % 13 === 0 ? 'sold' : 'available',
      });
    }

    documentRows.push({
      id: `fallback-row-${row}`,
      label: `${row + 1}`,
      seats,
    });
  }

  return {
    id: 'fallback-grid-10000',
    name: 'Fallback 10k grid',
    bounds: {
      minX: -size,
      minY: -size,
      maxX: (columns - 1) * spacing + size,
      maxY: (rows - 1) * spacing + size,
    },
    categories,
    sections: [
      {
        id: 'fallback-section',
        name: 'Fallback Section',
        transform: { x: 0, y: 0, rotation: 0 },
        rows: documentRows,
      },
    ],
  };
}
