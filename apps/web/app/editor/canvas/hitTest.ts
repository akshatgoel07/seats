import { buildSeatsByRow, makeRowCentroidGetter } from "./seatIndex.ts";

// Helper function to calculate a point on a cubic Bezier curve
function getBezierPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const u2 = u * u;
  const u3 = u2 * u;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
    y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
  };
}

// Helper function to perform hit testing on a cubic Bezier curve
function hitTestBezierCurve(p0, cp1, cp2, p3, testX, testY, tolerance) {
  // Sample points along the curve (more samples = better accuracy but slower performance)
  const samples = 20;

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const point = getBezierPoint(p0, cp1, cp2, p3, t);

    // Calculate distance from test point to curve point
    const dx = testX - point.x;
    const dy = testY - point.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= tolerance) {
      return true;
    }
  }

  return false;
}

// Helper function to check if a point is inside a closed path using ray casting algorithm
function isPointInsideClosedPath(testX, testY, points, curveHandles) {
  if (!points || points.length < 3) return false;

  let intersections = 0;

  // For paths with curve handles, we need to sample points along the curves
  if (curveHandles && Object.keys(curveHandles).length > 0) {
    // Sample points along each segment to create a polygon approximation
    const sampledPoints = [];

    for (let i = 0; i < points.length; i++) {
      const segmentHandles = curveHandles[i];
      const nextIndex = (i + 1) % points.length;

      // Add the current point
      sampledPoints.push(points[i]);

      // If this segment has curve handles, sample points along the curve
      if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
        const samples = 10; // Number of samples per curve segment
        for (let j = 1; j < samples; j++) {
          const t = j / samples;
          const point = getBezierPoint(
            points[i],
            segmentHandles.cp1,
            segmentHandles.cp2,
            points[nextIndex],
            t
          );
          sampledPoints.push(point);
        }
      }
    }

    // Use the sampled points for ray casting
    for (let i = 0; i < sampledPoints.length; i++) {
      const p1 = sampledPoints[i];
      const p2 = sampledPoints[(i + 1) % sampledPoints.length];

      // Ray casting: cast a ray from testPoint to the right (positive x direction)
      // Check if the ray intersects with the edge (p1, p2)
      if ((p1.y > testY) !== (p2.y > testY)) {
        // Calculate x coordinate of intersection point
        const intersectX = p1.x + ((testY - p1.y) * (p2.x - p1.x)) / (p2.y - p1.y);
        if (testX < intersectX) {
          intersections++;
        }
      }
    }
  } else {
    // Simple polygon without curves - use standard ray casting
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];

      // Ray casting: cast a ray from testPoint to the right (positive x direction)
      // Check if the ray intersects with the edge (p1, p2)
      if ((p1.y > testY) !== (p2.y > testY)) {
        // Calculate x coordinate of intersection point
        const intersectX = p1.x + ((testY - p1.y) * (p2.x - p1.x)) / (p2.y - p1.y);
        if (testX < intersectX) {
          intersections++;
        }
      }
    }
  }

  // If the number of intersections is odd, the point is inside
  return intersections % 2 === 1;
}

// Separate function to prioritize boundary (PATH) and section boundary elements for easier selection
export function hitTestBoundary(worldX, worldY, state, ELEMENT_TYPES) {
  const { elements } = state.scene;

  // Check PATH and SECTION_BOUNDARY elements first (boundaries)
  const pathElements = Object.values(elements).filter(
    (element) =>
      (element.type === ELEMENT_TYPES.PATH ||
        element.type === ELEMENT_TYPES.SECTION_BOUNDARY) &&
      element.points,
  );

  // Check in reverse order (newer elements first)
  for (const element of pathElements.reverse()) {
    const scale = element.scale || 1.0;

    // Apply scaling transformation to test point (reverse of element scaling)
    let adjustedWorldX = worldX;
    let adjustedWorldY = worldY;

    if (scale !== 1.0) {
      // Calculate center point of the element
      const centerX =
        element.points.reduce((sum, p) => sum + p.x, 0) / element.points.length;
      const centerY =
        element.points.reduce((sum, p) => sum + p.y, 0) / element.points.length;

      // Reverse the scaling transformation
      adjustedWorldX = centerX + (worldX - centerX) / scale;
      adjustedWorldY = centerY + (worldY - centerY) / scale;
    }

    // First check if this is a closed path and if the point is inside
    if (element.isClosed) {
      const isInside = isPointInsideClosedPath(
        adjustedWorldX,
        adjustedWorldY,
        element.points,
        element.curveHandles
      );
      if (isInside) {
        return { type: "element", id: element.id };
      }
    }

    const tolerance = 10;

    // Check if the path has curve handles (Bezier curves)
    if (element.curveHandles && Object.keys(element.curveHandles).length > 0) {
      // Hit testing for Bezier curves - sample points along the curve
      for (let i = 0; i < element.points.length - 1; i++) {
        const segmentHandles = element.curveHandles[i];
        if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
          // This is a Bezier curve segment - sample points along the curve
          const isHit = hitTestBezierCurve(
            element.points[i],
            segmentHandles.cp1,
            segmentHandles.cp2,
            element.points[i + 1],
            adjustedWorldX,
            adjustedWorldY,
            tolerance,
          );
          if (isHit) {
            return { type: "element", id: element.id };
          }
        } else {
          // Fallback to straight line hit testing
          const p1 = element.points[i];
          const p2 = element.points[i + 1];
          const A = adjustedWorldY - p1.y;
          const B = p1.x - adjustedWorldX;
          const C =
            (p2.x - p1.x) * (adjustedWorldY - p1.y) -
            (p2.y - p1.y) * (adjustedWorldX - p1.x);
          const distance = Math.abs(C) / Math.sqrt(A * A + B * B);
          const minX = Math.min(p1.x, p2.x) - tolerance;
          const maxX = Math.max(p1.x, p2.x) + tolerance;
          const minY = Math.min(p1.y, p2.y) - tolerance;
          const maxY = Math.max(p1.y, p2.y) + tolerance;
          if (
            distance <= tolerance &&
            adjustedWorldX >= minX &&
            adjustedWorldX <= maxX &&
            adjustedWorldY >= minY &&
            adjustedWorldY <= maxY
          ) {
            return { type: "element", id: element.id };
          }
        }
      }
    } else {
      // No curve handles - use straight line hit testing
      for (let i = 0; i < element.points.length - 1; i++) {
        const p1 = element.points[i];
        const p2 = element.points[i + 1];
        const A = adjustedWorldY - p1.y;
        const B = p1.x - adjustedWorldX;
        const C =
          (p2.x - p1.x) * (adjustedWorldY - p1.y) -
          (p2.y - p1.y) * (adjustedWorldX - p1.x);
        const distance = Math.abs(C) / Math.sqrt(A * A + B * B);
        const minX = Math.min(p1.x, p2.x) - tolerance;
        const maxX = Math.max(p1.x, p2.x) + tolerance;
        const minY = Math.min(p1.y, p2.y) - tolerance;
        const maxY = Math.max(p1.y, p2.y) + tolerance;
        if (
          distance <= tolerance &&
          adjustedWorldX >= minX &&
          adjustedWorldX <= maxX &&
          adjustedWorldY >= minY &&
          adjustedWorldY <= maxY
        ) {
          return { type: "element", id: element.id };
        }
      }
    }
  }

  return null;
}

export function hitTestElement(worldX, worldY, state, ELEMENT_TYPES) {
  const { elements } = state.scene;
  const nonImageElements = Object.values(elements).filter(
    (element) => element.type !== ELEMENT_TYPES.IMAGE,
  );
  const imageElements = Object.values(elements).filter(
    (element) => element.type === ELEMENT_TYPES.IMAGE,
  );
  const elementList = [
    ...nonImageElements.reverse(),
    ...imageElements.reverse(),
  ];
  for (const element of elementList) {
    const scale = element.scale || 1.0;

    // Apply scaling transformation to test point (reverse of element scaling)
    let adjustedWorldX = worldX;
    let adjustedWorldY = worldY;

    if (scale !== 1.0) {
      // For elements with position (circle, rectangle, text), scale around their center
      const centerX = element.x;
      const centerY = element.y;

      // Reverse the scaling transformation
      adjustedWorldX = centerX + (worldX - centerX) / scale;
      adjustedWorldY = centerY + (worldY - centerY) / scale;
    }

    if (element.type === ELEMENT_TYPES.CIRCLE) {
      const dx = adjustedWorldX - element.x;
      const dy = adjustedWorldY - element.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const radius =
        (element.radius || Math.min(element.width, element.height) / 2) * scale;
      if (distance <= radius) {
        return { type: "element", id: element.id };
      }
    } else if (element.type === ELEMENT_TYPES.RECTANGLE) {
      const halfWidth = (element.width * scale) / 2;
      const halfHeight = (element.height * scale) / 2;

      // Account for rotation by transforming the test point
      let testX = adjustedWorldX;
      let testY = adjustedWorldY;

      if (element.rotation) {
        // Apply inverse rotation to the test point
        const cos = Math.cos(-element.rotation);
        const sin = Math.sin(-element.rotation);
        const relativeX = adjustedWorldX - element.x;
        const relativeY = adjustedWorldY - element.y;
        testX = relativeX * cos - relativeY * sin + element.x;
        testY = relativeX * sin + relativeY * cos + element.y;
      }

      if (
        testX >= element.x - halfWidth &&
        testX <= element.x + halfWidth &&
        testY >= element.y - halfHeight &&
        testY <= element.y + halfHeight
      ) {
        return { type: "element", id: element.id };
      }
    } else if (
      element.type === ELEMENT_TYPES.STANDING_SECTION ||
      element.type === ELEMENT_TYPES.SEATING_SECTION
    ) {
      // Check if this seating section has a custom path boundary
      if (element.pathBoundary && element.pathBoundary.points && element.pathBoundary.points.length > 0) {
        // Use path boundary for hit testing
        let pathAdjustedWorldX = adjustedWorldX;
        let pathAdjustedWorldY = adjustedWorldY;

        if (scale !== 1.0) {
          // Calculate center point of the path boundary
          const pathCenterX =
            element.pathBoundary.points.reduce((sum, p) => sum + p.x, 0) /
            element.pathBoundary.points.length;
          const pathCenterY =
            element.pathBoundary.points.reduce((sum, p) => sum + p.y, 0) /
            element.pathBoundary.points.length;

          // Reverse the scaling transformation for path
          pathAdjustedWorldX =
            pathCenterX + (adjustedWorldX - pathCenterX) / scale;
          pathAdjustedWorldY =
            pathCenterY + (adjustedWorldY - pathCenterY) / scale;
        }

        // Check if point is inside the path boundary
        const isInside = isPointInsideClosedPath(
          pathAdjustedWorldX,
          pathAdjustedWorldY,
          element.pathBoundary.points,
          element.pathBoundary.curveHandles
        );
        if (isInside) {
          return { type: "element", id: element.id };
        }

        // Also check edges with tolerance
        const tolerance = 10;
        if (element.pathBoundary.curveHandles && Object.keys(element.pathBoundary.curveHandles).length > 0) {
          for (let i = 0; i < element.pathBoundary.points.length - 1; i++) {
            const segmentHandles = element.pathBoundary.curveHandles[i];
            if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
              const isHit = hitTestBezierCurve(
                element.pathBoundary.points[i],
                segmentHandles.cp1,
                segmentHandles.cp2,
                element.pathBoundary.points[i + 1],
                pathAdjustedWorldX,
                pathAdjustedWorldY,
                tolerance,
              );
              if (isHit) {
                return { type: "element", id: element.id };
              }
            }
          }
        }
      } else {
        // Use rectangular bounding box for hit testing (original behavior)
        const halfWidth = (element.width * scale) / 2;
        const halfHeight = (element.height * scale) / 2;

        // Account for rotation by transforming the test point
        let testX = adjustedWorldX;
        let testY = adjustedWorldY;

        if (element.rotation) {
          // Apply inverse rotation to the test point
          const cos = Math.cos(-element.rotation);
          const sin = Math.sin(-element.rotation);
          const relativeX = adjustedWorldX - element.x;
          const relativeY = adjustedWorldY - element.y;
          testX = relativeX * cos - relativeY * sin + element.x;
          testY = relativeX * sin + relativeY * cos + element.y;
        }

        if (
          testX >= element.x - halfWidth &&
          testX <= element.x + halfWidth &&
          testY >= element.y - halfHeight &&
          testY <= element.y + halfHeight
        ) {
          return { type: "element", id: element.id };
        }
      }
    } else if (
      (element.type === ELEMENT_TYPES.PATH ||
        element.type === ELEMENT_TYPES.SECTION_BOUNDARY) &&
      element.points
    ) {
      // For path elements, apply scaling transformation around the center of all points
      let pathAdjustedWorldX = adjustedWorldX;
      let pathAdjustedWorldY = adjustedWorldY;

      if (scale !== 1.0) {
        // Calculate center point of the path
        const pathCenterX =
          element.points.reduce((sum, p) => sum + p.x, 0) /
          element.points.length;
        const pathCenterY =
          element.points.reduce((sum, p) => sum + p.y, 0) /
          element.points.length;

        // Reverse the scaling transformation for path
        pathAdjustedWorldX =
          pathCenterX + (adjustedWorldX - pathCenterX) / scale;
        pathAdjustedWorldY =
          pathCenterY + (adjustedWorldY - pathCenterY) / scale;
      }

      // First check if this is a closed path and if the point is inside
      if (element.isClosed) {
        const isInside = isPointInsideClosedPath(
          pathAdjustedWorldX,
          pathAdjustedWorldY,
          element.points,
          element.curveHandles
        );
        if (isInside) {
          return { type: "element", id: element.id };
        }
      }

      const tolerance = 10;

      // Check if the path has curve handles (Bezier curves)
      if (
        element.curveHandles &&
        Object.keys(element.curveHandles).length > 0
      ) {
        // Hit testing for Bezier curves - sample points along the curve
        for (let i = 0; i < element.points.length - 1; i++) {
          const segmentHandles = element.curveHandles[i];
          if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
            // This is a Bezier curve segment - sample points along the curve
            const isHit = hitTestBezierCurve(
              element.points[i],
              segmentHandles.cp1,
              segmentHandles.cp2,
              element.points[i + 1],
              pathAdjustedWorldX,
              pathAdjustedWorldY,
              tolerance,
            );
            if (isHit) {
              return { type: "element", id: element.id };
            }
          } else {
            // Fallback to straight line hit testing
            const p1 = element.points[i];
            const p2 = element.points[i + 1];
            const A = pathAdjustedWorldY - p1.y;
            const B = p1.x - pathAdjustedWorldX;
            const C =
              (p2.x - p1.x) * (pathAdjustedWorldY - p1.y) -
              (p2.y - p1.y) * (pathAdjustedWorldX - p1.x);
            const distance = Math.abs(C) / Math.sqrt(A * A + B * B);
            const minX = Math.min(p1.x, p2.x) - tolerance;
            const maxX = Math.max(p1.x, p2.x) + tolerance;
            const minY = Math.min(p1.y, p2.y) - tolerance;
            const maxY = Math.max(p1.y, p2.y) + tolerance;
            if (
              distance <= tolerance &&
              pathAdjustedWorldX >= minX &&
              pathAdjustedWorldX <= maxX &&
              pathAdjustedWorldY >= minY &&
              pathAdjustedWorldY <= maxY
            ) {
              return { type: "element", id: element.id };
            }
          }
        }
      } else {
        // No curve handles - use straight line hit testing
        for (let i = 0; i < element.points.length - 1; i++) {
          const p1 = element.points[i];
          const p2 = element.points[i + 1];
          const A = pathAdjustedWorldY - p1.y;
          const B = p1.x - pathAdjustedWorldX;
          const C =
            (p2.x - p1.x) * (pathAdjustedWorldY - p1.y) -
            (p2.y - p1.y) * (pathAdjustedWorldX - p1.x);
          const distance = Math.abs(C) / Math.sqrt(A * A + B * B);
          const minX = Math.min(p1.x, p2.x) - tolerance;
          const maxX = Math.max(p1.x, p2.x) + tolerance;
          const minY = Math.min(p1.y, p2.y) - tolerance;
          const maxY = Math.max(p1.y, p2.y) + tolerance;
          if (
            distance <= tolerance &&
            pathAdjustedWorldX >= minX &&
            pathAdjustedWorldX <= maxX &&
            pathAdjustedWorldY >= minY &&
            pathAdjustedWorldY <= maxY
          ) {
            return { type: "element", id: element.id };
          }
        }
      }
    }
    if (element.type === ELEMENT_TYPES.TEXT) {
      const fontSize = (element.fontSize || 16) * scale;
      const text = element.text || "Text";
      const textWidth = text.length * fontSize * 0.6;
      const textHeight = fontSize;
      const halfWidth = textWidth / 2;
      const halfHeight = textHeight / 2;

      // Account for rotation by transforming the test point
      let testX = adjustedWorldX;
      let testY = adjustedWorldY;

      if (element.rotation) {
        // Apply inverse rotation to the test point
        const cos = Math.cos(-element.rotation);
        const sin = Math.sin(-element.rotation);
        const relativeX = adjustedWorldX - element.x;
        const relativeY = adjustedWorldY - element.y;
        testX = relativeX * cos - relativeY * sin + element.x;
        testY = relativeX * sin + relativeY * cos + element.y;
      }

      if (
        testX >= element.x - halfWidth &&
        testX <= element.x + halfWidth &&
        testY >= element.y - halfHeight &&
        testY <= element.y + halfHeight
      ) {
        return { type: "element", id: element.id };
      }
    } else if (element.type === ELEMENT_TYPES.IMAGE) {
      const halfWidth = (element.width * scale) / 2;
      const halfHeight = (element.height * scale) / 2;

      // Account for rotation by transforming the test point
      let testX = adjustedWorldX;
      let testY = adjustedWorldY;

      if (element.rotation) {
        // Apply inverse rotation to the test point
        const cos = Math.cos(-element.rotation);
        const sin = Math.sin(-element.rotation);
        const relativeX = adjustedWorldX - element.x;
        const relativeY = adjustedWorldY - element.y;
        testX = relativeX * cos - relativeY * sin + element.x;
        testY = relativeX * sin + relativeY * cos + element.y;
      }

      if (
        testX >= element.x - halfWidth &&
        testX <= element.x + halfWidth &&
        testY >= element.y - halfHeight &&
        testY <= element.y + halfHeight
      ) {
        // Check if clicking on lock icon area for locked images
        if (element.locked) {
          // Lock icon is positioned in the top-right corner of the image
          // Check if click is within the lock icon area (approximately 20x20 pixels)
          const lockIconSize = 20 * scale;
          const lockIconX = element.x + halfWidth - lockIconSize / 2;
          const lockIconY = element.y - halfHeight + lockIconSize / 2;

          if (
            testX >= lockIconX - lockIconSize / 2 &&
            testX <= lockIconX + lockIconSize / 2 &&
            testY >= lockIconY - lockIconSize / 2 &&
            testY <= lockIconY + lockIconSize / 2
          ) {
            return { type: "lockIcon", id: element.id };
          }
        }

        // For unlocked images or clicks outside the lock icon area, return element selection
        if (!element.locked) {
          return { type: "element", id: element.id };
        }
      }
    } else if (element.type === "group") {
      // Hit test group bounding box
      const halfWidth = (element.width * scale) / 2;
      const halfHeight = (element.height * scale) / 2;

      // Account for rotation by transforming the test point
      let testX = adjustedWorldX;
      let testY = adjustedWorldY;

      if (element.rotation) {
        // Apply inverse rotation to the test point
        const cos = Math.cos(-element.rotation);
        const sin = Math.sin(-element.rotation);
        const relativeX = adjustedWorldX - element.x;
        const relativeY = adjustedWorldY - element.y;
        testX = relativeX * cos - relativeY * sin + element.x;
        testY = relativeX * sin + relativeY * cos + element.y;
      }

      if (
        testX >= element.x - halfWidth &&
        testX <= element.x + halfWidth &&
        testY >= element.y - halfHeight &&
        testY <= element.y + halfHeight
      ) {
        return { type: "element", id: element.id };
      }
    }
  }
  return null;
}

export function hitTestSeat(worldX, worldY, state) {
  const { seats, rows, sections } = state.scene;
  // Index seats by row once so rotated-row pivots are O(1) (was O(seats^2)).
  const seatsByRow = buildSeatsByRow(seats);
  const getRowCentroid = makeRowCentroidGetter(seatsByRow);
  let closestSeat = null;
  let closestDistance = Infinity;
  for (const seat of Object.values(seats)) {
    if (!seat.rowId) {
      const halfWidth = seat.width / 2;
      const halfHeight = seat.height / 2;
      if (
        worldX >= seat.localX - halfWidth &&
        worldX <= seat.localX + halfWidth &&
        worldY >= seat.localY - halfHeight &&
        worldY <= seat.localY + halfHeight
      ) {
        const dx = worldX - seat.localX;
        const dy = worldY - seat.localY;
        const distance = dx * dx + dy * dy;
        if (distance < closestDistance) {
          closestDistance = distance;
          closestSeat = { type: "seat", id: seat.id, rowId: null };
        }
      }
      continue;
    }
    const row = rows[seat.rowId];
    if (!row) continue;
    let seatWorldX = seat.localX;
    let seatWorldY = seat.localY;
    if (row.transform && row.transform.rotation) {
      // Rotation pivot = centroid of the row's seats (O(1) cached lookup).
      const { cx: centerX, cy: centerY, count } = getRowCentroid(row.id);
      if (count > 0) {
        // Apply rotation around the center of seats
        const cos = Math.cos(row.transform.rotation);
        const sin = Math.sin(row.transform.rotation);
        const relativeX = seatWorldX - centerX;
        const relativeY = seatWorldY - centerY;
        const rotatedX = relativeX * cos - relativeY * sin;
        const rotatedY = relativeX * sin + relativeY * cos;
        seatWorldX = rotatedX + centerX;
        seatWorldY = rotatedY + centerY;
      }
    }
    const section = sections[row.sectionId];
    if (section && section.transform) {
      const cos = Math.cos(section.transform.rotation || 0);
      const sin = Math.sin(section.transform.rotation || 0);
      const rotatedX = seatWorldX * cos - seatWorldY * sin;
      const rotatedY = seatWorldX * sin + seatWorldY * cos;
      seatWorldX = rotatedX + section.transform.x;
      seatWorldY = rotatedY + section.transform.y;
    }
    const halfWidth = seat.width / 2;
    const halfHeight = seat.height / 2;
    if (
      worldX >= seatWorldX - halfWidth &&
      worldX <= seatWorldX + halfWidth &&
      worldY >= seatWorldY - halfHeight &&
      worldY <= seatWorldY + halfHeight
    ) {
      const dx = worldX - seatWorldX;
      const dy = worldY - seatWorldY;
      const distance = dx * dx + dy * dy;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestSeat = { type: "seat", id: seat.id, rowId: seat.rowId };
      }
    }
  }
  return closestSeat;
}

export function hitTestRow(worldX, worldY, state) {
  const { rows, sections } = state.scene;
  const tolerance = 10 / state.scene.view.scale;
  for (const row of Object.values(rows)) {
    const section = sections[row.sectionId];
    let testX = worldX;
    let testY = worldY;
    if (section && section.transform) {
      const sectionX = section.transform.x || 0;
      const sectionY = section.transform.y || 0;
      const sectionRotation = section.transform.rotation || 0;
      testX -= sectionX;
      testY -= sectionY;
      const cos = Math.cos(-sectionRotation);
      const sin = Math.sin(-sectionRotation);
      const rotatedX = testX * cos - testY * sin;
      const rotatedY = testX * sin + testY * cos;
      testX = rotatedX;
      testY = rotatedY;
    }
    if (row.geometry.kind === "line") {
      const { p1, p2 } = row.geometry;
      const A = testY - p1.y;
      const B = p1.x - testX;
      const C = (testX - p1.x) * (p2.y - p1.y) - (testY - p1.y) * (p2.x - p1.x);
      const distance = Math.abs(C) / Math.sqrt(A * A + B * B);
      const minX = Math.min(p1.x, p2.x) - tolerance;
      const maxX = Math.max(p1.x, p2.x) + tolerance;
      const minY = Math.min(p1.y, p2.y) - tolerance;
      const maxY = Math.max(p1.y, p2.y) + tolerance;
      if (
        distance <= tolerance &&
        testX >= minX &&
        testX <= maxX &&
        testY >= minY &&
        testY <= maxY
      ) {
        return { type: "row", id: row.id };
      }
    } else if (row.geometry.kind === "arc") {
      const { center, radiusX, radiusY, startAngle, endAngle } = row.geometry;
      const dx = testX - center.x;
      const dy = testY - center.y;
      const normalizedX = dx / radiusX;
      const normalizedY = dy / radiusY;
      const distanceFromEllipse = Math.abs(
        Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY) - 1,
      );
      const pixelDistance = distanceFromEllipse * Math.min(radiusX, radiusY);
      if (pixelDistance <= tolerance) {
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += 2 * Math.PI;
        let start = startAngle;
        let end = endAngle;
        if (start < 0) start += 2 * Math.PI;
        if (end < 0) end += 2 * Math.PI;
        if (start <= end) {
          if (angle >= start && angle <= end) {
            return { type: "row", id: row.id };
          }
        } else {
          if (angle >= start || angle <= end) {
            return { type: "row", id: row.id };
          }
        }
      }
    }
  }
  return null;
}

export function hitTestPathSegment(worldX, worldY, element, tolerance = 10) {
  if (!element || !element.points || element.points.length < 2) {
    return null;
  }

  const scale = element.scale || 1.0;
  let adjustedWorldX = worldX;
  let adjustedWorldY = worldY;

  if (scale !== 1.0) {
    const centerX =
      element.points.reduce((sum, p) => sum + p.x, 0) / element.points.length;
    const centerY =
      element.points.reduce((sum, p) => sum + p.y, 0) / element.points.length;
    adjustedWorldX = centerX + (worldX - centerX) / scale;
    adjustedWorldY = centerY + (worldY - centerY) / scale;
  }

  const maxSegments = element.isClosed
    ? element.points.length
    : element.points.length - 1;

  for (let i = 0; i < maxSegments; i++) {
    const p1 = element.points[i];
    const nextIndex = (i + 1) % element.points.length;
    const p2 = element.points[nextIndex];

    const segmentHandles =
      element.curveHandles && element.curveHandles[i]
        ? element.curveHandles[i]
        : null;

    let isHit = false;

    if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
      isHit = hitTestBezierCurve(
        p1,
        segmentHandles.cp1,
        segmentHandles.cp2,
        p2,
        adjustedWorldX,
        adjustedWorldY,
        tolerance,
      );
    } else {
      const A = adjustedWorldY - p1.y;
      const B = p1.x - adjustedWorldX;
      const C =
        (p2.x - p1.x) * (adjustedWorldY - p1.y) -
        (p2.y - p1.y) * (adjustedWorldX - p1.x);
      const distance = Math.abs(C) / Math.sqrt(A * A + B * B);
      const minX = Math.min(p1.x, p2.x) - tolerance;
      const maxX = Math.max(p1.x, p2.x) + tolerance;
      const minY = Math.min(p1.y, p2.y) - tolerance;
      const maxY = Math.max(p1.y, p2.y) + tolerance;

      isHit =
        distance <= tolerance &&
        adjustedWorldX >= minX &&
        adjustedWorldX <= maxX &&
        adjustedWorldY >= minY &&
        adjustedWorldY <= maxY;
    }

    if (isHit) {
      const distToP1 = Math.hypot(
        adjustedWorldX - p1.x,
        adjustedWorldY - p1.y,
      );
      const distToP2 = Math.hypot(
        adjustedWorldX - p2.x,
        adjustedWorldY - p2.y,
      );

      return {
        segmentIndex: i,
        endpoint: distToP1 < distToP2 ? "start" : "end",
        pointIndex: distToP1 < distToP2 ? i : nextIndex,
      };
    }
  }

  return null;
}

export function getItemsInRect(startX, startY, endX, endY, state) {
  const { seats, rows, sections, elements } = state.scene;
  // Index seats by row once so rotated-row pivots are O(1) (was O(seats^2)).
  const seatsByRow = buildSeatsByRow(seats);
  const getRowCentroid = makeRowCentroidGetter(seatsByRow);
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  const minY = Math.min(startY, endY);
  const maxY = Math.max(startY, endY);
  const selectedSeats = [];
  const selectedElements = [];
  Object.values(elements).forEach((element) => {
    // Only include elements that are not locked images in rectangle selection
    if (element.type === "image" && element.locked) {
      return; // Skip locked images
    }
    if (
      element.x >= minX &&
      element.x <= maxX &&
      element.y >= minY &&
      element.y <= maxY
    ) {
      selectedElements.push(element.id);
    }
  });
  Object.values(seats).forEach((seat) => {
    if (!seat.rowId) {
      if (
        seat.localX >= minX &&
        seat.localX <= maxX &&
        seat.localY >= minY &&
        seat.localY <= maxY
      ) {
        selectedSeats.push(seat.id);
      }
      return;
    }
    const row = rows[seat.rowId];
    if (!row) return;
    let seatWorldX = seat.localX;
    let seatWorldY = seat.localY;
    if (row.transform && row.transform.rotation) {
      // Rotation pivot = centroid of the row's seats (O(1) cached lookup).
      const { cx: centerX, cy: centerY, count } = getRowCentroid(row.id);
      if (count > 0) {
        // Apply rotation around the center of seats
        const cos = Math.cos(row.transform.rotation);
        const sin = Math.sin(row.transform.rotation);
        const relativeX = seatWorldX - centerX;
        const relativeY = seatWorldY - centerY;
        const rotatedX = relativeX * cos - relativeY * sin;
        const rotatedY = relativeX * sin + relativeY * cos;
        seatWorldX = rotatedX + centerX;
        seatWorldY = rotatedY + centerY;
      }
    }
    const section = sections[row.sectionId];
    if (section && section.transform) {
      const cos = Math.cos(section.transform.rotation || 0);
      const sin = Math.sin(section.transform.rotation || 0);
      const rotatedX = seatWorldX * cos - seatWorldY * sin;
      const rotatedY = seatWorldX * sin + seatWorldY * cos;
      seatWorldX = rotatedX + section.transform.x;
      seatWorldY = rotatedY + section.transform.y;
    }
    if (
      seatWorldX >= minX &&
      seatWorldX <= maxX &&
      seatWorldY >= minY &&
      seatWorldY <= maxY
    ) {
      selectedSeats.push(seat.id);
    }
  });
  return [...selectedSeats, ...selectedElements];
}
