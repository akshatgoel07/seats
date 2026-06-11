/**
 * Uniform-grid spatial index for seat hit-testing (R18 / 10k-seat support).
 *
 * The canvas renderer has no per-seat DOM nodes, so hover/click must hit-test in
 * code. A linear scan over every seat on each mousemove would be O(n); this
 * buckets seats into a uniform grid keyed by cell so a point query only checks
 * the seats in the surrounding cells — effectively O(1) for typical densities.
 *
 * Pure module (positions are world coordinates from seatMap[seat].position).
 */

import type { SeatSpatialIndex } from "../types.ts";

const DEFAULT_CELL_SIZE = 60;

type IndexedSeatMap = Record<
  string,
  {
    position?: { x: number; y: number };
    dimensions?: { width?: number; height?: number };
  }
>;

/**
 * @param {Record<string, any>} seatMap
 * @param {number} [cellSize]
 * @returns {{ cellSize: number, cells: Map<string, string[]> }}
 */
export function buildSeatSpatialIndex(
  seatMap: IndexedSeatMap,
  cellSize = DEFAULT_CELL_SIZE,
): SeatSpatialIndex {
  const cells = new Map<string, string[]>();
  for (const [seatId, seat] of Object.entries(seatMap || {})) {
    const pos = seat && seat.position;
    if (!pos) continue;
    const cx = Math.floor(pos.x / cellSize);
    const cy = Math.floor(pos.y / cellSize);
    const key = cx + ":" + cy;
    let bucket = cells.get(key);
    if (!bucket) {
      bucket = [];
      cells.set(key, bucket);
    }
    bucket.push(seatId);
  }
  return { cellSize, cells };
}

/**
 * Find the seat whose box contains (worldX, worldY). Checks the 3x3 block of
 * cells around the point (a seat may overlap a neighbouring cell). Returns the
 * seatId or null.
 * @param {{ cellSize: number, cells: Map<string, string[]> }} index
 * @param {Record<string, any>} seatMap
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} [sizeFactor] - matches the renderer's seat shrink factor
 * @returns {string | null}
 */
export function querySeatAtPoint(
  index: SeatSpatialIndex | null | undefined,
  seatMap: IndexedSeatMap,
  worldX: number,
  worldY: number,
  sizeFactor = 0.88,
): string | null {
  if (!index) return null;
  const { cellSize, cells } = index;
  const baseCx = Math.floor(worldX / cellSize);
  const baseCy = Math.floor(worldY / cellSize);
  let best: string | null = null;
  let bestDist = Infinity;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const bucket = cells.get(baseCx + dx + ":" + (baseCy + dy));
      if (!bucket) continue;
      for (const seatId of bucket) {
        const seat = seatMap[seatId];
        const pos = seat && seat.position;
        if (!pos) continue;
        const halfW = ((seat.dimensions && seat.dimensions.width) || 20) * sizeFactor / 2;
        const halfH = ((seat.dimensions && seat.dimensions.height) || 20) * sizeFactor / 2;
        if (
          worldX >= pos.x - halfW &&
          worldX <= pos.x + halfW &&
          worldY >= pos.y - halfH &&
          worldY <= pos.y + halfH
        ) {
          // If multiple overlap, pick the closest center.
          const d = (worldX - pos.x) ** 2 + (worldY - pos.y) ** 2;
          if (d < bestDist) {
            bestDist = d;
            best = seatId;
          }
        }
      }
    }
  }
  return best;
}
