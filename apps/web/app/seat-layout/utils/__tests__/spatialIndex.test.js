/**
 * Tests for the seat spatial index used by the canvas renderer's hit-testing.
 */
import { buildSeatSpatialIndex, querySeatAtPoint } from "../spatialIndex.js";

const mk = (id, x, y, w = 20, h = 20) => ({
  position: { x, y, rotation: 0 },
  dimensions: { width: w, height: h },
});

const seatMap = {
  a: mk("a", 0, 0),
  b: mk("b", 100, 0),
  c: mk("c", 0, 100),
  d: mk("d", 500, 500),
};

describe("spatial index hit-testing", () => {
  const index = buildSeatSpatialIndex(seatMap, 60);

  test("finds the seat whose box contains the point", () => {
    // seat 'a' at (0,0), size 20 * 0.88 => half ~8.8; (3,3) is inside
    expect(querySeatAtPoint(index, seatMap, 3, 3)).toBe("a");
    expect(querySeatAtPoint(index, seatMap, 100, 0)).toBe("b");
    expect(querySeatAtPoint(index, seatMap, 500, 500)).toBe("d");
  });

  test("returns null when the point is between seats (the gaps)", () => {
    expect(querySeatAtPoint(index, seatMap, 50, 50)).toBe(null);
    expect(querySeatAtPoint(index, seatMap, 9999, 9999)).toBe(null);
  });

  test("respects the size factor (just outside the shrunk box misses)", () => {
    // half-extent with factor 0.88 is ~8.8; x=9.5 is outside
    expect(querySeatAtPoint(index, seatMap, 9.5, 0)).toBe(null);
    expect(querySeatAtPoint(index, seatMap, 9.5, 0, 1.0)).toBe("a"); // full size hits
  });

  test("buildSeatSpatialIndex skips seats without a position", () => {
    const idx = buildSeatSpatialIndex({ x: { dimensions: { width: 20, height: 20 } } }, 60);
    expect(idx.cells.size).toBe(0);
  });
});
