import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateSeatMap } from '../../fixtures/generate';
import {
  SEAT_INSTANCE_STRIDE_BYTES,
  SEAT_STATE_FLAG_HOVERED,
  SEAT_STATE_FLAG_SELECTED,
} from '../../shared/instance-layout';
import { flattenSeatMap, type FlattenedSeatMap } from '../../shared/seat-map';
import { SeatLayoutCore, type WasmRangeBufferView } from '../../wasm/SeatLayoutCore';

const SEAT_COUNT = 100_000;

let core: SeatLayoutCore;
let flat: FlattenedSeatMap;
let rebuildMs = 0;

function activeRangeWords(view: WasmRangeBufferView): number[] {
  return Array.from(view.data.subarray(0, view.length));
}

function bruteForceViewportRanges(
  map: FlattenedSeatMap,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): number[] {
  const ranges: number[] = [];
  let openStart = -1;

  for (let i = 0; i < map.count; i++) {
    const half = map.size[i] * 0.5;
    const visible =
      map.x[i] - half <= maxX &&
      map.x[i] + half >= minX &&
      map.y[i] - half <= maxY &&
      map.y[i] + half >= minY;

    if (visible && openStart < 0) {
      openStart = i;
    } else if (!visible && openStart >= 0) {
      ranges.push(openStart, i - openStart);
      openStart = -1;
    }
  }

  if (openStart >= 0) {
    ranges.push(openStart, map.count - openStart);
  }

  return ranges;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

beforeAll(async () => {
  const wasmBytes = await readFile(
    new URL('../../generated/wasm/seat_layout_core/seat_layout_core_bg.wasm', import.meta.url),
  );
  core = await SeatLayoutCore.create(wasmBytes);
  flat = flattenSeatMap(generateSeatMap({ layout: 'grid', seatCount: SEAT_COUNT, seed: 321 }));

  const rebuildStart = performance.now();
  core.loadFlattened(flat);
  rebuildMs = performance.now() - rebuildStart;
  // eslint-disable-next-line no-console
  console.log(`[wasm-core bench] rebuild 100k: ${rebuildMs.toFixed(3)} ms`);
});

describe('SeatLayoutCore wasm integration', () => {
  it('loads the 100k grid fixture and exposes the instance buffer views', () => {
    expect(core.initialized).toBe(true);
    expect(core.instanceCount).toBe(SEAT_COUNT);
    expect(core.instanceStrideBytes).toBe(SEAT_INSTANCE_STRIDE_BYTES);
    expect(core.instanceViews.f32[0]).toBeCloseTo(flat.x[0]);
    expect(core.instanceViews.f32[1]).toBeCloseTo(flat.y[0]);
    expect(core.instanceViews.u32[4]).toBe(flat.colorIndex[0]);
    expect(core.dirtyRanges.rangeCount).toBe(1);
    expect(activeRangeWords(core.dirtyRanges)).toEqual([0, SEAT_COUNT]);
  });

  it('returns viewport ranges matching a JS brute-force filter', () => {
    const viewport = { minX: 12, minY: 8, maxX: 72, maxY: 41 };
    const ranges = core.queryViewport(viewport.minX, viewport.minY, viewport.maxX, viewport.maxY);
    expect(activeRangeWords(ranges)).toEqual(
      bruteForceViewportRanges(flat, viewport.minX, viewport.minY, viewport.maxX, viewport.maxY),
    );
  });

  it('hit-tests five known grid seats', () => {
    for (const index of [0, 997, 12_345, 54_321, SEAT_COUNT - 1]) {
      expect(core.hitTest(flat.x[index], flat.y[index], 0)).toBe(index);
    }
  });

  it('coalesces dirty ranges for single, range, and staged bulk state updates', () => {
    core.loadFlattened(flat);
    expect(activeRangeWords(core.dirtyRanges)).toEqual([0, SEAT_COUNT]);

    core.clearDirtyRanges();
    expect(activeRangeWords(core.dirtyRanges)).toEqual([]);

    core.setStateFlags(10, SEAT_STATE_FLAG_SELECTED);
    core.setStateFlags(11, SEAT_STATE_FLAG_SELECTED);
    core.setStateFlags(13, SEAT_STATE_FLAG_SELECTED);
    expect(activeRangeWords(core.dirtyRanges)).toEqual([10, 2, 13, 1]);

    core.setStateFlags(12, SEAT_STATE_FLAG_SELECTED);
    expect(activeRangeWords(core.dirtyRanges)).toEqual([10, 4]);

    core.clearDirtyRanges();
    core.setStateFlagsBulk(new Uint32Array([20, 21, 23]), SEAT_STATE_FLAG_SELECTED);
    core.setStateFlagsRange(24, 2, SEAT_STATE_FLAG_SELECTED | SEAT_STATE_FLAG_HOVERED);
    expect(activeRangeWords(core.dirtyRanges)).toEqual([20, 2, 23, 3]);
  });

  it('records hit_test x1000 and rebuild micro-bench timings at 100k', () => {
    const batchTimings: number[] = [];
    for (let round = 0; round < 11; round++) {
      const start = performance.now();
      for (let i = 0; i < 1_000; i++) {
        const index = (i * 7_919 + round * 104_729) % SEAT_COUNT;
        core.hitTest(flat.x[index], flat.y[index], 0);
      }
      batchTimings.push(performance.now() - start);
    }

    const p50BatchMs = median(batchTimings);
    // eslint-disable-next-line no-console
    console.log(
      `[wasm-core bench] hit_test x1000 p50: ${p50BatchMs.toFixed(3)} ms (${p50BatchMs.toFixed(
        3,
      )} us/call)`,
    );

    expect(p50BatchMs).toBeGreaterThanOrEqual(0);
    expect(rebuildMs).toBeGreaterThan(0);
  });
});
