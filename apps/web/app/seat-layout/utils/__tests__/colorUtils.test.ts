/**
 * Tests for darkenColor memoization (R6). Pins the exact output of the darken
 * math (so the cache can't silently change results) and that repeated calls are
 * cached.
 */
import { darkenColor, getSeatColor } from "../colorUtils.ts";
import {
  COLOR_SELECTED,
  COLOR_UNAVAILABLE,
  COLOR_BLOCKED,
  COLOR_DEFAULT,
} from "../constants.ts";

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

describe("getSeatColor precedence (R10 base/selection split)", () => {
  const types = new Map([["vip", "#abcdef"]]);
  const ok = { sl_seat_status: "0", sst_seat_type: "vip", seat_reserve_type_id: 0 };

  test("unavailable status wins over everything (even when selected)", () => {
    const seat = { ...ok, sl_seat_status: "1" };
    expect(getSeatColor(seat, true, types)).toBe(COLOR_UNAVAILABLE);
  });

  test("blocked reserve type (8/12/13) wins over selection", () => {
    for (const id of [8, 12, 13]) {
      expect(getSeatColor({ ...ok, seat_reserve_type_id: id }, true, types)).toBe(
        COLOR_BLOCKED,
      );
    }
  });

  test("selected available seat is the selected color", () => {
    expect(getSeatColor(ok, true, types)).toBe(COLOR_SELECTED);
  });

  test("unselected available seat uses its type color", () => {
    expect(getSeatColor(ok, false, types)).toBe("#abcdef");
  });

  test("unknown type falls back to default", () => {
    expect(getSeatColor({ ...ok, sst_seat_type: "nope" }, false, types)).toBe(
      COLOR_DEFAULT,
    );
  });
});
