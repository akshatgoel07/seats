import { describe, expect, it } from 'vitest';
import { generateSeatMap } from '../../fixtures/generate';
import {
  STATE_FLAG_UNAVAILABLE,
  applyTransform,
  assertSeatMapDocument,
  countSeats,
  flattenSeatMap,
  statusToStateFlags,
  validateSeatMapDocument,
  type SeatMapDocument,
} from '../../shared/seat-map';

function cloneDoc(doc: SeatMapDocument): SeatMapDocument {
  return JSON.parse(JSON.stringify(doc)) as SeatMapDocument;
}

describe('validateSeatMapDocument', () => {
  it('accepts generated documents for every layout', () => {
    for (const layout of ['grid', 'arena', 'stadium'] as const) {
      const doc = generateSeatMap({ layout, seatCount: 1_000, seed: 7 });
      const result = validateSeatMapDocument(doc);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
      expect(() => assertSeatMapDocument(doc)).not.toThrow();
    }
  });

  it('rejects a non-object', () => {
    expect(validateSeatMapDocument(null).valid).toBe(false);
    expect(validateSeatMapDocument(42).valid).toBe(false);
    expect(validateSeatMapDocument([]).valid).toBe(false);
  });

  it('rejects a missing/empty id', () => {
    const doc = cloneDoc(generateSeatMap({ layout: 'grid', seatCount: 100, seed: 1 }));
    (doc as { id: string }).id = '';
    const result = validateSeatMapDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('document.id'))).toBe(true);
  });

  it('rejects inverted bounds (min > max)', () => {
    const doc = cloneDoc(generateSeatMap({ layout: 'grid', seatCount: 100, seed: 1 }));
    (doc as { bounds: { minX: number; maxX: number } }).bounds.minX = 999;
    (doc as { bounds: { minX: number; maxX: number } }).bounds.maxX = -999;
    const result = validateSeatMapDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('minX must be <= maxX'))).toBe(true);
  });

  it('rejects a non-positive seat size', () => {
    const doc = cloneDoc(generateSeatMap({ layout: 'grid', seatCount: 100, seed: 1 }));
    (doc.sections[0].rows[0].seats[0] as { size: number }).size = 0;
    const result = validateSeatMapDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('size: must be > 0'))).toBe(true);
  });

  it('rejects an out-of-range categoryIndex', () => {
    const doc = cloneDoc(generateSeatMap({ layout: 'grid', seatCount: 100, seed: 1 }));
    (doc.sections[0].rows[0].seats[0] as { categoryIndex: number }).categoryIndex = 999;
    const result = validateSeatMapDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('categoryIndex'))).toBe(true);
  });

  it('rejects an unknown status', () => {
    const doc = cloneDoc(generateSeatMap({ layout: 'grid', seatCount: 100, seed: 1 }));
    (doc.sections[0].rows[0].seats[0] as { status: string }).status = 'reserved';
    const result = validateSeatMapDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('rejects sections that are not an array', () => {
    const doc = cloneDoc(generateSeatMap({ layout: 'grid', seatCount: 100, seed: 1 }));
    (doc as unknown as { sections: unknown }).sections = 'nope';
    const result = validateSeatMapDocument(doc);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('document.sections'))).toBe(true);
  });

  it('rejects an empty categories array', () => {
    const doc = cloneDoc(generateSeatMap({ layout: 'grid', seatCount: 100, seed: 1 }));
    (doc as unknown as { categories: unknown[] }).categories = [];
    const result = validateSeatMapDocument(doc);
    expect(result.valid).toBe(false);
  });
});

describe('statusToStateFlags', () => {
  it('encodes available as the default (no unavailable bit)', () => {
    expect(statusToStateFlags('available')).toBe(0);
  });

  it('sets the unavailable bit for non-available statuses', () => {
    for (const status of ['sold', 'blocked', 'held'] as const) {
      const flags = statusToStateFlags(status);
      expect(flags & STATE_FLAG_UNAVAILABLE).toBe(STATE_FLAG_UNAVAILABLE);
    }
  });

  it('packs the compact status code into bits 8-15', () => {
    expect((statusToStateFlags('sold') >>> 8) & 0xff).toBe(1);
    expect((statusToStateFlags('blocked') >>> 8) & 0xff).toBe(2);
    expect((statusToStateFlags('held') >>> 8) & 0xff).toBe(3);
  });
});

describe('applyTransform', () => {
  it('applies rotation and translation', () => {
    const [x, y] = applyTransform({ x: 10, y: 5, rotation: Math.PI / 2 }, 2, 0);
    expect(x).toBeCloseTo(10, 6);
    expect(y).toBeCloseTo(7, 6);
  });
});

describe('flattenSeatMap', () => {
  it('produces exactly countSeats() entries matching document bounds', () => {
    const doc = generateSeatMap({ layout: 'arena', seatCount: 5_000, seed: 3 });
    const flat = flattenSeatMap(doc);
    expect(flat.count).toBe(countSeats(doc));
    expect(flat.x.length).toBe(flat.count);
    expect(flat.seatIds.length).toBe(flat.count);

    // Flattened world-center bounds must sit inside the (padded) document bounds.
    expect(flat.bounds.minX).toBeGreaterThanOrEqual(doc.bounds.minX);
    expect(flat.bounds.maxX).toBeLessThanOrEqual(doc.bounds.maxX);
    expect(flat.bounds.minY).toBeGreaterThanOrEqual(doc.bounds.minY);
    expect(flat.bounds.maxY).toBeLessThanOrEqual(doc.bounds.maxY);
  });

  it('maps categoryIndex to colorIndex and status to stateFlags', () => {
    const doc = generateSeatMap({ layout: 'grid', seatCount: 512, seed: 9 });
    const flat = flattenSeatMap(doc);
    const first = doc.sections[0].rows[0].seats[0];
    expect(flat.colorIndex[0]).toBe(first.categoryIndex);
    expect(flat.stateFlags[0]).toBe(statusToStateFlags(first.status));
    expect(flat.seatIds[0]).toBe(first.id);
  });
});
