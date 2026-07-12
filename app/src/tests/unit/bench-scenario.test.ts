import { describe, expect, it } from 'vitest';

import {
  BENCH_HIT_TEST_COUNT,
  BENCH_PAN_ZOOM_SAMPLE_COUNT,
  BENCH_SELECTION_TOGGLE_COUNT,
  generateHitTestPoints,
  generatePanZoomPath,
  generateSelectionIndices,
  percentile,
  summarizeDurations,
  validateBenchResults,
  isBenchResults,
  type BenchResults,
  type PanZoomPathParams,
} from '../../app/bench/scenario';

const BOUNDS = { minX: -10, minY: -20, maxX: 90, maxY: 180 };

function panZoomParams(overrides: Partial<PanZoomPathParams> = {}): PanZoomPathParams {
  return {
    bounds: BOUNDS,
    viewportWidth: 1280,
    viewportHeight: 720,
    fitZoom: 3.5,
    sampleCount: BENCH_PAN_ZOOM_SAMPLE_COUNT,
    seed: 20260712,
    ...overrides,
  };
}

describe('percentile', () => {
  it('returns 0 for an empty sample', () => {
    expect(percentile([], 0.95)).toBe(0);
  });

  it('uses nearest-rank ordering regardless of input order', () => {
    const values = [5, 1, 4, 2, 3];
    expect(percentile(values, 0.5)).toBe(3);
    expect(percentile(values, 0.95)).toBe(5);
    expect(percentile(values, 0)).toBe(1);
    expect(percentile(values, 1)).toBe(5);
  });
});

describe('summarizeDurations', () => {
  it('summarizes a set of durations', () => {
    const summary = summarizeDurations([2, 4, 6, 8]);
    expect(summary.count).toBe(4);
    expect(summary.avgMs).toBe(5);
    expect(summary.minMs).toBe(2);
    expect(summary.maxMs).toBe(8);
    expect(summary.p50Ms).toBe(4);
    expect(summary.p95Ms).toBe(8);
  });

  it('returns zeroes for an empty sample', () => {
    expect(summarizeDurations([])).toEqual({
      count: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      minMs: 0,
      maxMs: 0,
    });
  });
});

describe('generatePanZoomPath determinism', () => {
  it('produces identical waypoints for identical params', () => {
    const a = generatePanZoomPath(panZoomParams());
    const b = generatePanZoomPath(panZoomParams());
    expect(a).toEqual(b);
    expect(a).toHaveLength(BENCH_PAN_ZOOM_SAMPLE_COUNT);
  });

  it('changes when the seed changes', () => {
    const a = generatePanZoomPath(panZoomParams({ seed: 1 }));
    const b = generatePanZoomPath(panZoomParams({ seed: 2 }));
    expect(a).not.toEqual(b);
  });

  it('keeps poses finite and normalized', () => {
    const path = generatePanZoomPath(panZoomParams({ sampleCount: 16 }));
    expect(path).toHaveLength(16);
    for (let i = 0; i < path.length; i += 1) {
      const pose = path[i];
      expect(pose.t).toBeCloseTo(i / 16);
      expect(Number.isFinite(pose.centerX)).toBe(true);
      expect(Number.isFinite(pose.centerY)).toBe(true);
      expect(pose.zoom).toBeGreaterThanOrEqual(pose.baseZoom - 1e-9);
      expect(pose.anchorScreenX).toBeGreaterThanOrEqual(0);
      expect(pose.anchorScreenY).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects a non-positive sample count', () => {
    expect(() => generatePanZoomPath(panZoomParams({ sampleCount: 0 }))).toThrow();
  });
});

describe('generateHitTestPoints determinism', () => {
  it('produces identical points for identical params and stays within bounds', () => {
    const params = { viewportWidth: 1280, viewportHeight: 720, count: BENCH_HIT_TEST_COUNT, seed: 7 };
    const a = generateHitTestPoints(params);
    const b = generateHitTestPoints(params);
    expect(a).toEqual(b);
    expect(a).toHaveLength(BENCH_HIT_TEST_COUNT);
    for (const point of a) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1280);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(720);
    }
  });

  it('changes with the seed', () => {
    const base = { viewportWidth: 800, viewportHeight: 600, count: 32 };
    expect(generateHitTestPoints({ ...base, seed: 1 })).not.toEqual(
      generateHitTestPoints({ ...base, seed: 2 }),
    );
  });
});

describe('generateSelectionIndices determinism', () => {
  const availableIndices = Array.from({ length: 5000 }, (_, i) => i * 2);

  it('produces identical, in-range indices for identical params', () => {
    const a = generateSelectionIndices({
      availableIndices,
      count: BENCH_SELECTION_TOGGLE_COUNT,
      seed: 99,
    });
    const b = generateSelectionIndices({
      availableIndices,
      count: BENCH_SELECTION_TOGGLE_COUNT,
      seed: 99,
    });
    expect(a).toEqual(b);
    expect(a).toHaveLength(BENCH_SELECTION_TOGGLE_COUNT);
    for (const index of a) {
      expect(availableIndices).toContain(index);
    }
  });

  it('caps at the number of available seats', () => {
    const result = generateSelectionIndices({
      availableIndices: [10, 20, 30],
      count: 500,
      seed: 1,
    });
    expect(result).toHaveLength(3);
  });

  it('returns an empty array when nothing is available', () => {
    expect(generateSelectionIndices({ availableIndices: [], count: 500, seed: 1 })).toEqual([]);
  });
});

describe('validateBenchResults', () => {
  const validResults: BenchResults = {
    loadToFirstRenderMs: 123.4,
    panZoom: { avgFrameMs: 12, p95FrameMs: 17, minFps: 58 },
    hitTest: { p50Ms: 0.4, p95Ms: 1.1 },
    selectionToggle: { avgMs: 1.2, p95Ms: 3.4 },
    meta: {
      layout: 'stadium',
      seats: 100000,
      backend: 'webgpu',
      timestamp: '2026-07-12T00:00:00.000Z',
      userAgent: 'test',
    },
  };

  it('accepts a well-formed result', () => {
    const result = validateBenchResults(validResults);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(isBenchResults(validResults)).toBe(true);
  });

  it('rejects a null value', () => {
    expect(validateBenchResults(null).ok).toBe(false);
    expect(isBenchResults(null)).toBe(false);
  });

  it('reports missing and malformed fields', () => {
    const broken = {
      ...validResults,
      loadToFirstRenderMs: -1,
      panZoom: { avgFrameMs: 'x', p95FrameMs: 17, minFps: 58 },
      meta: { ...validResults.meta, backend: 'vulkan' },
    };
    const result = validateBenchResults(broken);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('loadToFirstRenderMs must be a non-negative finite number');
    expect(result.errors).toContain('panZoom.avgFrameMs must be a finite number');
    expect(result.errors).toContain('meta.backend must be "webgpu" or "webgl2"');
  });
});
