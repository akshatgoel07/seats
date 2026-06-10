/**
 * Coordinate transformation utilities for SVG
 */

/**
 * Convert seat position (SVG coords) to screen coordinates
 * @param {Object} svgRef - Reference to the SVG element
 * @param {Object} seatPos - Seat position with x and y coordinates
 * @returns {Object} Screen coordinates with x and y
 */
export function getScreenCoords(svgRef, seatPos) {
  const svg = svgRef.current;
  if (!svg) return { x: 0, y: 0 };

  const pt = svg.createSVGPoint();
  pt.x = seatPos.x;
  pt.y = seatPos.y;

  const screenCTM = svg.getScreenCTM();
  if (screenCTM) {
    const { x, y } = pt.matrixTransform(screenCTM);
    return { x, y };
  }

  return { x: 0, y: 0 };
}

/**
 * Convert mouse position to SVG coordinates
 * @param {Object} svgRef - Reference to the SVG element
 * @param {number} clientX - Mouse client X position
 * @param {number} clientY - Mouse client Y position
 * @returns {Object|null} SVG coordinates with x and y, or null if conversion fails
 */
export function clientToSVGCoords(svgRef, clientX, clientY) {
  const svg = svgRef.current;
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  const mouseX = clientX - rect.left;
  const mouseY = clientY - rect.top;

  const pt = svg.createSVGPoint();
  pt.x = mouseX;
  pt.y = mouseY;

  const svgCTM = svg.getCTM();
  if (svgCTM) {
    const { x, y } = pt.matrixTransform(svgCTM.inverse());
    return { x, y };
  }

  return null;
}

/**
 * Apply scale transformation to a point around a center point
 * @param {Object} point - Point to transform with x and y
 * @param {Object} center - Center point for scaling with x and y
 * @param {number} scale - Scale factor
 * @returns {Object} Transformed point with x and y
 */
export function scalePointAroundCenter(point, center, scale) {
  return {
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  };
}

/**
 * Apply scale transformation to multiple points around a center point
 * @param {Array} points - Array of points to transform
 * @param {Object} center - Center point for scaling with x and y
 * @param {number} scale - Scale factor
 * @returns {Array} Array of transformed points
 */
export function scalePointsAroundCenter(points, center, scale) {
  return points.map((point) => scalePointAroundCenter(point, center, scale));
}

/**
 * Calculate the center point of an array of points
 * @param {Array} points - Array of points with x and y coordinates
 * @returns {Object} Center point with x and y
 */
export function calculateCenterPoint(points) {
  if (!points || points.length === 0) {
    return { x: 0, y: 0 };
  }

  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);

  return {
    x: sumX / points.length,
    y: sumY / points.length,
  };
}

/**
 * Calculate zoom towards a specific point
 * @param {Object} currentViewBox - Current viewBox with x, y, width, height
 * @param {Object} zoomPoint - Point to zoom towards with x and y
 * @param {number} scale - Scale factor for zoom
 * @returns {Object} New viewBox position with x and y
 */
export function calculateZoomToPoint(currentViewBox, zoomPoint, scale) {
  const newX = currentViewBox.x + (zoomPoint.x - currentViewBox.x) * (1 - scale);
  const newY = currentViewBox.y + (zoomPoint.y - currentViewBox.y) * (1 - scale);

  return { x: newX, y: newY };
}

/**
 * Get touch distance between two touch points
 * @param {TouchList} touches - Touch list with at least 2 touches
 * @returns {number|null} Distance between touches, or null if less than 2 touches
 */
export function getTouchDistance(touches) {
  if (touches.length < 2) return null;

  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get center point between two touch points
 * @param {TouchList} touches - Touch list with at least 2 touches
 * @returns {Object|null} Center point with x and y, or null if less than 2 touches
 */
export function getTouchCenter(touches) {
  if (touches.length < 2) return null;

  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}
