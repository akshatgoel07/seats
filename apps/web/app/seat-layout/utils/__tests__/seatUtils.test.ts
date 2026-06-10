/**
 * Tests for buildRowAggregates (R17 LOD). Verifies per-row bounding boxes and
 * availability counts used to draw the zoomed-out overview.
 */
import { buildRowAggregates } from "../seatUtils.ts";

const seat = (id, rowId, x, y, status = "0") => ({
  sl_id: id,
  rowId,
  sl_seat_status: status,
  position: { x, y, rotation: 0 },
  dimensions: { width: 20, height: 20 },
});

describe("buildRowAggregates", () => {
  test("one box per row with correct bounds and counts", () => {
    const map = {
      a1: seat("a1", "r1", 0, 0, "0"),
      a2: seat("a2", "r1", 100, 0, "1"), // sold
      b1: seat("b1", "r2", 0, 200, "0"),
    };
    const agg = buildRowAggregates(map).sort((p, q) => p.id.localeCompare(q.id));
    expect(agg.length).toBe(2);

    const r1 = agg[0];
    expect(r1.id).toBe("r1");
    // bounds expand by half the seat size (10) on each edge
    expect(r1.x).toBe(-10);
    expect(r1.width).toBe(120); // 0-10 .. 100+10
    expect(r1.total).toBe(2);
    expect(r1.available).toBe(1); // a2 is sold

    const r2 = agg[1];
    expect(r2.total).toBe(1);
    expect(r2.available).toBe(1);
  });

  test("seats without a rowId become their own solo group", () => {
    const map = { s1: { ...seat("s1", null, 5, 5), rowId: undefined } };
    const agg = buildRowAggregates(map);
    expect(agg.length).toBe(1);
    expect(agg[0].total).toBe(1);
  });

  test("empty / missing input yields no aggregates", () => {
    expect(buildRowAggregates({})).toEqual([]);
    expect(buildRowAggregates(null)).toEqual([]);
  });
});
