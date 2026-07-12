/**
 * Deterministic, seeded seat map fixture generator for seat-layout-v4.
 *
 * Given the same `{ layout, seatCount, seed }`, {@link generateSeatMap} always
 * returns a byte-for-byte identical {@link SeatMapDocument}. It supports three
 * realistic layouts:
 *
 *  - `grid`    : theater-style rectangular blocks (sections) of rows/seats.
 *  - `arena`   : a single ring of wedge sections with concentric-arc rows.
 *  - `stadium` : multiple curved tiers, each a ring of wedge sections.
 *
 * Every layout produces *exactly* `seatCount` seats spread over many
 * sections/rows (never one giant row) and scales to 250k seats. Seat statuses
 * and categories are drawn from a seeded PRNG so the whole document is a pure
 * function of its inputs.
 */

import type {
  Bounds,
  Row,
  Seat,
  SeatCategory,
  SeatMapDocument,
  SeatStatus,
  Section,
  Transform,
} from '../shared/seat-map';

export type LayoutKind = 'grid' | 'arena' | 'stadium';

export interface GenerateOptions {
  readonly layout: LayoutKind;
  readonly seatCount: number;
  readonly seed: number;
}

/** Fixed palette; each entry becomes a {@link SeatCategory} carrying a color. */
const CATEGORY_PALETTE: ReadonlyArray<{ name: string; color: string }> = [
  { name: 'Premium', color: '#dc2626' },
  { name: 'Gold', color: '#eab308' },
  { name: 'Silver', color: '#0891b2' },
  { name: 'Bronze', color: '#16a34a' },
  { name: 'Standard', color: '#2563eb' },
  { name: 'Economy', color: '#9333ea' },
];

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — small, fast, deterministic.
// ---------------------------------------------------------------------------

/** Returns a deterministic PRNG producing floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministic status distribution: ~70% available, ~20% sold, ~5% held,
 * ~5% blocked.
 */
function drawStatus(rng: () => number): SeatStatus {
  const r = rng();
  if (r < 0.7) return 'available';
  if (r < 0.9) return 'sold';
  if (r < 0.95) return 'held';
  return 'blocked';
}

// ---------------------------------------------------------------------------
// Small internal builder for accumulating sections and tracking world bounds.
// ---------------------------------------------------------------------------

interface SectionBuilder {
  readonly id: string;
  readonly name: string;
  readonly transform: Transform;
  readonly cos: number;
  readonly sin: number;
  readonly rows: Row[];
}

class DocBuilder {
  private minX = Number.POSITIVE_INFINITY;
  private minY = Number.POSITIVE_INFINITY;
  private maxX = Number.NEGATIVE_INFINITY;
  private maxY = Number.NEGATIVE_INFINITY;
  private maxSize = 0;

  section(id: string, name: string, transform: Transform): SectionBuilder {
    return {
      id,
      name,
      transform,
      cos: Math.cos(transform.rotation),
      sin: Math.sin(transform.rotation),
      rows: [],
    };
  }

  /** Add a seat to a section, updating world bounds. */
  addSeat(sb: SectionBuilder, seat: Seat, row: Seat[]): void {
    row.push(seat);
    const wx = sb.transform.x + seat.x * sb.cos - seat.y * sb.sin;
    const wy = sb.transform.y + seat.x * sb.sin + seat.y * sb.cos;
    if (wx < this.minX) this.minX = wx;
    if (wy < this.minY) this.minY = wy;
    if (wx > this.maxX) this.maxX = wx;
    if (wy > this.maxY) this.maxY = wy;
    if (seat.size > this.maxSize) this.maxSize = seat.size;
  }

  /** World-space bounds padded by one max seat diameter so seat extents fit. */
  bounds(): Bounds {
    if (!Number.isFinite(this.minX)) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
    const pad = this.maxSize;
    return {
      minX: this.minX - pad,
      minY: this.minY - pad,
      maxX: this.maxX + pad,
      maxY: this.maxY + pad,
    };
  }
}

function makeCategories(): SeatCategory[] {
  return CATEGORY_PALETTE.map((c, i) => ({
    id: `cat-${i}`,
    name: c.name,
    color: c.color,
  }));
}

function seat(
  id: string,
  label: string,
  x: number,
  y: number,
  size: number,
  rotation: number,
  categoryIndex: number,
  rng: () => number,
): Seat {
  return {
    id,
    label,
    x,
    y,
    size,
    rotation,
    categoryIndex,
    status: drawStatus(rng),
  };
}

// ---------------------------------------------------------------------------
// Layout: grid (theater blocks)
// ---------------------------------------------------------------------------

function buildGrid(
  seatCount: number,
  rng: () => number,
  categoryCount: number,
  builder: DocBuilder,
): Section[] {
  const SEAT_PITCH = 1.0;
  const SEAT_SIZE = 0.7;
  const SEATS_PER_ROW = 26;
  const ROWS_PER_SECTION = 20;
  const GAP = 4;

  const perSection = SEATS_PER_ROW * ROWS_PER_SECTION;
  const sectionsNeeded = Math.max(1, Math.ceil(seatCount / perSection));
  const cols = Math.max(1, Math.ceil(Math.sqrt(sectionsNeeded)));
  const pitchX = SEATS_PER_ROW * SEAT_PITCH + GAP;
  const pitchY = ROWS_PER_SECTION * SEAT_PITCH + GAP;

  const sections: Section[] = [];
  let remaining = seatCount;
  let si = 0;

  while (remaining > 0) {
    const bc = si % cols;
    const br = Math.floor(si / cols);
    const sb = builder.section(`sec-${si}`, `Section ${si + 1}`, {
      x: bc * pitchX,
      y: br * pitchY,
      rotation: 0,
    });
    const categoryIndex = Math.floor(rng() * categoryCount);

    for (let r = 0; r < ROWS_PER_SECTION && remaining > 0; r++) {
      const rowSeats: Seat[] = [];
      const inRow = Math.min(SEATS_PER_ROW, remaining);
      for (let c = 0; c < inRow; c++) {
        builder.addSeat(
          sb,
          seat(
            `sec-${si}-row-${r}-seat-${c}`,
            `${c + 1}`,
            c * SEAT_PITCH,
            r * SEAT_PITCH,
            SEAT_SIZE,
            0,
            categoryIndex,
            rng,
          ),
          rowSeats,
        );
        remaining--;
      }
      sb.rows.push({ id: `sec-${si}-row-${r}`, label: `${r + 1}`, seats: rowSeats });
    }

    sections.push({ id: sb.id, name: sb.name, transform: sb.transform, rows: sb.rows });
    si++;
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Shared wedge helper for curved layouts (arena, stadium).
// ---------------------------------------------------------------------------

const SEAT_SIZE_CURVED = 0.7;
const SEAT_ARC = 1.1; // approx arc-length spacing between adjacent seats
const GAP_ANGLE = 0.05; // radial aisle between wedge sections (radians)

/**
 * Fill one arc row within a wedge section. Seats are placed in section-local
 * coordinates where the wedge is centered on the local +X axis; the section
 * transform rotation orients the wedge in the world.
 *
 * Returns the number of seats actually placed (bounded by `remaining`).
 */
function fillArcRow(
  sb: SectionBuilder,
  rowSeats: Seat[],
  rowIndex: number,
  radius: number,
  halfAngle: number,
  categoryIndex: number,
  rng: () => number,
  remaining: number,
  builder: DocBuilder,
): number {
  const step = SEAT_ARC / radius; // angular spacing for the target arc-length
  const capacity = Math.max(1, Math.floor((2 * halfAngle) / step) + 1);
  const nSeats = Math.min(capacity, remaining);
  for (let k = 0; k < nSeats; k++) {
    const a = -halfAngle + k * step;
    const lx = radius * Math.cos(a);
    const ly = radius * Math.sin(a);
    // Local rotation so the seat faces the center (outward normal is at angle a).
    const localRot = a + Math.PI;
    builder.addSeat(
      sb,
      seat(
        `${sb.id}-row-${rowIndex}-seat-${k}`,
        `${k + 1}`,
        lx,
        ly,
        SEAT_SIZE_CURVED,
        localRot,
        categoryIndex,
        rng,
      ),
      rowSeats,
    );
  }
  return nSeats;
}

// ---------------------------------------------------------------------------
// Layout: arena (single ring of wedge sections, concentric-arc rows)
// ---------------------------------------------------------------------------

function buildArena(
  seatCount: number,
  rng: () => number,
  categoryCount: number,
  builder: DocBuilder,
): Section[] {
  const NUM_SECTIONS = 16;
  const R_INNER = 24;
  const ROW_PITCH = 1.2;
  const ROWS_PER_CATEGORY = 14;

  const wedgeHalf = Math.PI / NUM_SECTIONS - GAP_ANGLE / 2;

  const sbs: SectionBuilder[] = [];
  const catPerSection = new Array<number>(NUM_SECTIONS);
  for (let s = 0; s < NUM_SECTIONS; s++) {
    const centerAngle = (2 * Math.PI * s) / NUM_SECTIONS;
    sbs.push(
      builder.section(`sec-${s}`, `Section ${s + 1}`, {
        x: 0,
        y: 0,
        rotation: centerAngle,
      }),
    );
    catPerSection[s] = Math.floor(rng() * categoryCount);
  }

  let remaining = seatCount;
  let rowIndex = 0;
  while (remaining > 0) {
    const radius = R_INNER + rowIndex * ROW_PITCH;
    // Concentric price bands: inner rows are premium.
    const bandCategory = Math.min(categoryCount - 1, Math.floor(rowIndex / ROWS_PER_CATEGORY));
    for (let s = 0; s < NUM_SECTIONS && remaining > 0; s++) {
      const sb = sbs[s];
      const rowSeats: Seat[] = [];
      // Blend structural band category with the section's own category pick.
      const categoryIndex = (bandCategory + catPerSection[s]) % categoryCount;
      const placed = fillArcRow(
        sb,
        rowSeats,
        rowIndex,
        radius,
        wedgeHalf,
        categoryIndex,
        rng,
        remaining,
        builder,
      );
      remaining -= placed;
      if (rowSeats.length > 0) {
        sb.rows.push({ id: `${sb.id}-row-${rowIndex}`, label: `${rowIndex + 1}`, seats: rowSeats });
      }
    }
    rowIndex++;
  }

  return sbs
    .filter((sb) => sb.rows.length > 0)
    .map((sb) => ({ id: sb.id, name: sb.name, transform: sb.transform, rows: sb.rows }));
}

// ---------------------------------------------------------------------------
// Layout: stadium (multiple curved tiers, each a ring of wedge sections)
// ---------------------------------------------------------------------------

function buildStadium(
  seatCount: number,
  rng: () => number,
  categoryCount: number,
  builder: DocBuilder,
): Section[] {
  const R_INNER_BASE = 28;
  const ROW_PITCH = 1.2;
  const ROWS_PER_TIER = 26;
  const TIER_AISLE = 7;

  const sections: Section[] = [];
  let remaining = seatCount;
  let tier = 0;
  let tierRadius = R_INNER_BASE;

  while (remaining > 0) {
    // Outer tiers wrap more sections around the (larger) circumference.
    const numSections = Math.min(40, 18 + 3 * tier);
    const wedgeHalf = Math.PI / numSections - GAP_ANGLE / 2;
    const categoryIndex = tier % categoryCount;

    const sbs: SectionBuilder[] = [];
    for (let s = 0; s < numSections; s++) {
      const centerAngle = (2 * Math.PI * s) / numSections;
      sbs.push(
        builder.section(`sec-t${tier}-s${s}`, `Tier ${tier + 1} Section ${s + 1}`, {
          x: 0,
          y: 0,
          rotation: centerAngle,
        }),
      );
    }

    for (let r = 0; r < ROWS_PER_TIER && remaining > 0; r++) {
      const radius = tierRadius + r * ROW_PITCH;
      for (let s = 0; s < numSections && remaining > 0; s++) {
        const sb = sbs[s];
        const rowSeats: Seat[] = [];
        const placed = fillArcRow(
          sb,
          rowSeats,
          r,
          radius,
          wedgeHalf,
          categoryIndex,
          rng,
          remaining,
          builder,
        );
        remaining -= placed;
        if (rowSeats.length > 0) {
          sb.rows.push({ id: `${sb.id}-row-${r}`, label: `${r + 1}`, seats: rowSeats });
        }
      }
    }

    for (const sb of sbs) {
      if (sb.rows.length > 0) {
        sections.push({ id: sb.id, name: sb.name, transform: sb.transform, rows: sb.rows });
      }
    }

    tierRadius += ROWS_PER_TIER * ROW_PITCH + TIER_AISLE;
    tier++;
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic seat map document. Identical inputs always yield an
 * identical document.
 */
export function generateSeatMap(options: GenerateOptions): SeatMapDocument {
  const { layout, seatCount, seed } = options;
  if (!Number.isInteger(seatCount) || seatCount < 0) {
    throw new Error(`seatCount must be a non-negative integer, got ${seatCount}`);
  }

  const rng = mulberry32(seed);
  const categories = makeCategories();
  const builder = new DocBuilder();

  let sections: Section[];
  switch (layout) {
    case 'grid':
      sections = buildGrid(seatCount, rng, categories.length, builder);
      break;
    case 'arena':
      sections = buildArena(seatCount, rng, categories.length, builder);
      break;
    case 'stadium':
      sections = buildStadium(seatCount, rng, categories.length, builder);
      break;
    default: {
      const exhaustive: never = layout;
      throw new Error(`Unknown layout: ${String(exhaustive)}`);
    }
  }

  return {
    id: `seatmap-${layout}-${seatCount}-${seed}`,
    name: `${layout} ${seatCount} seats (seed ${seed})`,
    bounds: builder.bounds(),
    categories,
    sections,
  };
}
