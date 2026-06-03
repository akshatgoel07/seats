/**
 * Tests for the R6 seat-indexing helpers. These guard the optimization that
 * replaced per-seat O(seats^2) centroid recomputation with an O(n) index +
 * O(1) memoized centroid lookups, asserting the centroid math is unchanged.
 */
import { buildSeatsByRow, makeRowCentroidGetter } from "../seatIndex.js";

const seats = {
  a1: { id: "a1", rowId: "r1", localX: 0, localY: 0 },
  a2: { id: "a2", rowId: "r1", localX: 10, localY: 0 },
  a3: { id: "a3", rowId: "r1", localX: 20, localY: 0 },
  b1: { id: "b1", rowId: "r2", localX: 0, localY: 100 },
  b2: { id: "b2", rowId: "r2", localX: 40, localY: 100 },
  loose: { id: "loose", localX: 5, localY: 5 }, // standalone, no rowId
};

describe("buildSeatsByRow", () => {
  test("groups seats by rowId and skips standalone seats", () => {
    const byRow = buildSeatsByRow(seats);
    expect(byRow.get("r1").length).toBe(3);
    expect(byRow.get("r2").length).toBe(2);
    expect(byRow.has(undefined)).toBe(false);
    // The standalone seat must not appear under any row.
    const all = [...byRow.values()].flat().map((s) => s.id);
    expect(all.includes("loose")).toBe(false);
  });

  test("accepts an array as well as a map", () => {
    const byRow = buildSeatsByRow(Object.values(seats));
    expect(byRow.get("r1").length).toBe(3);
  });
});

describe("makeRowCentroidGetter", () => {
  test("computes the correct centroid (matches the old reduce-based math)", () => {
    const getCentroid = makeRowCentroidGetter(buildSeatsByRow(seats));
    const r1 = getCentroid("r1");
    expect(r1.cx).toBe(10); // (0+10+20)/3
    expect(r1.cy).toBe(0);
    expect(r1.count).toBe(3);

    const r2 = getCentroid("r2");
    expect(r2.cx).toBe(20); // (0+40)/2
    expect(r2.cy).toBe(100);
    expect(r2.count).toBe(2);
  });

  test("returns count 0 for an unknown row (callers guard on count)", () => {
    const getCentroid = makeRowCentroidGetter(buildSeatsByRow(seats));
    expect(getCentroid("nope").count).toBe(0);
  });

  test("memoizes: repeated lookups return the same cached object", () => {
    const getCentroid = makeRowCentroidGetter(buildSeatsByRow(seats));
    expect(getCentroid("r1")).toBe(getCentroid("r1"));
  });
});
