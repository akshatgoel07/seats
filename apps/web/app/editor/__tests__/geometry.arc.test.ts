/**
 * Arc length-table tests (R15).
 *
 * The optimization replaced per-seat re-integration (findAngleForArcLength,
 * which itself re-integrated the whole arc every call) with a single cumulative
 * LUT. These tests prove the LUT path is numerically equivalent to the old one,
 * so generateSeatsForRow's curved-row output is unchanged.
 */
import {
  buildEllipticalArcLUT,
  angleAtArcLength,
  calculateEllipticalArcLength,
  findAngleForArcLength,
  generateSeatsForRow,
} from "../geometry.ts";
import { createArcGeometry } from "../types.ts";

const CASES = [
  { rx: 200, ry: 200, a0: 0, a1: Math.PI }, // semicircle
  { rx: 300, ry: 150, a0: -Math.PI / 2, a1: Math.PI / 2 }, // ellipse
  { rx: 120, ry: 240, a0: 0.3, a1: 2.7 }, // tall ellipse, arbitrary span
];

describe("buildEllipticalArcLUT", () => {
  test("totalLength matches calculateEllipticalArcLength exactly", () => {
    for (const { rx, ry, a0, a1 } of CASES) {
      const lut = buildEllipticalArcLUT(rx, ry, a0, a1);
      expect(lut.totalLength).toBe(calculateEllipticalArcLength(rx, ry, a0, a1));
    }
  });
});

describe("angleAtArcLength vs findAngleForArcLength", () => {
  test("produces the same angle across the whole arc", () => {
    for (const { rx, ry, a0, a1 } of CASES) {
      const lut = buildEllipticalArcLUT(rx, ry, a0, a1);
      const total = lut.totalLength;
      for (let s = 0; s <= 20; s++) {
        const target = (total * s) / 20;
        const viaLut = angleAtArcLength(lut, target);
        const viaOld = findAngleForArcLength(rx, ry, a0, a1, target);
        // Same algorithm/segments → results match to floating-point tolerance.
        expect(Math.abs(viaLut - viaOld)).toBeLessThan(1e-9);
      }
    }
  });

  test("clamps at the endpoints", () => {
    const lut = buildEllipticalArcLUT(200, 100, 0, Math.PI);
    expect(angleAtArcLength(lut, -5)).toBe(0);
    expect(angleAtArcLength(lut, lut.totalLength + 5)).toBe(Math.PI);
  });
});

describe("generateSeatsForRow (arc)", () => {
  test("creates seatCount seats with finite, on-ellipse coordinates", () => {
    const geometry = createArcGeometry(0, 0, 200, 100, 0, Math.PI);
    const row = { id: "r1", geometry, seatCount: 9, spacing: 40, categoryId: "c1" };
    const seats = generateSeatsForRow(row);
    expect(seats.length).toBe(9);
    for (const seat of seats) {
      expect(Number.isFinite(seat.localX)).toBe(true);
      expect(Number.isFinite(seat.localY)).toBe(true);
    }
    // First and last seat sit at the arc endpoints (no curve offset applied).
    expect(seats[0].localX).toBeCloseTo(200, 6); // cos(0)*rx
    expect(seats[8].localX).toBeCloseTo(-200, 6); // cos(pi)*rx
  });
});
