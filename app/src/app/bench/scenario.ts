/**
 * Deterministic scripted-scenario helpers for the seat-layout-v4 benchmark
 * harness (T8).
 *
 * Everything in this module is a pure function of its inputs so the scripted
 * camera path, hit-test sample points, and selection-churn indices are
 * byte-for-byte reproducible: the same `{ seed, ... }` always yields the same
 * waypoints. This lets the harness produce comparable baselines run over run
 * and lets unit tests assert determinism without a browser.
 */

import { mulberry32 } from '../../fixtures/generate';
import type { Bounds } from '../../shared/seat-map';
import type { RenderBackend } from '../../renderer/graphics/RenderTypes';

// ---------------------------------------------------------------------------
// Scenario constants (shared by BenchApp and the runner-facing schema).
// ---------------------------------------------------------------------------

export const BENCH_SEED = 20260712;
export const BENCH_PAN_ZOOM_DURATION_MS = 5000;
export const BENCH_PAN_ZOOM_SAMPLE_COUNT = 300;
export const BENCH_PAN_ZOOM_WARMUP_FRAMES = 3;
export const BENCH_HIT_TEST_COUNT = 200;
export const BENCH_SELECTION_TOGGLE_COUNT = 500;

// ---------------------------------------------------------------------------
// Percentile / summary helpers.
// ---------------------------------------------------------------------------

/**
 * Nearest-rank percentile over an unsorted numeric sample. `p` is a fraction in
 * [0, 1]. Returns 0 for an empty sample. Matches the p95 convention used by the
 * renderer's rolling frame stats (`ceil(p * n) - 1`).
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const clampedP = Math.min(1, Math.max(0, p));
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(clampedP * sorted.length) - 1));
  return sorted[index];
}

export interface DurationSummary {
  readonly count: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly minMs: number;
  readonly maxMs: number;
}

/** Summarize a set of per-operation durations (milliseconds). */
export function summarizeDurations(values: readonly number[]): DurationSummary {
  if (values.length === 0) {
    return { count: 0, avgMs: 0, p50Ms: 0, p95Ms: 0, minMs: 0, maxMs: 0 };
  }

  let total = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const value of values) {
    total += value;
    if (value < min) min = value;
    if (value > max) max = value;
  }

  return {
    count: values.length,
    avgMs: total / values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    minMs: min,
    maxMs: max,
  };
}

// ---------------------------------------------------------------------------
// Scripted pan/zoom camera path.
// ---------------------------------------------------------------------------

export interface PanZoomPathParams {
  readonly bounds: Bounds;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Fit-to-bounds zoom; the pan level shows (roughly) the whole map. */
  readonly fitZoom: number;
  readonly sampleCount: number;
  readonly seed: number;
}

export interface PanZoomPose {
  /** Normalized progress in [0, 1). */
  readonly t: number;
  readonly centerX: number;
  readonly centerY: number;
  /** Pan-level zoom (whole-map framing) before the anchored zoom pulse. */
  readonly baseZoom: number;
  /** Final target zoom after the cursor-anchored zoom-in pulse. */
  readonly zoom: number;
  /** Screen-space (device px) anchor for cursor-anchored zooming. */
  readonly anchorScreenX: number;
  readonly anchorScreenY: number;
}

/**
 * Generate a deterministic scripted pan/zoom path: a sinusoidal pan sweeping
 * across the map combined with a cursor-anchored zoom-in/zoom-out cycle. The
 * anchor orbits the dense center of the viewport so zooms land on seat-dense
 * regions. Identical params always yield an identical array of poses.
 */
export function generatePanZoomPath(params: PanZoomPathParams): PanZoomPose[] {
  const { bounds, viewportWidth, viewportHeight, fitZoom, sampleCount, seed } = params;

  if (!Number.isInteger(sampleCount) || sampleCount <= 0) {
    throw new Error(`sampleCount must be a positive integer, got ${sampleCount}`);
  }

  const rng = mulberry32(seed);
  const midX = (bounds.minX + bounds.maxX) * 0.5;
  const midY = (bounds.minY + bounds.maxY) * 0.5;
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);

  // Pan amplitude covers ~40% of the map half-span in each axis.
  const ampX = spanX * 0.4;
  const ampY = spanY * 0.4;

  // Seeded but stable frequencies/phases so runs are comparable yet not trivial.
  const panFreqX = 1 + Math.floor(rng() * 2); // 1..2 cycles across the run
  const panFreqY = 1 + Math.floor(rng() * 2);
  const phaseX = rng() * Math.PI * 2;
  const phaseY = rng() * Math.PI * 2;
  const zoomFreq = 2 + Math.floor(rng() * 2); // 2..3 zoom cycles across the run
  const anchorFreq = 1 + Math.floor(rng() * 2);
  const anchorPhase = rng() * Math.PI * 2;

  // Zoom-in pulse: baseZoom -> baseZoom * exp(zoomInAmp) at the peak.
  const zoomInAmp = Math.log(8);

  const poses: PanZoomPose[] = [];

  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleCount;
    const centerX = midX + ampX * Math.sin(2 * Math.PI * panFreqX * t + phaseX);
    const centerY = midY + ampY * Math.sin(2 * Math.PI * panFreqY * t + phaseY);
    // 0 at cycle start (framed out), 1 at cycle peak (zoomed in on seats).
    const zoomPulse = 0.5 - 0.5 * Math.cos(2 * Math.PI * zoomFreq * t);
    const baseZoom = fitZoom;
    const zoom = fitZoom * Math.exp(zoomInAmp * zoomPulse);
    const anchorScreenX =
      viewportWidth * 0.5 + viewportWidth * 0.15 * Math.cos(2 * Math.PI * anchorFreq * t + anchorPhase);
    const anchorScreenY =
      viewportHeight * 0.5 + viewportHeight * 0.15 * Math.sin(2 * Math.PI * anchorFreq * t + anchorPhase);

    poses.push({ t, centerX, centerY, baseZoom, zoom, anchorScreenX, anchorScreenY });
  }

  return poses;
}

// ---------------------------------------------------------------------------
// Hit-test sample points (CSS pixels within the full-viewport canvas).
// ---------------------------------------------------------------------------

export interface HitTestPointParams {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly count: number;
  readonly seed: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Generate deterministic hit-test sample points concentrated in the dense
 * central 60% of the viewport (where a fitted seat map has the most seats).
 */
export function generateHitTestPoints(params: HitTestPointParams): ScreenPoint[] {
  const { viewportWidth, viewportHeight, count, seed } = params;

  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`count must be a positive integer, got ${count}`);
  }

  const rng = mulberry32(seed);
  const points: ScreenPoint[] = [];

  for (let i = 0; i < count; i += 1) {
    // Two averaged uniforms approximate a centered, bell-ish distribution.
    const fx = (rng() + rng()) * 0.5;
    const fy = (rng() + rng()) * 0.5;
    const x = viewportWidth * (0.2 + 0.6 * fx);
    const y = viewportHeight * (0.2 + 0.6 * fy);
    points.push({ x, y });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Selection-churn indices.
// ---------------------------------------------------------------------------

export interface SelectionIndicesParams {
  readonly availableIndices: readonly number[];
  readonly count: number;
  readonly seed: number;
}

/**
 * Pick `count` seat indices to toggle, spread evenly across the available set
 * with a seeded jitter so the churn touches distinct seats deterministically.
 * If fewer than `count` seats are available, every available seat is returned
 * (still deterministically ordered).
 */
export function generateSelectionIndices(params: SelectionIndicesParams): number[] {
  const { availableIndices, count, seed } = params;

  if (availableIndices.length === 0 || count <= 0) {
    return [];
  }

  const rng = mulberry32(seed);
  const total = availableIndices.length;
  const take = Math.min(count, total);
  const step = total / take;
  const picked: number[] = [];

  for (let i = 0; i < take; i += 1) {
    const jitter = Math.floor(rng() * step);
    const slot = Math.min(total - 1, Math.floor(i * step) + jitter);
    picked.push(availableIndices[slot]);
  }

  return picked;
}

// ---------------------------------------------------------------------------
// Result schema + validation (shared contract with scripts/bench.mjs).
// ---------------------------------------------------------------------------

export interface BenchPanZoomResult {
  readonly avgFrameMs: number;
  readonly p95FrameMs: number;
  readonly minFps: number;
}

export interface BenchHitTestResult {
  readonly p50Ms: number;
  readonly p95Ms: number;
}

export interface BenchSelectionToggleResult {
  readonly avgMs: number;
  readonly p95Ms: number;
}

export interface BenchResultMeta {
  readonly layout: string;
  readonly seats: number;
  readonly backend: RenderBackend;
  readonly timestamp: string;
  readonly userAgent: string;
}

export interface BenchResults {
  readonly loadToFirstRenderMs: number;
  readonly panZoom: BenchPanZoomResult;
  readonly hitTest: BenchHitTestResult;
  readonly selectionToggle: BenchSelectionToggleResult;
  readonly meta: BenchResultMeta;
}

export interface BenchValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Structurally validate a {@link BenchResults} object. Used both as a runtime
 * guard in the runner and as a unit-tested schema contract.
 */
export function validateBenchResults(value: unknown): BenchValidationResult {
  const errors: string[] = [];

  if (typeof value !== 'object' || value === null) {
    return { ok: false, errors: ['results must be a non-null object'] };
  }

  const record = value as Record<string, unknown>;

  if (!isFiniteNumber(record.loadToFirstRenderMs) || record.loadToFirstRenderMs < 0) {
    errors.push('loadToFirstRenderMs must be a non-negative finite number');
  }

  const panZoom = record.panZoom as Record<string, unknown> | undefined;
  if (typeof panZoom !== 'object' || panZoom === null) {
    errors.push('panZoom must be an object');
  } else {
    if (!isFiniteNumber(panZoom.avgFrameMs)) errors.push('panZoom.avgFrameMs must be a finite number');
    if (!isFiniteNumber(panZoom.p95FrameMs)) errors.push('panZoom.p95FrameMs must be a finite number');
    if (!isFiniteNumber(panZoom.minFps)) errors.push('panZoom.minFps must be a finite number');
  }

  const hitTest = record.hitTest as Record<string, unknown> | undefined;
  if (typeof hitTest !== 'object' || hitTest === null) {
    errors.push('hitTest must be an object');
  } else {
    if (!isFiniteNumber(hitTest.p50Ms)) errors.push('hitTest.p50Ms must be a finite number');
    if (!isFiniteNumber(hitTest.p95Ms)) errors.push('hitTest.p95Ms must be a finite number');
  }

  const selectionToggle = record.selectionToggle as Record<string, unknown> | undefined;
  if (typeof selectionToggle !== 'object' || selectionToggle === null) {
    errors.push('selectionToggle must be an object');
  } else {
    if (!isFiniteNumber(selectionToggle.avgMs)) errors.push('selectionToggle.avgMs must be a finite number');
    if (!isFiniteNumber(selectionToggle.p95Ms)) errors.push('selectionToggle.p95Ms must be a finite number');
  }

  const meta = record.meta as Record<string, unknown> | undefined;
  if (typeof meta !== 'object' || meta === null) {
    errors.push('meta must be an object');
  } else {
    if (typeof meta.layout !== 'string') errors.push('meta.layout must be a string');
    if (!isFiniteNumber(meta.seats)) errors.push('meta.seats must be a finite number');
    if (meta.backend !== 'webgpu' && meta.backend !== 'webgl2')
      errors.push('meta.backend must be "webgpu" or "webgl2"');
    if (typeof meta.timestamp !== 'string') errors.push('meta.timestamp must be a string');
    if (typeof meta.userAgent !== 'string') errors.push('meta.userAgent must be a string');
  }

  return { ok: errors.length === 0, errors };
}

/** Narrowing type guard backed by {@link validateBenchResults}. */
export function isBenchResults(value: unknown): value is BenchResults {
  return validateBenchResults(value).ok;
}
