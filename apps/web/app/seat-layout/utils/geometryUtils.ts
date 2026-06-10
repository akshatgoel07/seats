/**
 * Geometry utility functions for seat layout calculations
 */

import { CONTENT_BOUNDS_PADDING } from "./constants.ts";

/**
 * Check if a point is inside a rotated rectangle
 * @param {number} pointX - X coordinate of the point
 * @param {number} pointY - Y coordinate of the point
 * @param {Object} rect - Rectangle with x, y, width, height, rotation
 * @returns {boolean} True if point is inside the rectangle
 */
export function isPointInRotatedRect(pointX, pointY, rect) {
  const { x, y, width, height, rotation } = rect;
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  // Translate point to rectangle's local coordinate system
  const dx = pointX - x;
  const dy = pointY - y;

  // Rotate point back to rectangle's local space (inverse rotation)
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const rotatedX = dx * cos - dy * sin;
  const rotatedY = dx * sin + dy * cos;

  // Check if point is inside the unrotated rectangle
  return (
    rotatedX >= -halfWidth &&
    rotatedX <= halfWidth &&
    rotatedY >= -halfHeight &&
    rotatedY <= halfHeight
  );
}

/**
 * Calculate bounding box for an array of seats
 * @param {Object} seats - Object with seat IDs as keys and seat data as values
 * @returns {Object|null} Bounding box with minX, minY, maxX, maxY, or null if no seats
 */
export function calculateSeatsBounds(seats) {
  if (!seats || Object.keys(seats).length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  Object.values(seats).forEach((seatData) => {
    const x = seatData.localX || 0;
    const y = seatData.localY || 0;
    const width = seatData.width || 20;
    const height = seatData.height || 20;
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    minX = Math.min(minX, x - halfWidth);
    minY = Math.min(minY, y - halfHeight);
    maxX = Math.max(maxX, x + halfWidth);
    maxY = Math.max(maxY, y + halfHeight);
  });

  if (
    minX === Infinity ||
    minY === Infinity ||
    maxX === -Infinity ||
    maxY === -Infinity
  ) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Calculate bounding box for elements (standing sections, seating sections, etc.)
 * @param {Object} elements - Object with element IDs as keys and element data as values
 * @returns {Object|null} Bounding box with minX, minY, maxX, maxY, or null if no elements
 */
export function calculateElementsBounds(elements) {
  if (!elements || Object.keys(elements).length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  Object.values(elements).forEach((element) => {
    if (
      element.type === "standing-section" ||
      element.type === "seating-section"
    ) {
      const scale = element.scale || 1.0;
      const halfWidth = (element.width * scale) / 2;
      const halfHeight = (element.height * scale) / 2;
      minX = Math.min(minX, element.x - halfWidth);
      minY = Math.min(minY, element.y - halfHeight);
      maxX = Math.max(maxX, element.x + halfWidth);
      maxY = Math.max(maxY, element.y + halfHeight);
    } else if (element.type === "path" && element.points) {
      const scale = element.scale || 1.0;
      element.points.forEach((point) => {
        const scaledX = point.x * scale;
        const scaledY = point.y * scale;
        minX = Math.min(minX, scaledX);
        minY = Math.min(minY, scaledY);
        maxX = Math.max(maxX, scaledX);
        maxY = Math.max(maxY, scaledY);
      });
    } else if (element.type === "circle") {
      const scale = element.scale || 1.0;
      const radius =
        (element.radius || Math.min(element.width, element.height) / 2) * scale;
      minX = Math.min(minX, element.x - radius);
      minY = Math.min(minY, element.y - radius);
      maxX = Math.max(maxX, element.x + radius);
      maxY = Math.max(maxY, element.y + radius);
    } else if (element.type === "rectangle") {
      const scale = element.scale || 1.0;
      const halfWidth = (element.width * scale) / 2;
      const halfHeight = (element.height * scale) / 2;
      minX = Math.min(minX, element.x - halfWidth);
      minY = Math.min(minY, element.y - halfHeight);
      maxX = Math.max(maxX, element.x + halfWidth);
      maxY = Math.max(maxY, element.y + halfHeight);
    }
  });

  if (
    minX === Infinity ||
    minY === Infinity ||
    maxX === -Infinity ||
    maxY === -Infinity
  ) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Calculate content bounds with padding
 * @param {Object} canvasSceneData - Canvas scene data with seats and elements
 * @returns {Object|null} Content bounds with padding, or null if no content
 */
export function calculateContentBounds(canvasSceneData) {
  if (
    !canvasSceneData ||
    !canvasSceneData.seats ||
    Object.keys(canvasSceneData.seats).length === 0
  ) {
    return null;
  }

  // Calculate bounds from seats
  const seatsBounds = calculateSeatsBounds(canvasSceneData.seats);
  if (!seatsBounds) return null;

  let { minX, minY, maxX, maxY } = seatsBounds;

  // Calculate bounds from elements
  if (canvasSceneData.elements) {
    const elementsBounds = calculateElementsBounds(canvasSceneData.elements);
    if (elementsBounds) {
      minX = Math.min(minX, elementsBounds.minX);
      minY = Math.min(minY, elementsBounds.minY);
      maxX = Math.max(maxX, elementsBounds.maxX);
      maxY = Math.max(maxY, elementsBounds.maxY);
    }
  }

  // If no bounds found, return null
  if (
    minX === Infinity ||
    minY === Infinity ||
    maxX === -Infinity ||
    maxY === -Infinity
  ) {
    return null;
  }

  // Add padding, enforcing a minimum so the viewport never zooms to an
  // absurd scale when content spans only a handful of SVG units (e.g. a
  // row whose geometry endpoints haven't been drawn yet).
  const MIN_CONTENT_SIZE = 400;
  const width = maxX - minX;
  const height = maxY - minY;
  const paddedWidth = Math.max(width * (1 + CONTENT_BOUNDS_PADDING * 2), MIN_CONTENT_SIZE);
  const paddedHeight = Math.max(height * (1 + CONTENT_BOUNDS_PADDING * 2), MIN_CONTENT_SIZE);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    minX: centerX - paddedWidth / 2,
    minY: centerY - paddedHeight / 2,
    maxX: centerX + paddedWidth / 2,
    maxY: centerY + paddedHeight / 2,
    width: paddedWidth,
    height: paddedHeight,
    centerX,
    centerY,
  };
}

/**
 * Clamp viewBox position to stay within content bounds
 * @param {Object} viewBox - ViewBox with x, y, width, height
 * @param {Object} contentBounds - Content bounds with minX, minY, maxX, maxY, width, height
 * @returns {Object} Clamped viewBox position with x and y
 */
export function clampViewBoxToBounds(viewBox, contentBounds) {
  if (!contentBounds) return { x: viewBox.x, y: viewBox.y };

  let newX = viewBox.x;
  let newY = viewBox.y;

  // Clamp the viewBox position to stay within content bounds
  if (newX < contentBounds.minX) {
    newX = contentBounds.minX;
  } else if (newX + viewBox.width > contentBounds.maxX) {
    newX = contentBounds.maxX - viewBox.width;
  }

  if (newY < contentBounds.minY) {
    newY = contentBounds.minY;
  } else if (newY + viewBox.height > contentBounds.maxY) {
    newY = contentBounds.maxY - viewBox.height;
  }

  // If clamped viewBox is still larger than bounds, center it
  if (viewBox.width >= contentBounds.width) {
    newX = contentBounds.minX;
  }
  if (viewBox.height >= contentBounds.height) {
    newY = contentBounds.minY;
  }

  return { x: newX, y: newY };
}

/**
 * Check if a seat is within the viewport bounds
 * @param {Object} seat - Seat with position and dimensions
 * @param {Object} viewBox - Current viewBox
 * @param {number} padding - Viewport padding for culling
 * @returns {boolean} True if seat is visible in viewport
 */
export function isSeatInViewport(seat, viewBox, padding = 0) {
  const { position, dimensions } = seat;
  const halfWidth = (dimensions?.width || 20) / 2;
  const halfHeight = (dimensions?.height || 20) / 2;

  const minX = viewBox.x - padding;
  const minY = viewBox.y - padding;
  const maxX = viewBox.x + viewBox.width + padding;
  const maxY = viewBox.y + viewBox.height + padding;

  return (
    position.x + halfWidth >= minX &&
    position.x - halfWidth <= maxX &&
    position.y + halfHeight >= minY &&
    position.y - halfHeight <= maxY
  );
}
