/**
 * Seat map document model for seat-layout-v4.
 *
 * This module defines:
 *  - the TypeScript types for a seat map document (sections -> rows -> seats),
 *  - a hand-rolled runtime validator (no external schema dependency),
 *  - a flatten helper that projects section-local seat coordinates into
 *    world space, producing the typed-array seat contract that the T3 WASM
 *    core consumes to build its interleaved instance buffer.
 *
 * Coordinate model:
 *  - Each seat stores position in *section-local* coordinates (x, y).
 *  - Each section carries a `transform` (translation + rotation) that maps
 *    section-local coordinates into world space.
 *  - World rotation of a seat is `section.transform.rotation + seat.rotation`.
 *
 * The instance layout (24-byte stride: x, y, size, rotation, colorIndex,
 * stateFlags) is defined in `instance-layout.ts` / ADR-001 §3. This module's
 * flatten output maps directly onto that layout:
 *   colorIndex  <- seat.categoryIndex
 *   stateFlags  <- packed from seat.status (see STATUS_CODE / STATE_FLAG_*).
 */

/** Seat availability statuses. */
export const SEAT_STATUS_VALUES = ['available', 'sold', 'blocked', 'held'] as const;

export type SeatStatus = (typeof SEAT_STATUS_VALUES)[number];

/** stateFlags bit: seat is unavailable/sold/blocked/held for interaction (ADR-001 §3, bit 2). */
export const STATE_FLAG_UNAVAILABLE = 1 << 2;

/**
 * Compact status code stored in stateFlags bits 8-15 (ADR-001 §3).
 * 0 == normal/default (available).
 */
export const STATUS_CODE: Record<SeatStatus, number> = {
  available: 0,
  sold: 1,
  blocked: 2,
  held: 3,
};

/** Axis-aligned world-space bounding box. */
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Section transform: translation + rotation (radians, counter-clockwise). */
export interface Transform {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
}

/** A pricing/availability category. `color` is a CSS hex string used later as a palette entry. */
export interface SeatCategory {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

/** A single seat, positioned in section-local coordinates. */
export interface Seat {
  readonly id: string;
  readonly label: string;
  /** Section-local X (world units). */
  readonly x: number;
  /** Section-local Y (world units). */
  readonly y: number;
  /** Seat diameter in world units. */
  readonly size: number;
  /** Section-local rotation in radians (world = section.transform.rotation + this). */
  readonly rotation: number;
  /** Index into `SeatMapDocument.categories`. */
  readonly categoryIndex: number;
  readonly status: SeatStatus;
}

/** A row of seats within a section. */
export interface Row {
  readonly id: string;
  readonly label: string;
  readonly seats: readonly Seat[];
}

/** A section: a rigidly-transformed block of rows. */
export interface Section {
  readonly id: string;
  readonly name: string;
  readonly transform: Transform;
  readonly rows: readonly Row[];
}

/** The top-level seat map document. */
export interface SeatMapDocument {
  readonly id: string;
  readonly name: string;
  readonly bounds: Bounds;
  readonly categories: readonly SeatCategory[];
  readonly sections: readonly Section[];
}

/**
 * World-space seat arrays produced by {@link flattenSeatMap}. This is the input
 * contract the T3 WASM core consumes: parallel typed arrays plus seat ids.
 * Attribute names/order mirror the instance layout (ADR-001 §3).
 */
export interface FlattenedSeatMap {
  /** Number of seats. */
  readonly count: number;
  /** World-space bounds of seat centers. */
  readonly bounds: Bounds;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly size: Float32Array;
  readonly rotation: Float32Array;
  /** Palette index (== seat.categoryIndex). */
  readonly colorIndex: Uint32Array;
  /** Packed stateFlags (ADR-001 §3). */
  readonly stateFlags: Uint32Array;
  /** Parallel seat ids: `seatIds[i]` corresponds to index `i` in the arrays. */
  readonly seatIds: string[];
}

// ---------------------------------------------------------------------------
// Transform helpers
// ---------------------------------------------------------------------------

/** Apply a section transform to a section-local point, returning world [x, y]. */
export function applyTransform(t: Transform, localX: number, localY: number): [number, number] {
  const c = Math.cos(t.rotation);
  const s = Math.sin(t.rotation);
  return [t.x + localX * c - localY * s, t.y + localX * s + localY * c];
}

/** Pack a seat status into a stateFlags word (ADR-001 §3). */
export function statusToStateFlags(status: SeatStatus): number {
  let flags = (STATUS_CODE[status] & 0xff) << 8;
  if (status !== 'available') {
    flags |= STATE_FLAG_UNAVAILABLE;
  }
  return flags >>> 0;
}

/** Count total seats across all sections/rows. */
export function countSeats(doc: SeatMapDocument): number {
  let total = 0;
  for (const section of doc.sections) {
    for (const row of section.rows) {
      total += row.seats.length;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Flatten (section-local -> world space)
// ---------------------------------------------------------------------------

/**
 * Flatten a document into world-space seat arrays, applying section transforms.
 * Returns exact seat count, world-center bounds, and the parallel attribute
 * arrays that the WASM core turns into an interleaved instance buffer.
 */
export function flattenSeatMap(doc: SeatMapDocument): FlattenedSeatMap {
  const count = countSeats(doc);
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const size = new Float32Array(count);
  const rotation = new Float32Array(count);
  const colorIndex = new Uint32Array(count);
  const stateFlags = new Uint32Array(count);
  const seatIds: string[] = new Array<string>(count);

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  let i = 0;
  for (const section of doc.sections) {
    const t = section.transform;
    const c = Math.cos(t.rotation);
    const s = Math.sin(t.rotation);
    for (const row of section.rows) {
      for (const seat of row.seats) {
        const wx = t.x + seat.x * c - seat.y * s;
        const wy = t.y + seat.x * s + seat.y * c;
        x[i] = wx;
        y[i] = wy;
        size[i] = seat.size;
        rotation[i] = t.rotation + seat.rotation;
        colorIndex[i] = seat.categoryIndex >>> 0;
        stateFlags[i] = statusToStateFlags(seat.status);
        seatIds[i] = seat.id;
        if (wx < minX) minX = wx;
        if (wy < minY) minY = wy;
        if (wx > maxX) maxX = wx;
        if (wy > maxY) maxY = wy;
        i++;
      }
    }
  }

  if (count === 0) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  return {
    count,
    bounds: { minX, minY, maxX, maxY },
    x,
    y,
    size,
    rotation,
    colorIndex,
    stateFlags,
    seatIds,
  };
}

// ---------------------------------------------------------------------------
// Runtime validator (hand-rolled, no external schema dependency)
// ---------------------------------------------------------------------------

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

class Validator {
  readonly errors: string[] = [];

  private num(v: unknown, path: string): v is number {
    if (!isFiniteNumber(v)) {
      this.errors.push(`${path}: expected finite number`);
      return false;
    }
    return true;
  }

  private str(v: unknown, path: string): v is string {
    if (typeof v !== 'string' || v.length === 0) {
      this.errors.push(`${path}: expected non-empty string`);
      return false;
    }
    return true;
  }

  private bounds(v: unknown, path: string): void {
    if (!isRecord(v)) {
      this.errors.push(`${path}: expected object`);
      return;
    }
    const okMinX = this.num(v.minX, `${path}.minX`);
    const okMinY = this.num(v.minY, `${path}.minY`);
    const okMaxX = this.num(v.maxX, `${path}.maxX`);
    const okMaxY = this.num(v.maxY, `${path}.maxY`);
    if (okMinX && okMaxX && (v.minX as number) > (v.maxX as number)) {
      this.errors.push(`${path}: minX must be <= maxX`);
    }
    if (okMinY && okMaxY && (v.minY as number) > (v.maxY as number)) {
      this.errors.push(`${path}: minY must be <= maxY`);
    }
  }

  private transform(v: unknown, path: string): void {
    if (!isRecord(v)) {
      this.errors.push(`${path}: expected object`);
      return;
    }
    this.num(v.x, `${path}.x`);
    this.num(v.y, `${path}.y`);
    this.num(v.rotation, `${path}.rotation`);
  }

  private category(v: unknown, path: string): void {
    if (!isRecord(v)) {
      this.errors.push(`${path}: expected object`);
      return;
    }
    this.str(v.id, `${path}.id`);
    this.str(v.name, `${path}.name`);
    this.str(v.color, `${path}.color`);
  }

  private seat(v: unknown, path: string, categoryCount: number): void {
    if (!isRecord(v)) {
      this.errors.push(`${path}: expected object`);
      return;
    }
    this.str(v.id, `${path}.id`);
    this.str(v.label, `${path}.label`);
    this.num(v.x, `${path}.x`);
    this.num(v.y, `${path}.y`);
    if (this.num(v.size, `${path}.size`) && (v.size as number) <= 0) {
      this.errors.push(`${path}.size: must be > 0`);
    }
    this.num(v.rotation, `${path}.rotation`);
    if (this.num(v.categoryIndex, `${path}.categoryIndex`)) {
      const ci = v.categoryIndex as number;
      if (!Number.isInteger(ci) || ci < 0 || ci >= categoryCount) {
        this.errors.push(
          `${path}.categoryIndex: must be an integer in [0, ${categoryCount}) but was ${ci}`,
        );
      }
    }
    if (typeof v.status !== 'string' || !SEAT_STATUS_VALUES.includes(v.status as SeatStatus)) {
      this.errors.push(
        `${path}.status: expected one of ${SEAT_STATUS_VALUES.join('|')} but was ${String(v.status)}`,
      );
    }
  }

  private row(v: unknown, path: string, categoryCount: number): void {
    if (!isRecord(v)) {
      this.errors.push(`${path}: expected object`);
      return;
    }
    this.str(v.id, `${path}.id`);
    this.str(v.label, `${path}.label`);
    if (!Array.isArray(v.seats)) {
      this.errors.push(`${path}.seats: expected array`);
      return;
    }
    for (let i = 0; i < v.seats.length; i++) {
      this.seat(v.seats[i], `${path}.seats[${i}]`, categoryCount);
    }
  }

  private section(v: unknown, path: string, categoryCount: number): void {
    if (!isRecord(v)) {
      this.errors.push(`${path}: expected object`);
      return;
    }
    this.str(v.id, `${path}.id`);
    this.str(v.name, `${path}.name`);
    this.transform(v.transform, `${path}.transform`);
    if (!Array.isArray(v.rows)) {
      this.errors.push(`${path}.rows: expected array`);
      return;
    }
    for (let i = 0; i < v.rows.length; i++) {
      this.row(v.rows[i], `${path}.rows[${i}]`, categoryCount);
    }
  }

  document(v: unknown): void {
    if (!isRecord(v)) {
      this.errors.push('document: expected object');
      return;
    }
    this.str(v.id, 'document.id');
    this.str(v.name, 'document.name');
    this.bounds(v.bounds, 'document.bounds');

    let categoryCount = 0;
    if (!Array.isArray(v.categories)) {
      this.errors.push('document.categories: expected array');
    } else {
      if (v.categories.length === 0) {
        this.errors.push('document.categories: expected at least one category');
      }
      categoryCount = v.categories.length;
      for (let i = 0; i < v.categories.length; i++) {
        this.category(v.categories[i], `document.categories[${i}]`);
      }
    }

    if (!Array.isArray(v.sections)) {
      this.errors.push('document.sections: expected array');
    } else {
      for (let i = 0; i < v.sections.length; i++) {
        this.section(v.sections[i], `document.sections[${i}]`, categoryCount);
      }
    }
  }
}

/** Validate an arbitrary value as a {@link SeatMapDocument}. Never throws. */
export function validateSeatMapDocument(value: unknown): ValidationResult {
  const v = new Validator();
  v.document(value);
  return { valid: v.errors.length === 0, errors: v.errors };
}

/** Assert that a value is a valid {@link SeatMapDocument}, throwing on failure. */
export function assertSeatMapDocument(value: unknown): asserts value is SeatMapDocument {
  const result = validateSeatMapDocument(value);
  if (!result.valid) {
    throw new Error(`Invalid SeatMapDocument:\n${result.errors.join('\n')}`);
  }
}
