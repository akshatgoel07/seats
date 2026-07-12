import { generateSeatMap, type LayoutKind } from '../fixtures/generate';
import { SeatRenderer } from '../renderer/SeatRenderer';
import {
  GraphicsFallbackManager,
} from '../renderer/graphics/FallbackManager';
import { GraphicsDeviceUnsupportedError } from '../renderer/graphics/GraphicsDevice';
import type { RenderBackend } from '../renderer/graphics/RenderTypes';
import type { SeatLayoutEvents, SeatLayoutSeatInfo } from '../shared/events';
import type { Seat, SeatCategory, SeatMapDocument } from '../shared/seat-map';

export type DemoRenderStatus =
  | { readonly state: 'initializing' }
  | { readonly state: 'unsupported'; readonly reason: string }
  | {
      readonly state: 'rendered';
      readonly backend: RenderBackend;
      readonly instanceCount: number;
      readonly fellBack?: boolean;
      readonly reason?: string;
    }
  | { readonly state: 'lost'; readonly reason: string; readonly message: string }
  | { readonly state: 'error'; readonly reason: string };

export interface DemoAppOptions {
  readonly search?: string;
}

interface DemoGlobal {
  __seatLayoutDemoStatus?: DemoRenderStatus;
  __seatLayoutPickAt?: (clientX: number, clientY: number) => SeatLayoutSeatInfo | null;
  __seatLayoutInteractionLog?: DemoInteractionLogEntry[];
}

interface FixtureSelection {
  readonly layout: LayoutKind;
  readonly seatCount: number;
}

type DemoInteractionLogEntry = {
  [TEvent in keyof SeatLayoutEvents]: {
    readonly type: TEvent;
    readonly payload: SeatLayoutEvents[TEvent];
  };
}[keyof SeatLayoutEvents];

interface SelectionPanel {
  readonly root: HTMLDivElement;
  readonly count: HTMLDivElement;
  readonly list: HTMLUListElement;
  readonly clearButton: HTMLButtonElement;
}

const DEFAULT_LAYOUT: LayoutKind = 'stadium';
const DEFAULT_SEAT_COUNT = 10_000;
const DEMO_SEAT_COUNTS = [1_000, 10_000, 100_000, 250_000] as const;
const DEMO_LAYOUTS = new Set<LayoutKind>(['grid', 'arena', 'stadium']);
const DEMO_FIXTURE_SEED = 20260712;

export class DemoApp {
  private renderer: SeatRenderer | null = null;
  private fallbackManager: GraphicsFallbackManager | null = null;
  private disposed = false;
  private selectionPanel: SelectionPanel | null = null;
  private selectedSeatInfo: SeatLayoutSeatInfo[] = [];
  private readonly unsubscribeRendererEvents: Array<() => void> = [];

  private readonly handleResize = () => {
    resizeCanvasElement(this.canvas);
    this.renderer?.requestRender();
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private readonly options: DemoAppOptions = {},
  ) {}

  mount(): void {
    resizeCanvasElement(this.canvas);
    this.setStatus({ state: 'initializing' });
    window.addEventListener('resize', this.handleResize);
    void this.start();
  }

  dispose(): void {
    this.disposed = true;
    window.removeEventListener('resize', this.handleResize);
    for (const unsubscribe of this.unsubscribeRendererEvents.splice(0)) {
      unsubscribe();
    }
    this.selectionPanel?.root.remove();
    this.selectionPanel = null;
    delete (globalThis as typeof globalThis & DemoGlobal).__seatLayoutPickAt;
    delete (globalThis as typeof globalThis & DemoGlobal).__seatLayoutInteractionLog;
    this.fallbackManager?.dispose();
    this.fallbackManager = null;
    this.renderer?.dispose();
    this.renderer = null;
  }

  private async start(): Promise<void> {
    try {
      let reportedFirstFrame = false;
      let scheduledFaultInjection = false;
      const fallbackManager = new GraphicsFallbackManager(this.canvas, {
        search: this.options.search ?? window.location.search,
        onCanvasReplaced: (canvas) => {
          this.canvas = canvas;
          resizeCanvasElement(this.canvas);
        },
        onFallback: () => {
          this.handleFallback();
        },
        onDeviceLost: (event) => {
          this.setStatus({
            state: 'lost',
            reason: event.reason,
            message: event.message,
          });
        },
        onError: (error) => {
          this.setStatus({
            state: 'error',
            reason: error.message,
          });
        },
      });
      this.fallbackManager = fallbackManager;
      const backend = await fallbackManager.createInitialBackend();
      this.canvas = fallbackManager.getCanvas();
      const renderer = new SeatRenderer(this.canvas, {
        device: backend.device,
        pipeline: backend.pipeline,
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
          this.setRenderedStatus();
          void fallbackManager.runWebGpuPostLoadSelfTest(renderer);

          if (!scheduledFaultInjection) {
            scheduledFaultInjection = true;
            this.scheduleForcedGpuFailure(fallbackManager);
          }
        },
      });
      fallbackManager.attachRenderer(renderer);

      await renderer.initialize();

      if (this.disposed) {
        renderer.dispose();
        return;
      }

      this.renderer = renderer;
      const document = this.createDemoDocument();
      this.selectedSeatInfo = seatInfoFromDocument(document);
      this.mountSelectionPanel(renderer);
      this.attachRendererEvents(renderer);
      renderer.loadDocument(document);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      if (error instanceof GraphicsDeviceUnsupportedError) {
        this.setStatus({ state: 'unsupported', reason });
      } else {
        this.setStatus({ state: 'error', reason });
      }
    }
  }

  private handleFallback(): void {
    this.setRenderedStatus();
  }

  private setRenderedStatus(): void {
    const renderer = this.renderer;

    if (!renderer) {
      return;
    }

    const fallbackManager = this.fallbackManager;
    const reason = fallbackManager?.fallbackReason ?? undefined;

    this.setStatus({
      state: 'rendered',
      backend: renderer.backendName(),
      instanceCount: renderer.instanceCount,
      ...(fallbackManager?.fellBack ? { fellBack: true, reason } : {}),
    });
  }

  private scheduleForcedGpuFailure(fallbackManager: GraphicsFallbackManager): void {
    const delayMs = failGpuAfterMs(this.options.search ?? window.location.search);

    if (delayMs === null) {
      return;
    }

    window.setTimeout(() => {
      void fallbackManager.forceWebGpuFailure(`forced WebGPU failure after ${delayMs}ms`);
    }, delayMs);
  }

  private mountSelectionPanel(renderer: SeatRenderer): void {
    this.selectionPanel?.root.remove();

    const root = document.createElement('div');
    root.id = 'seat-selection-panel-root';

    const panel = document.createElement('section');
    panel.id = 'seat-selection-panel';

    const header = document.createElement('div');
    header.id = 'seat-selection-header';

    const count = document.createElement('div');
    count.id = 'seat-selection-count';
    count.textContent = '0 selected';

    const clearButton = document.createElement('button');
    clearButton.id = 'seat-selection-clear';
    clearButton.type = 'button';
    clearButton.textContent = 'Clear';
    clearButton.disabled = true;
    clearButton.addEventListener('click', () => {
      renderer.clearSelection();
    });

    const list = document.createElement('ul');
    list.id = 'seat-selection-list';

    header.append(count, clearButton);
    panel.append(header, list);
    root.append(panel);
    document.body.append(root);

    this.selectionPanel = { root, count, list, clearButton };
    this.updateSelectionPanel(renderer.getSelection());
  }

  private attachRendererEvents(renderer: SeatRenderer): void {
    const global = globalThis as typeof globalThis & DemoGlobal;
    const interactionLog: DemoInteractionLogEntry[] = [];
    global.__seatLayoutInteractionLog = interactionLog;
    global.__seatLayoutPickAt = (clientX: number, clientY: number) =>
      renderer.pickAtClient(clientX, clientY);

    const logEvent = <TEvent extends keyof SeatLayoutEvents>(
      type: TEvent,
      payload: SeatLayoutEvents[TEvent],
    ) => {
      interactionLog.push({ type, payload } as DemoInteractionLogEntry);

      if (interactionLog.length > 100) {
        interactionLog.shift();
      }
    };

    this.unsubscribeRendererEvents.push(
      renderer.on('seatHover', (payload) => {
        logEvent('seatHover', payload);
      }),
      renderer.on('seatSelect', (payload) => {
        logEvent('seatSelect', payload);
      }),
      renderer.on('selectionChange', (payload) => {
        logEvent('selectionChange', payload);
        this.updateSelectionPanel(payload.selectedIndices);
      }),
    );
  }

  private updateSelectionPanel(selectedIndices: readonly number[]): void {
    const panel = this.selectionPanel;

    if (!panel) {
      return;
    }

    const count = selectedIndices.length;
    panel.count.textContent = `${count} selected`;
    panel.clearButton.disabled = count === 0;
    panel.list.replaceChildren(
      ...selectedIndices.map((seatIndex) => {
        const seat = this.selectedSeatInfo[seatIndex];
        const item = document.createElement('li');
        item.dataset.seatIndex = String(seatIndex);
        item.textContent = seat
          ? `${seat.sectionName} / Row ${seat.rowLabel} / Seat ${seat.seatLabel}`
          : `Seat ${seatIndex}`;
        return item;
      }),
    );
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

function failGpuAfterMs(search: string): number | null {
  const value = new URLSearchParams(search).get('failGpuAfterMs');

  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function resizeCanvasElement(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(window.innerWidth * dpr));
  const height = Math.max(1, Math.floor(window.innerHeight * dpr));

  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
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

function seatInfoFromDocument(document: SeatMapDocument): SeatLayoutSeatInfo[] {
  const seats: SeatLayoutSeatInfo[] = [];
  let seatIndex = 0;

  for (const section of document.sections) {
    for (const row of section.rows) {
      for (const seat of row.seats) {
        seats.push({
          seatIndex,
          seatId: seat.id,
          sectionId: section.id,
          sectionName: section.name,
          rowId: row.id,
          rowLabel: row.label,
          seatLabel: seat.label,
        });
        seatIndex += 1;
      }
    }
  }

  return seats;
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
