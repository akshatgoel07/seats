// Geometry calculations and seat generation for the seat layout editor

import {
  createSeat,
  getRowLength,
  getPointOnRow,
  GEOMETRY_TYPES,
  createGlobalSettings,
} from "./types.js";
import { generateSeatLabel } from "./seatNaming.js";

/**
 * Generate seats along a row based on its geometry with optional curve effect
 * When curve = 0, seats are placed along the original straight/arc geometry (no curve)
 * When curve ≠ 0, seats are offset perpendicular to the row for stadium-like seating effect
 * Positive values create upward curve, negative values create downward curve
 * @param {Object} row - The row object
 * @param {Object|null} globalSettings - Global settings for seat dimensions
 * @param {Array} existingSeats - Existing seats to preserve properties from
 * @param {number|null} rowIndex - Zero-based row index for generating labels (e.g., 0=A, 1=B, 26=AA)
 */
export function generateSeatsForRow(
  row,
  globalSettings = null,
  existingSeats = [],
  rowIndex = null,
) {
  const seats = [];
  const {
    geometry,
    seatCount,
    spacing,
    categoryId,
    curve = 0,
    seatWidth,
    seatHeight,
  } = row;

  if (seatCount <= 0) return seats;

  // Use global settings if provided, otherwise use defaults
  // If row has seatWidth/seatHeight properties, use those; otherwise use global settings
  const settings = globalSettings || createGlobalSettings();
  const finalSeatWidth = seatWidth || settings.seatWidth;
  const finalSeatHeight = seatHeight || settings.seatHeight;

  // If we have existing seats, preserve their dimensions and other properties
  // This ensures seat sizes are maintained when curve adjustments happen
  const preserveExistingDimensions = existingSeats.length > 0;

  const rowLength = getRowLength(geometry);

  // For curved rows, integrate the arc length ONCE into a lookup table instead
  // of re-integrating per seat (R15). seatSpacing/angles below read from it.
  let arcLUT = null;
  let arcSeatSpacing = 0;
  if (geometry.kind === GEOMETRY_TYPES.ARC && seatCount > 1) {
    arcLUT = buildEllipticalArcLUT(
      geometry.radiusX,
      geometry.radiusY,
      geometry.startAngle,
      geometry.endAngle,
    );
    arcSeatSpacing = arcLUT.totalLength / (seatCount - 1);
  }

  // Calculate seat positions
  for (let i = 0; i < seatCount; i++) {
    let t, localX, localY;

    if (geometry.kind === GEOMETRY_TYPES.LINE) {
      // For straight rows, distribute seats evenly along the line
      if (seatCount === 1) {
        t = 0.5;
      } else {
        t = i / (seatCount - 1);
      }

      const point = getPointOnRow(geometry, t);
      localX = point.x;
      localY = point.y;
    } else if (geometry.kind === GEOMETRY_TYPES.ARC) {
      // For curved rows, distribute seats equidistantly along the arc
      const { center, radiusX, radiusY, startAngle, endAngle } = geometry;

      if (seatCount === 1) {
        // Single seat at middle of arc
        const midAngle = (startAngle + endAngle) / 2;
        localX = center.x + radiusX * Math.cos(midAngle);
        localY = center.y + radiusY * Math.sin(midAngle);
      } else {
        // Distribute seats equidistantly along the arc using the prebuilt LUT.
        const angle = angleAtArcLength(arcLUT, i * arcSeatSpacing);

        localX = center.x + radiusX * Math.cos(angle);
        localY = center.y + radiusY * Math.sin(angle);
      }
    }

    // Apply curve effect for stadium-like seating
    // When curve = 0, seats are placed along the original straight/arc geometry
    // When curve ≠ 0, seats are offset perpendicular to the row for stadium-like effect
    // Positive values create upward curve, negative values create downward curve
    if (Math.abs(curve) > 0.001) {
      // Calculate position relative to center (0 = center, -1/1 = ends)
      let centerOffset;
      if (geometry.kind === GEOMETRY_TYPES.LINE) {
        centerOffset = /** @type {number} */ (t) - 0.5; // -0.5 to 0.5, where 0 is center
      } else if (geometry.kind === GEOMETRY_TYPES.ARC) {
        // For arcs, calculate position along the arc (0 = start, 1 = end)
        let arcPosition;
        if (seatCount === 1) {
          arcPosition = 0.5;
        } else {
          arcPosition = i / (seatCount - 1);
        }
        centerOffset = arcPosition - 0.5; // -0.5 to 0.5, where 0 is center
      }

      // Create a smooth curve effect (parabolic)
      // Higher curve values create more pronounced upward shift in center
      const curveEffect = -Math.pow(/** @type {number} */ (centerOffset) * 2, 2) + 1; // 1 at center, 0 at ends
      const curveOffset = curve * curveEffect * 20; // Scale by curve value and constant

      // Apply the curve offset perpendicular to the row direction
      const normal = getRowNormalAt(geometry, t);
      localX += normal.x * curveOffset;
      localY += normal.y * curveOffset;
    }

    // Generate seat label with scalable row naming (A-1, A-2, B-1, AA-1, etc.)
    const seatNumber = i + 1;
    const label = rowIndex !== null
      ? generateSeatLabel(rowIndex, seatNumber)
      : `${seatNumber}`; // Fallback to simple numbering if no rowIndex provided

    // If we have existing seats and should preserve dimensions, use the existing seat properties
    let seat;
    if (preserveExistingDimensions && existingSeats[i]) {
      const existingSeat = existingSeats[i];
      seat = createSeat(
        row.id,
        localX,
        localY,
        label,
        categoryId,
        existingSeat.width,
        existingSeat.height,
      );
      // Preserve other properties from existing seat
      seat.radius = existingSeat.radius;
      seat.isAvailable = existingSeat.isAvailable;
      seat.categoryId = existingSeat.categoryId;
    } else {
      seat = createSeat(
        row.id,
        localX,
        localY,
        label,
        categoryId,
        finalSeatWidth,
        finalSeatHeight,
      );
    }

    seats.push(seat);
  }

  return seats;
}

/**
 * Calculate arc length along an elliptical arc from start angle to given angle
 */
export function calculateEllipticalArcLength(
  radiusX,
  radiusY,
  startAngle,
  endAngle,
  numSegments = 100,
) {
  if (Math.abs(endAngle - startAngle) < 0.001) return 0;

  const angleSpan = endAngle - startAngle;
  const segmentAngle = angleSpan / numSegments;
  let totalLength = 0;

  // Use numerical integration to calculate arc length
  for (let i = 0; i < numSegments; i++) {
    const angle1 = startAngle + i * segmentAngle;
    const angle2 = startAngle + (i + 1) * segmentAngle;

    // Calculate derivative of ellipse parametric equations
    const dx1 = -radiusX * Math.sin(angle1);
    const dy1 = radiusY * Math.cos(angle1);
    const dx2 = -radiusX * Math.sin(angle2);
    const dy2 = radiusY * Math.cos(angle2);

    // Approximate arc length using trapezoidal rule
    const segmentLength =
      Math.sqrt(
        (((dx1 + dx2) / 2) * (dx1 + dx2)) / 2 +
          (((dy1 + dy2) / 2) * (dy1 + dy2)) / 2,
      ) * segmentAngle;
    totalLength += segmentLength;
  }

  return totalLength;
}

/**
 * Find angle corresponding to a specific arc length along an elliptical arc
 */
export function findAngleForArcLength(
  radiusX,
  radiusY,
  startAngle,
  endAngle,
  targetLength,
  numSegments = 100,
) {
  if (targetLength <= 0) return startAngle;
  if (
    targetLength >=
    calculateEllipticalArcLength(
      radiusX,
      radiusY,
      startAngle,
      endAngle,
      numSegments,
    )
  ) {
    return endAngle;
  }

  const angleSpan = endAngle - startAngle;
  const segmentAngle = angleSpan / numSegments;
  let currentLength = 0;
  let currentAngle = startAngle;

  // Walk along the arc accumulating length until we reach target
  for (let i = 0; i < numSegments; i++) {
    const angle1 = startAngle + i * segmentAngle;
    const angle2 = startAngle + (i + 1) * segmentAngle;

    const dx1 = -radiusX * Math.sin(angle1);
    const dy1 = radiusY * Math.cos(angle1);
    const dx2 = -radiusX * Math.sin(angle2);
    const dy2 = radiusY * Math.cos(angle2);

    const segmentLength =
      Math.sqrt(
        (((dx1 + dx2) / 2) * (dx1 + dx2)) / 2 +
          (((dy1 + dy2) / 2) * (dy1 + dy2)) / 2,
      ) * segmentAngle;

    if (currentLength + segmentLength >= targetLength) {
      // Interpolate to find exact angle
      const remainingLength = targetLength - currentLength;
      const ratio = remainingLength / segmentLength;
      return angle1 + ratio * segmentAngle;
    }

    currentLength += segmentLength;
  }

  return endAngle;
}

/**
 * Build a cumulative arc-length lookup table for an elliptical arc (R15).
 *
 * generateSeatsForRow previously called findAngleForArcLength once per seat, and
 * that function re-integrated the whole arc each call (and called
 * calculateEllipticalArcLength, another full integration) — so an N-seat curved
 * row did ~N x 300 trig iterations. This integrates the arc ONCE into a
 * cumulative table; angleAtArcLength then binary-searches it in O(log segments)
 * per seat, giving O(segments + N) total with identical numerical results.
 *
 * @returns {{ startAngle:number, endAngle:number, segmentAngle:number, numSegments:number, totalLength:number, cumulative:number[] }}
 */
export function buildEllipticalArcLUT(
  radiusX,
  radiusY,
  startAngle,
  endAngle,
  numSegments = 100,
) {
  const angleSpan = endAngle - startAngle;
  const segmentAngle = angleSpan / numSegments;
  const cumulative = new Array(numSegments + 1);
  cumulative[0] = 0;
  let totalLength = 0;

  for (let i = 0; i < numSegments; i++) {
    const angle1 = startAngle + i * segmentAngle;
    const angle2 = startAngle + (i + 1) * segmentAngle;

    const dx1 = -radiusX * Math.sin(angle1);
    const dy1 = radiusY * Math.cos(angle1);
    const dx2 = -radiusX * Math.sin(angle2);
    const dy2 = radiusY * Math.cos(angle2);

    // Identical trapezoidal segment-length formula to calculateEllipticalArcLength.
    const segmentLength =
      Math.sqrt(
        (((dx1 + dx2) / 2) * (dx1 + dx2)) / 2 +
          (((dy1 + dy2) / 2) * (dy1 + dy2)) / 2,
      ) * segmentAngle;
    totalLength += segmentLength;
    cumulative[i + 1] = totalLength;
  }

  return {
    startAngle,
    endAngle,
    segmentAngle,
    numSegments,
    totalLength,
    cumulative,
  };
}

/**
 * Find the angle at a target arc length using a prebuilt LUT. Numerically
 * equivalent to findAngleForArcLength (same segments, same linear interpolation
 * within the containing segment) but O(log segments) instead of O(segments).
 */
export function angleAtArcLength(lut, targetLength) {
  const { startAngle, endAngle, segmentAngle, numSegments, totalLength, cumulative } =
    lut;
  if (targetLength <= 0) return startAngle;
  if (targetLength >= totalLength) return endAngle;

  // Largest i with cumulative[i] <= targetLength (the segment that contains it).
  let lo = 0;
  let hi = numSegments;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumulative[mid] <= targetLength) lo = mid;
    else hi = mid - 1;
  }
  const segLen = cumulative[lo + 1] - cumulative[lo];
  const remaining = targetLength - cumulative[lo];
  const ratio = segLen > 0 ? remaining / segLen : 0;
  return startAngle + lo * segmentAngle + ratio * segmentAngle;
}

/**
 * Calculate the normal vector at a point on a row (for seat orientation)
 */
export function getRowNormalAt(geometry, t) {
  if (geometry.kind === GEOMETRY_TYPES.LINE) {
    // For straight lines, normal is perpendicular to the line
    const dx = geometry.p2.x - geometry.p1.x;
    const dy = geometry.p2.y - geometry.p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return { x: 0, y: 1 };

    // Return normalized perpendicular vector (rotated 90 degrees)
    return {
      x: -dy / length,
      y: dx / length,
    };
  } else if (geometry.kind === GEOMETRY_TYPES.ARC) {
    // For arcs, normal points toward/away from center
    const { center, radiusX, radiusY, startAngle, endAngle } = geometry;
    const angle = startAngle + t * (endAngle - startAngle);

    // For elliptical arcs, the normal direction is still radial from center
    return {
      x: Math.cos(angle),
      y: Math.sin(angle),
    };
  }

  return { x: 0, y: 1 };
}

/**
 * Calculate the normal vector at a specific arc length position on an elliptical arc
 */
export function getEllipticalArcNormalAt(geometry, arcLength) {
  if (geometry.kind !== GEOMETRY_TYPES.ARC) {
    return { x: 0, y: 1 };
  }

  const { center, radiusX, radiusY, startAngle, endAngle } = geometry;

  // Find the angle corresponding to this arc length
  const angle = findAngleForArcLength(
    radiusX,
    radiusY,
    startAngle,
    endAngle,
    arcLength,
  );

  // For elliptical arcs, the normal direction is radial from center
  return {
    x: Math.cos(angle),
    y: Math.sin(angle),
  };
}

/**
 * Calculate bounding box for a set of points
 */
export function calculateBounds(points) {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Check if a point is inside a rectangle
 */
export function pointInRect(px, py, rectX, rectY, rectWidth, rectHeight) {
  return (
    px >= rectX &&
    px <= rectX + rectWidth &&
    py >= rectY &&
    py <= rectY + rectHeight
  );
}

/**
 * Calculate distance between two points
 */
export function distance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the angle between two points
 */
export function angle(p1, p2) {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

/**
 * Rotate a point around another point
 */
export function rotatePoint(point, center, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/**
 * Linear interpolation between two values
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Clamp a value between min and max
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Convert degrees to radians
 */
export function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians) {
  return radians * (180 / Math.PI);
}

/**
 * Snap a value to a grid
 */
export function snapToGrid(value, gridSize) {
  return Math.round(value / gridSize) * gridSize;
}

/**
 * Get the center point of a geometry
 */
export function getGeometryCenter(geometry) {
  if (geometry.kind === GEOMETRY_TYPES.LINE) {
    return {
      x: (geometry.p1.x + geometry.p2.x) / 2,
      y: (geometry.p1.y + geometry.p2.y) / 2,
    };
  } else if (geometry.kind === GEOMETRY_TYPES.ARC) {
    return {
      x: geometry.center.x,
      y: geometry.center.y,
    };
  }

  return { x: 0, y: 0 };
}
