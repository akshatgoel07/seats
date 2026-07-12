import { describe, expect, it } from 'vitest';
import { generateSeatMap, mulberry32, type LayoutKind } from '../../fixtures/generate';
import {
  countSeats,
  flattenSeatMap,
  validateSeatMapDocument,
  type FlattenedSeatMap,
  type SeatMapDocument,
  type SeatStatus,
} from '../../shared/seat-map';

const LAYOUTS: LayoutKind[] = ['grid', 'arena', 'stadium'];

/** Deterministic FNV-1a hash over a JSON string. */
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/** Sample flattened attributes at a stride to avoid comparing every seat. */
function sampleFlat(flat: FlattenedSeatMap, stride: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < flat.count; i += stride) {
    out.push(
      flat.x[i],
      flat.y[i],
      flat.size[i],
      flat.rotation[i],
      flat.colorIndex[i],
      flat.stateFlags[i],
    );
  }
  return out;
}

function statusCounts(doc: SeatMapDocument): Record<SeatStatus, number> {
  const counts: Record<SeatStatus, number> = { available: 0, sold: 0, blocked: 0, held: 0 };
  for (const section of doc.sections) {
    for (const row of section.rows) {
      for (const seat of row.seats) {
        counts[seat.status]++;
      }
    }
  }
  return counts;
}

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
});

describe('generateSeatMap — determinism', () => {
  it('produces deeply-identical documents for the same seed + params (1k)', () => {
    for (const layout of LAYOUTS) {
      const a = generateSeatMap({ layout, seatCount: 1_000, seed: 42 });
      const b = generateSeatMap({ layout, seatCount: 1_000, seed: 42 });
      expect(a).toEqual(b);
      expect(hashString(JSON.stringify(a))).toBe(hashString(JSON.stringify(b)));
    }
  });

  it('produces identical full-document hashes at 10k', () => {
    for (const layout of LAYOUTS) {
      const a = generateSeatMap({ layout, seatCount: 10_000, seed: 5 });
      const b = generateSeatMap({ layout, seatCount: 10_000, seed: 5 });
      expect(hashString(JSON.stringify(a))).toBe(hashString(JSON.stringify(b)));
    }
  });

  it('changes output when the seed changes', () => {
    const a = generateSeatMap({ layout: 'grid', seatCount: 1_000, seed: 1 });
    const b = generateSeatMap({ layout: 'grid', seatCount: 1_000, seed: 2 });
    expect(hashString(JSON.stringify(a))).not.toBe(hashString(JSON.stringify(b)));
  });

  it('is deterministic at 100k and 250k via sampled comparison', () => {
    for (const seatCount of [100_000, 250_000]) {
      const a = flattenSeatMap(generateSeatMap({ layout: 'stadium', seatCount, seed: 11 }));
      const b = flattenSeatMap(generateSeatMap({ layout: 'stadium', seatCount, seed: 11 }));
      expect(a.count).toBe(b.count);
      expect(sampleFlat(a, 997)).toEqual(sampleFlat(b, 997));
    }
  });
});

describe('generateSeatMap — counts and structure', () => {
  it('produces exactly seatCount seats for every layout and size', () => {
    for (const layout of LAYOUTS) {
      for (const seatCount of [1, 1_000, 10_000]) {
        const doc = generateSeatMap({ layout, seatCount, seed: 3 });
        expect(countSeats(doc)).toBe(seatCount);
      }
    }
  });

  it('produces exact counts at 100k and 250k', () => {
    for (const seatCount of [100_000, 250_000]) {
      for (const layout of LAYOUTS) {
        const doc = generateSeatMap({ layout, seatCount, seed: 8 });
        expect(countSeats(doc)).toBe(seatCount);
      }
    }
  });

  it('spreads seats across many sections/rows (never one giant row)', () => {
    for (const layout of LAYOUTS) {
      const doc = generateSeatMap({ layout, seatCount: 10_000, seed: 2 });
      expect(doc.sections.length).toBeGreaterThan(1);
      let maxRowLen = 0;
      let rowCount = 0;
      for (const section of doc.sections) {
        rowCount += section.rows.length;
        for (const row of section.rows) {
          maxRowLen = Math.max(maxRowLen, row.seats.length);
        }
      }
      expect(rowCount).toBeGreaterThan(10);
      expect(maxRowLen).toBeLessThan(1_000);
    }
  });

  it('generated documents pass validation at 100k', () => {
    for (const layout of LAYOUTS) {
      const doc = generateSeatMap({ layout, seatCount: 100_000, seed: 4 });
      expect(validateSeatMapDocument(doc).errors.slice(0, 5)).toEqual([]);
    }
  });
});

describe('generateSeatMap — bounds', () => {
  it('keeps every seat center within the document bounds (all layouts, 100k)', () => {
    for (const layout of LAYOUTS) {
      const doc = generateSeatMap({ layout, seatCount: 100_000, seed: 6 });
      const flat = flattenSeatMap(doc);
      const { minX, minY, maxX, maxY } = doc.bounds;
      // Aggregate the observed extents in one pass (avoids 400k expect() calls).
      let oMinX = Number.POSITIVE_INFINITY;
      let oMinY = Number.POSITIVE_INFINITY;
      let oMaxX = Number.NEGATIVE_INFINITY;
      let oMaxY = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < flat.count; i++) {
        if (flat.x[i] < oMinX) oMinX = flat.x[i];
        if (flat.x[i] > oMaxX) oMaxX = flat.x[i];
        if (flat.y[i] < oMinY) oMinY = flat.y[i];
        if (flat.y[i] > oMaxY) oMaxY = flat.y[i];
      }
      expect(oMinX).toBeGreaterThanOrEqual(minX);
      expect(oMaxX).toBeLessThanOrEqual(maxX);
      expect(oMinY).toBeGreaterThanOrEqual(minY);
      expect(oMaxY).toBeLessThanOrEqual(maxY);
    }
  });
});

describe('generateSeatMap — status distribution', () => {
  it('matches the target distribution within tolerance', () => {
    const total = 40_000;
    const doc = generateSeatMap({ layout: 'grid', seatCount: total, seed: 99 });
    const counts = statusCounts(doc);
    expect(counts.available / total).toBeCloseTo(0.7, 1);
    expect(counts.sold / total).toBeCloseTo(0.2, 1);
    expect(Math.abs(counts.held / total - 0.05)).toBeLessThan(0.02);
    expect(Math.abs(counts.blocked / total - 0.05)).toBeLessThan(0.02);
  });
});
