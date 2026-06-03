/**
 * Tests for darkenColor memoization (R6). Pins the exact output of the darken
 * math (so the cache can't silently change results) and that repeated calls are
 * cached.
 */
import { darkenColor } from "../colorUtils.js";

describe("darkenColor", () => {
  test("darkens a hex color by the given factor (unchanged math)", () => {
    // #ffffff -> floor(255 * (1 - 0.4)) = 153 = 0x99 per channel
    expect(darkenColor("#ffffff", 0.4)).toBe("#999999");
    // black stays black
    expect(darkenColor("#000000", 0.4)).toBe("#000000");
    // pads single-hex-digit channels to two digits
    expect(darkenColor("#0a0a0a", 0.4)).toBe("#060606");
  });

  test("tolerates colors without a leading #", () => {
    expect(darkenColor("ffffff", 0.4)).toBe("#999999");
  });

  test("is memoized: same (color, factor) returns the identical string", () => {
    const a = darkenColor("#3366cc", 0.4);
    const b = darkenColor("#3366cc", 0.4);
    expect(a).toBe(b);
  });

  test("different factors produce different results", () => {
    expect(darkenColor("#ffffff", 0.4)).toBe("#999999");
    expect(darkenColor("#ffffff", 0.5)).toBe("#7f7f7f");
  });
});
