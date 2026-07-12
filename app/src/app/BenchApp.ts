import { generateSeatMap, type LayoutKind } from '../fixtures/generate';
import { SeatRenderer } from '../renderer/SeatRenderer';
import { GraphicsDeviceUnsupportedError } from '../renderer/graphics/GraphicsDevice';
import type { GraphicsDevice } from '../renderer/graphics/GraphicsDevice';
import type { RenderBackend } from '../renderer/graphics/RenderTypes';
import { WebGl2Device } from '../renderer/graphics/webgl2/WebGl2Device';
import { WebGpuDevice } from '../renderer/graphics/webgpu/WebGpuDevice';
import { flattenSeatMap, type SeatMapDocument } from '../shared/seat-map';
import { SEAT_STATE_FLAG_UNAVAILABLE } from '../shared/instance-layout';
import {
  BENCH_HIT_TEST_COUNT,
  BENCH_PAN_ZOOM_DURATION_MS,
  BENCH_PAN_ZOOM_SAMPLE_COUNT,
  BENCH_PAN_ZOOM_WARMUP_FRAMES,
  BENCH_SEED,
  BENCH_SELECTION_TOGGLE_COUNT,
  generateHitTestPoints,
  generatePanZoomPath,
  generateSelectionIndices,
  summarizeDurations,
  type BenchResults,
} from './bench/scenario';

export type BenchStatusState = 'initializing' | 'running' | 'done' | 'unsupported' | 'error';

export interface BenchStatus {
  readonly state: BenchStatusState;
  readonly phase?: string;
  readonly backend?: RenderBackend;
  readonly reason?: string;
}

interface BenchGlobal {
  __seatLayoutBenchResults?: BenchResults | null;
  __seatLayoutBenchStatus?: BenchStatus;
  benchDone?: boolean;
}

const DEFAULT_LAYOUT: LayoutKind = 'stadium';
const DEFAULT_SEAT_COUNT = 10_000;
const SEAT_COUNTS = [1_000, 10_000, 100_000, 250_000] as const;
const LAYOUTS = new Set<LayoutKind>(['grid', 'arena', 'stadium']);

interface BenchSelection {
  readonly layout: LayoutKind;
  readonly seatCount: number;
  readonly backend: RenderBackend;
}

export interface BenchAppOptions {
  readonly search?: string;
}

export class BenchApp {
  private renderer: SeatRenderer | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly options: BenchAppOptions = {},
  ) {}

  mount(): void {
    this.setStatus({ state: 'initializing' });
    void this.run();
  }

  private async run(): Promise<void> {
    const t0 = performance.now();
    const selection = this.parseSelection();
    this.setStatus({ state: 'running', phase: 'load', backend: selection.backend });

    try {
      this.sizeCanvas();

      const doc = generateSeatMap({
        layout: selection.layout,
        seatCount: selection.seatCount,
        seed: BENCH_SEED,
      });

      const device = this.createDevice(selection.backend);
      let firstRenderMs = 0;
      let reportedFirstRender = false;
      const renderer = new SeatRenderer(this.canvas, {
        device,
        autoRender: false,
        attachCameraEvents: false,
        attachInteractionEvents: false,
        onFrame: () => {
          if (!reportedFirstRender) {
            reportedFirstRender = true;
            firstRenderMs = performance.now() - t0;
          }
        },
        onError: (error) => {
          this.fail(error.message);
        },
      });

      await renderer.initialize();
      this.renderer = renderer;

      renderer.loadDocument(doc);
      renderer.renderNow(); // trigger first render deterministically

      const panZoom = await this.runPanZoom(renderer, doc);
      const hitTest = this.runHitTest(renderer);
      const selectionToggle = this.runSelectionToggle(renderer, doc);

      const results: BenchResults = {
        loadToFirstRenderMs: round(firstRenderMs),
        panZoom,
        hitTest,
        selectionToggle,
        meta: {
          layout: selection.layout,
          seats: renderer.instanceCount,
          backend: renderer.backendName(),
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        },
      };

      this.publishResults(results);
      this.setStatus({ state: 'done', backend: renderer.backendName() });
      this.setDone();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      if (error instanceof GraphicsDeviceUnsupportedError) {
        this.setStatus({ state: 'unsupported', backend: selection.backend, reason });
        this.publishResults(null);
        this.setDone();
        return;
      }

      this.fail(reason);
    }
  }

  private async runPanZoom(renderer: SeatRenderer, doc: SeatMapDocument): Promise<BenchResults['panZoom']> {
    this.setStatus({ state: 'running', phase: 'panZoom', backend: renderer.backendName() });

    const viewport = renderer.camera.getViewportSize();
    renderer.camera.fitToBounds(doc.bounds, 40);
    const fitZoom = renderer.camera.getZoom();
    const path = generatePanZoomPath({
      bounds: doc.bounds,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      fitZoom,
      sampleCount: BENCH_PAN_ZOOM_SAMPLE_COUNT,
      seed: BENCH_SEED,
    });

    const frameDurations: number[] = [];
    const startTime = performance.now();
    let lastFrameTime = startTime;
    let frameIndex = 0;

    await new Promise<void>((resolve) => {
      const tick = () => {
        const nowTime = performance.now();
        const elapsed = nowTime - startTime;

        if (frameIndex > BENCH_PAN_ZOOM_WARMUP_FRAMES) {
          frameDurations.push(nowTime - lastFrameTime);
        }
        lastFrameTime = nowTime;
        frameIndex += 1;

        const progress = Math.min(0.999999, elapsed / BENCH_PAN_ZOOM_DURATION_MS);
        const pose = path[Math.min(path.length - 1, Math.floor(progress * path.length))];

        renderer.camera.setView(pose.centerX, pose.centerY, pose.baseZoom);
        renderer.camera.setZoomAt(pose.anchorScreenX, pose.anchorScreenY, pose.zoom);
        renderer.renderNow();

        if (elapsed >= BENCH_PAN_ZOOM_DURATION_MS) {
          resolve();
          return;
        }

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });

    const summary = summarizeDurations(frameDurations);
    const minFps = summary.maxMs > 0 ? 1000 / summary.maxMs : 0;

    return {
      avgFrameMs: round(summary.avgMs),
      p95FrameMs: round(summary.p95Ms),
      minFps: round(minFps),
    };
  }

  private runHitTest(renderer: SeatRenderer): BenchResults['hitTest'] {
    this.setStatus({ state: 'running', phase: 'hitTest', backend: renderer.backendName() });

    // Frame the whole map so central hit-test points land on dense seat regions.
    const points = generateHitTestPoints({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      count: BENCH_HIT_TEST_COUNT,
      seed: BENCH_SEED,
    });

    const durations: number[] = [];
    for (const point of points) {
      const start = performance.now();
      renderer.pickAtClient(point.x, point.y);
      durations.push(performance.now() - start);
    }

    const summary = summarizeDurations(durations);
    return { p50Ms: round(summary.p50Ms), p95Ms: round(summary.p95Ms) };
  }

  private runSelectionToggle(
    renderer: SeatRenderer,
    doc: SeatMapDocument,
  ): BenchResults['selectionToggle'] {
    this.setStatus({ state: 'running', phase: 'selectionToggle', backend: renderer.backendName() });

    const flat = flattenSeatMap(doc);
    const availableIndices: number[] = [];
    for (let i = 0; i < flat.stateFlags.length; i += 1) {
      if ((flat.stateFlags[i] & SEAT_STATE_FLAG_UNAVAILABLE) === 0) {
        availableIndices.push(i);
      }
    }

    const indices = generateSelectionIndices({
      availableIndices,
      count: BENCH_SELECTION_TOGGLE_COUNT,
      seed: BENCH_SEED,
    });

    // Zoom in on the dense center so the per-toggle metric reflects the WASM
    // state write + dirty-range GPU upload rather than a full-map redraw.
    const midX = (doc.bounds.minX + doc.bounds.maxX) * 0.5;
    const midY = (doc.bounds.minY + doc.bounds.maxY) * 0.5;
    renderer.camera.setView(midX, midY, renderer.camera.getZoomLimits().max * 0.05 + renderer.camera.getZoom());
    renderer.renderNow();

    const durations: number[] = [];
    for (const index of indices) {
      const start = performance.now();
      // Single-seat selection: each step toggles the previous seat off and the
      // new seat on, then uploads the dirty instance range via renderNow().
      renderer.setSelection([index]);
      renderer.renderNow();
      durations.push(performance.now() - start);
    }

    renderer.clearSelection();
    renderer.renderNow();

    const summary = summarizeDurations(durations);
    return { avgMs: round(summary.avgMs), p95Ms: round(summary.p95Ms) };
  }

  private createDevice(backend: RenderBackend): GraphicsDevice {
    if (backend === 'webgl2') {
      return new WebGl2Device(this.canvas, {});
    }

    return new WebGpuDevice(this.canvas, {});
  }

  private sizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
    this.canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  }

  private parseSelection(): BenchSelection {
    const params = new URLSearchParams(this.options.search ?? window.location.search);
    const layoutParam = params.get('layout');
    const layout =
      layoutParam && LAYOUTS.has(layoutParam as LayoutKind)
        ? (layoutParam as LayoutKind)
        : DEFAULT_LAYOUT;
    const backendParam = params.get('backend');
    const backend: RenderBackend = backendParam === 'webgl2' ? 'webgl2' : 'webgpu';

    return { layout, seatCount: clampSeatCount(params.get('seats')), backend };
  }

  private fail(reason: string): void {
    this.setStatus({ state: 'error', reason });
    this.publishResults(null);
    this.setDone();
  }

  private setStatus(status: BenchStatus): void {
    this.canvas.dataset.benchStatus = status.state;
    if (status.phase) {
      this.canvas.dataset.benchPhase = status.phase;
    }
    (globalThis as typeof globalThis & BenchGlobal).__seatLayoutBenchStatus = status;
  }

  private publishResults(results: BenchResults | null): void {
    (globalThis as typeof globalThis & BenchGlobal).__seatLayoutBenchResults = results;
  }

  private setDone(): void {
    (globalThis as typeof globalThis & BenchGlobal).benchDone = true;
    this.canvas.dataset.benchDone = 'true';
  }
}

function clampSeatCount(value: string | null): number {
  const parsed = value === null ? DEFAULT_SEAT_COUNT : Number(value);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_SEAT_COUNT;
  }

  for (const seatCount of SEAT_COUNTS) {
    if (parsed <= seatCount) {
      return seatCount;
    }
  }

  return SEAT_COUNTS[SEAT_COUNTS.length - 1];
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
