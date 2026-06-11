/**
 * Per-pass seat indexing helpers (R6).
 *
 * Rotated rows pivot around the centroid of their seats. Computing that centroid
 * by filtering ALL seats once per seat — `Object.values(seats).filter(...)`
 * inside the per-seat loop — is O(seats^2) and ran every render frame / every
 * hit-test. These helpers build a `rowId -> seats` index once (O(n)) and memoize
 * each row's centroid, making the per-seat pivot lookup O(1).
 *
 * Pure module (no React/DOM) so it is directly unit-testable.
 */

/**
 * Group seats by their rowId. Seats without a rowId (standalone, e.g. table
 * seats) are skipped — they don't participate in row rotation.
 * @param {Record<string, any> | any[]} seats - the scene's seats map (or array)
 * @returns {Map<string, any[]>}
 */
type IndexedSeat = {
  id?: string;
  rowId?: string | null;
  localX: number;
  localY: number;
};

type RowCentroid = { cx: number; cy: number; count: number };

export function buildSeatsByRow(
  seats: Record<string, IndexedSeat> | IndexedSeat[],
): Map<string, IndexedSeat[]> {
  const seatsByRow = new Map<string, IndexedSeat[]>();
  const list = Array.isArray(seats) ? seats : Object.values(seats);
  for (const s of list) {
    if (!s || !s.rowId) continue;
    let arr = seatsByRow.get(s.rowId);
    if (!arr) {
      arr = [];
      seatsByRow.set(s.rowId, arr);
    }
    arr.push(s);
  }
  return seatsByRow;
}

/**
 * Build a memoized centroid getter over a seats-by-row index. The returned
 * function computes each row's `{ cx, cy, count }` at most once.
 * @param {Map<string, any[]>} seatsByRow
 * @returns {(rowId: string) => { cx: number, cy: number, count: number }}
 */
export function makeRowCentroidGetter(seatsByRow: Map<string, IndexedSeat[]>) {
  const cache = new Map<string, RowCentroid>();
  return function getRowCentroid(rowId: string): RowCentroid {
    const cached = cache.get(rowId);
    if (cached) return cached;
    const arr = seatsByRow.get(rowId) || [];
    let sumX = 0;
    let sumY = 0;
    for (const s of arr) {
      sumX += s.localX;
      sumY += s.localY;
    }
    const n = arr.length || 1;
    const centroid = { cx: sumX / n, cy: sumY / n, count: arr.length };
    cache.set(rowId, centroid);
    return centroid;
  };
}
