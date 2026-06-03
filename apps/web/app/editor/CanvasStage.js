"use client";

import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
} from "react";
import { useEditor } from "./EditorContext.js";
import {
  createRow,
  createLineGeometry,
  createArcGeometry,
  createElement,
  ELEMENT_TYPES,
  getNextTableLabel,
} from "./types.js";
import {
  renderGrid as renderGridUtil,
  renderSeats as renderSeatsUtil,
  renderElements as renderElementsUtil,
  renderSeatingSections as renderSeatingSectionsUtil,
  renderBoundaries as renderBoundariesUtil,
  renderSectionBoundaries as renderSectionBoundariesUtil,
  renderTextElements as renderTextElementsUtil,
  renderImageElements as renderImageElementsUtil,
  renderRows as renderRowsUtil,
  renderSelectionRect as renderSelectionRectUtil,
  renderDrawingPreview as renderDrawingPreviewUtil,
  renderRectangleGrid,
  isTextInsideRectangle,
  calculateSnapPosition,
  renderMeasurement as renderMeasurementUtil,
} from "./canvas/renderers.js";
import { renderToolPreview as renderToolPreviewUtil } from "./canvas/toolPreview.js";
import {
  hitTestElement as hitTestElementUtil,
  hitTestBoundary,
  hitTestSeat as hitTestSeatUtil,
  hitTestRow as hitTestRowUtil,
  getItemsInRect as getItemsInRectUtil,
  hitTestPathSegment,
} from "./canvas/hitTest.js";
import { buildSeatsByRow, makeRowCentroidGetter } from "./canvas/seatIndex.js";
import { useSeatTypes } from "./hooks/useSeatTypes.js";
import { useMouseDown } from "./hooks/useMouseDown.js";
import { useParams } from "next/navigation";

/**
 * @typedef {{ x: number, y: number }} Point
 */

/**
 * @typedef {Object} MultiRowState
 * @property {string} phase
 * @property {Point | null} firstPoint
 * @property {Point | null} secondPoint
 * @property {string | null} rowDirection
 * @property {any[]} createdRows
 * @property {Point | null} [previewPoint]
 * @property {boolean} [isSnapped]
 * @property {number} [previewRowCount]
 * @property {Point | null} [previewCursorPos]
 */

export default function CanvasStage() {
  const canvasRef = useRef(/** @type {HTMLCanvasElement | null} */ (null));
  const animationFrameRef = useRef(/** @type {number | null} */ (null));
  const { state, actions } = useEditor();
  const { screenId } = useParams();
  const { seatTypes, regularSeatTypes, standingSections } =
    useSeatTypes(screenId);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [isDraggingSeats, setIsDraggingSeats] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isSelectionDrag, setIsSelectionDrag] = useState(false);
  const [selectionRect, setSelectionRect] = useState(
    /** @type {Record<string, any> | null} */ (null),
  );
  const [isDrawingRow, setIsDrawingRow] = useState(false);
  const [drawingStart, setDrawingStart] = useState(
    /** @type {Point | null} */ (null),
  );
  const [drawingEnd, setDrawingEnd] = useState(
    /** @type {Point | null} */ (null),
  );
  const [isSnapped, setIsSnapped] = useState(false);
  const [snapType, setSnapType] = useState(
    /** @type {string | null} */ (null),
  ); // 'horizontal', 'vertical', or null
  const [isDrawingElement, setIsDrawingElement] = useState(false);
  const [pathPoints, setPathPoints] = useState(
    /** @type {Point[]} */ ([]),
  );
  const [curveHandles, setCurveHandles] = useState(
    /** @type {Record<string, any>} */ ({}),
  ); // Stores bezier control points for each segment
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);
  const [draggedHandle, setDraggedHandle] = useState(
    /** @type {Record<string, any> | null} */ (null),
  ); // {segmentIndex, handleType: 'cp1' | 'cp2'}
  const [isPathCloseable, setIsPathCloseable] = useState(false); // Track if path can be auto-closed
  const [pathPreviewPoint, setPathPreviewPoint] = useState(
    /** @type {Record<string, any> | null} */ (null),
  ); // Track preview point for path during mouse movement
  const [pathSnapAngle, setPathSnapAngle] = useState(
    /** @type {number | null} */ (null),
  ); // Track snapped angle (0, 90, 180, 270)
  const [pathSnapType, setPathSnapType] = useState(
    /** @type {string | null} */ (null),
  ); // Track snap type: 'angle', 'x-axis', 'y-axis', 'xy-axis'
  const [pathSnapPoints, setPathSnapPoints] = useState(
    /** @type {Record<string, any> | null} */ (null),
  ); // Track points being aligned to: {xSnapPoint, ySnapPoint}
  const [isDragOver, setIsDragOver] = useState(false);
  const [loadedImages, setLoadedImages] = useState(
    /** @type {Map<string, any>} */ (new Map()),
  );
  const [textDragRectangle, setTextDragRectangle] = useState(
    /** @type {Record<string, any> | null} */ (null),
  );
  const [textSnapPosition, setTextSnapPosition] = useState(
    /** @type {Record<string, any> | null} */ (null),
  );
  const [hoveredHandle, setHoveredHandle] = useState(
    /** @type {Record<string, any> | null} */ (null),
  ); // Track hovered handle for cursor
  const [mousePosition, setMousePosition] = useState(
    /** @type {Point | null} */ (null),
  ); // Track mouse position for tool previews
  const [lastCreatedRowStart, setLastCreatedRowStart] = useState(
    /** @type {Point | null} */ (null),
  ); // Track start position of last created row for snapping
  const [isAltPressed, setIsAltPressed] = useState(false); // Track Alt key state for enabling snapping
  const [snapIndicatorPosition, setSnapIndicatorPosition] = useState(
    /** @type {Record<string, any> | null} */ (null),
  ); // Track snap indicator position for visual feedback
  const [editingTextId, setEditingTextId] = useState(
    /** @type {string | null} */ (null),
  ); // Track which text element is being edited
  const [editingTextValue, setEditingTextValue] = useState(""); // Track the edited text value
  const [lastClickTime, setLastClickTime] = useState(0); // Track last click time for double-click detection
  const [lastClickedElement, setLastClickedElement] = useState(
    /** @type {string | null} */ (null),
  ); // Track last clicked element for double-click
  const [extendingPathSegment, setExtendingPathSegment] = useState(
    /** @type {Record<string, any> | null} */ (null),
  ); // Track path segment being extended: {elementId, segmentIndex, endpoint, pointIndex}

  // Multi-row tool state
  const [multiRowState, setMultiRowState] = useState(
    /** @type {MultiRowState} */ ({
      phase: "initial", // 'initial', 'first-click', 'second-click', 'preview-rows'
      firstPoint: null,
      secondPoint: null,
      rowDirection: null, // 'horizontal' or 'vertical'
      createdRows: [],
    }),
  );

  // Track if initial zoom-to-fit has been performed
  const hasInitialFitRef = useRef(false);

  // Measurement tool state
  const [measurementStart, setMeasurementStart] = useState(
    /** @type {Point | null} */ (null),
  );
  const [measurementEnd, setMeasurementEnd] = useState(
    /** @type {Point | null} */ (null),
  );
  const [isMeasuring, setIsMeasuring] = useState(false);

  // Touch/pinch zoom state
  const [lastTouchDistance, setLastTouchDistance] = useState(
    /** @type {number | null} */ (null),
  );

  // Map API seat types to category structure expected by UI (only regular seats)
  // Only compute when seatTypes actually changes (not on every render)
  const categories = useMemo(() => {
    const mapped = regularSeatTypes.map((seatType) => ({
      id: seatType.sst_id.toString(),
      name: seatType.sst_seat_type,
      color: seatType.sst_seat_color_code,
      price: seatType.sst_price || 100, // Use actual price if available
      order: seatType.sst_order,
    }));

    // Sort by order for consistent display
    return mapped.sort((a, b) => a.order - b.order);
  }, [regularSeatTypes]);

  // Create lookup map for O(1) category access during rendering
  const categoryMap = useMemo(() => {
    const map = new Map();
    categories.forEach((cat) => map.set(cat.id, cat));
    return map;
  }, [categories]);
  // Convert screen coordinates to world coordinates
  const screenToWorld = useCallback(
    (screenX, screenY) => {
      // screenX and screenY are already canvas-relative coordinates
      // (canvas offset has been subtracted in the mouse handler)
      const { scale, tx, ty } = state.scene.view;

      return {
        x: (screenX - tx) / scale,
        y: (screenY - ty) / scale,
      };
    },
    [state.scene.view],
  );

  // Convert world coordinates to screen coordinates
  const worldToScreen = useCallback(
    (worldX, worldY) => {
      const { scale, tx, ty } = state.scene.view;
      return {
        x: worldX * scale + tx,
        y: worldY * scale + ty,
      };
    },
    [state.scene.view],
  );

  // Check if a point is near a curve handle (for dragging handles)
  const isNearHandle = useCallback(
    (screenX, screenY, handlePoint) => {
      if (!handlePoint) return false;
      const handleScreen = worldToScreen(handlePoint.x, handlePoint.y);
      const distance = Math.sqrt(
        Math.pow(screenX - handleScreen.x, 2) +
          Math.pow(screenY - handleScreen.y, 2),
      );
      return distance < 15; // 15px tolerance for handle detection (increased from 10px)
    },
    [worldToScreen],
  );

  // Check if mouse is near the first point of the path (for auto-closing)
  const isNearFirstPoint = useCallback(
    (screenX, screenY) => {
      if (!pathPoints || pathPoints.length < 3) return false; // Need at least 3 points to close
      const firstPoint = pathPoints[0];
      const firstPointScreen = worldToScreen(firstPoint.x, firstPoint.y);
      const distance = Math.sqrt(
        Math.pow(screenX - firstPointScreen.x, 2) +
          Math.pow(screenY - firstPointScreen.y, 2),
      );
      return distance < 20; // 20px tolerance for path closing detection
    },
    [pathPoints, worldToScreen],
  );

  // Calculate snapped position for straight path lines (90/180 degree angles) and axis alignment
  const calculatePathSnapPosition = useCallback(
    (currentPoint, lastPoint, allPathPoints = []) => {
      if (!lastPoint || !currentPoint)
        return { point: currentPoint, angle: null, snapType: null };

      const dx = currentPoint.x - lastPoint.x;
      const dy = currentPoint.y - lastPoint.y;

      // First, check for axis alignment with any previous point (X or Y axis snapping)
      const axisSnapThreshold = 5; // world units threshold for axis snapping
      let snappedX = currentPoint.x;
      let snappedY = currentPoint.y;
      let xAxisSnapped = false;
      let yAxisSnapped = false;
      let xSnapPoint = null;
      let ySnapPoint = null;

      // Check all previous points for potential X and Y axis alignment
      for (const point of allPathPoints) {
        // Check for X-axis alignment (same X, different Y)
        if (!xAxisSnapped) {
          const xDiff = Math.abs(currentPoint.x - point.x);
          if (xDiff < axisSnapThreshold) {
            snappedX = point.x;
            xAxisSnapped = true;
            xSnapPoint = point;
          }
        }

        // Check for Y-axis alignment (same Y, different X)
        if (!yAxisSnapped) {
          const yDiff = Math.abs(currentPoint.y - point.y);
          if (yDiff < axisSnapThreshold) {
            snappedY = point.y;
            yAxisSnapped = true;
            ySnapPoint = point;
          }
        }

        // If both axes are snapped, we can stop searching
        if (xAxisSnapped && yAxisSnapped) {
          break;
        }
      }

      // If any axis snapping found, return it with priority
      if (xAxisSnapped || yAxisSnapped) {
        let snapType = null;
        if (xAxisSnapped && yAxisSnapped) {
          snapType = "xy-axis"; // Both axes aligned (corner snap)
        } else if (xAxisSnapped) {
          snapType = "x-axis";
        } else {
          snapType = "y-axis";
        }

        return {
          point: { x: snappedX, y: snappedY },
          angle: null,
          snapType: snapType,
          xSnapPoint: xSnapPoint,
          ySnapPoint: ySnapPoint,
        };
      }

      // Otherwise, check for angle snapping relative to last point
      const angleRad = Math.atan2(dy, dx);
      const angleDeg = (angleRad * 180) / Math.PI;

      // Normalize to 0-360
      const normalizedAngle = (angleDeg + 360) % 360;

      // Define snap angles and threshold
      const snapAngles = [0, 90, 180, 270]; // Right, Down, Left, Up
      const snapThreshold = 2.5; // degrees

      // Find closest snap angle
      let closestAngle = null;
      let minDiff = snapThreshold;

      for (const snapAngle of snapAngles) {
        const diff = Math.min(
          Math.abs(normalizedAngle - snapAngle),
          Math.abs(normalizedAngle - snapAngle - 360),
          Math.abs(normalizedAngle - snapAngle + 360),
        );

        if (diff < minDiff) {
          minDiff = diff;
          closestAngle = snapAngle;
        }
      }

      // If within threshold, snap to the angle
      if (closestAngle !== null) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        const snappedRad = (closestAngle * Math.PI) / 180;

        return {
          point: {
            x: lastPoint.x + Math.cos(snappedRad) * distance,
            y: lastPoint.y + Math.sin(snappedRad) * distance,
          },
          angle: closestAngle,
          snapType: "angle",
        };
      }

      return { point: currentPoint, angle: null, snapType: null };
    },
    [],
  );

  const findSnapPoint = useCallback(
    (worldX, worldY) => {
      const snapTolerance = 15 / state.scene.view.scale;
      let closestPoint = { x: worldX, y: worldY };
      let closestDistance = snapTolerance;

      const checkDistance = (px, py) => {
        const dx = worldX - px;
        const dy = worldY - py;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPoint = { x: px, y: py };
        }
      };

      // Index seats by row once so rotated-row pivots are O(1) (was O(seats^2)
      // because snapping runs over every seat on each drag move).
      const seatsByRow = buildSeatsByRow(state.scene.seats);
      const getRowCentroid = makeRowCentroidGetter(seatsByRow);

      Object.values(state.scene.seats).forEach((seat) => {
        if (!seat.rowId) {
          checkDistance(seat.localX, seat.localY);
        } else {
          const row = state.scene.rows[seat.rowId];
          if (!row) return;
          let seatWorldX = seat.localX;
          let seatWorldY = seat.localY;
          if (row.transform && row.transform.rotation) {
            const { cx: centerX, cy: centerY, count } = getRowCentroid(row.id);
            if (count > 0) {
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
          const section = state.scene.sections[row.sectionId];
          if (section && section.transform) {
            const cos = Math.cos(section.transform.rotation || 0);
            const sin = Math.sin(section.transform.rotation || 0);
            const rotatedX = seatWorldX * cos - seatWorldY * sin;
            const rotatedY = seatWorldX * sin + seatWorldY * cos;
            seatWorldX = rotatedX + section.transform.x;
            seatWorldY = rotatedY + section.transform.y;
          }
          checkDistance(seatWorldX, seatWorldY);
        }
      });

      Object.values(state.scene.elements).forEach((element) => {
        if (element.type === ELEMENT_TYPES.CIRCLE) {
          checkDistance(element.x, element.y);
        } else if (element.type === ELEMENT_TYPES.RECTANGLE) {
          checkDistance(element.x, element.y);
          const halfWidth = element.width / 2;
          const halfHeight = element.height / 2;
          checkDistance(element.x - halfWidth, element.y - halfHeight);
          checkDistance(element.x + halfWidth, element.y - halfHeight);
          checkDistance(element.x - halfWidth, element.y + halfHeight);
          checkDistance(element.x + halfWidth, element.y + halfHeight);
        } else if (element.type === ELEMENT_TYPES.IMAGE) {
          checkDistance(element.x, element.y);
        }
      });

      Object.values(state.scene.rows).forEach((row) => {
        if (row.geometry.kind === "line") {
          checkDistance(row.geometry.p1.x, row.geometry.p1.y);
          checkDistance(row.geometry.p2.x, row.geometry.p2.y);
        } else if (row.geometry.kind === "arc") {
          const { center, radius, startAngle, endAngle } = row.geometry;
          const startX = center.x + radius * Math.cos(startAngle);
          const startY = center.y + radius * Math.sin(startAngle);
          const endX = center.x + radius * Math.cos(endAngle);
          const endY = center.y + radius * Math.sin(endAngle);
          checkDistance(startX, startY);
          checkDistance(endX, endY);
          checkDistance(center.x, center.y);
        }
      });

      return closestPoint;
    },
    [state.scene, ELEMENT_TYPES],
  );

  // Get cursor style for a handle type
  const getCursorForHandle = useCallback((handleType, rotation = 0) => {
    if (handleType === "rotate") return "grab";

    // Calculate effective angle for cursor considering rectangle rotation
    const handleAngles = {
      n: 0,
      ne: 45,
      e: 90,
      se: 135,
      s: 180,
      sw: 225,
      w: 270,
      nw: 315,
    };

    const baseAngle = handleAngles[handleType] || 0;
    const rotationDegrees = (rotation * 180) / Math.PI;
    const effectiveAngle = (baseAngle + rotationDegrees) % 180;

    // Map angles to cursor types (8 directions, but cursors repeat every 180°)
    if (effectiveAngle >= 157.5 || effectiveAngle < 22.5) return "ns-resize";
    if (effectiveAngle >= 22.5 && effectiveAngle < 67.5) return "nesw-resize";
    if (effectiveAngle >= 67.5 && effectiveAngle < 112.5) return "ew-resize";
    if (effectiveAngle >= 112.5 && effectiveAngle < 157.5) return "nwse-resize";

    return "pointer";
  }, []);

  // Check if clicking on a rectangle handle (resize or rotate)
  const getRectangleHandle = useCallback(
    (screenX, screenY, element) => {
      if (!element || element.type !== ELEMENT_TYPES.RECTANGLE) return null;

      const rotation = element.rotation || 0;
      const halfWidth = element.width / 2;
      const halfHeight = element.height / 2;
      const scale = state.scene.view.scale;

      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      const rotatePoint = (px, py) => ({
        x: px * cos - py * sin + element.x,
        y: px * sin + py * cos + element.y,
      });

      // Check rotation handle first (higher priority)
      const rotationHandleDistance = 30 / scale;
      const rotHandle = rotatePoint(0, -halfHeight - rotationHandleDistance);
      const rotHandleScreen = worldToScreen(rotHandle.x, rotHandle.y);
      const rotDist = Math.sqrt(
        Math.pow(screenX - rotHandleScreen.x, 2) +
          Math.pow(screenY - rotHandleScreen.y, 2),
      );
      // Increased hitbox for easier clicking (8px handle + buffer)
      if (rotDist < 15) {
        return { type: "rotate", elementId: element.id, rotation };
      }

      // Check resize handles (corners and edges)
      const handles = [
        { x: -halfWidth, y: -halfHeight, type: "nw" },
        { x: halfWidth, y: -halfHeight, type: "ne" },
        { x: halfWidth, y: halfHeight, type: "se" },
        { x: -halfWidth, y: halfHeight, type: "sw" },
        { x: 0, y: -halfHeight, type: "n" },
        { x: halfWidth, y: 0, type: "e" },
        { x: 0, y: halfHeight, type: "s" },
        { x: -halfWidth, y: 0, type: "w" },
      ];

      for (const handle of handles) {
        const worldPos = rotatePoint(handle.x, handle.y);
        const screenPos = worldToScreen(worldPos.x, worldPos.y);
        const dist = Math.sqrt(
          Math.pow(screenX - screenPos.x, 2) +
            Math.pow(screenY - screenPos.y, 2),
        );
        // Increased hitbox for easier clicking (6px handle + buffer)
        if (dist < 12) {
          return { type: handle.type, elementId: element.id, rotation };
        }
      }

      return null;
    },
    [worldToScreen, state.scene.view.scale],
  );

  const getCircleHandle = useCallback(
    (screenX, screenY, element) => {
      if (!element || element.type !== ELEMENT_TYPES.CIRCLE) return null;

      const radius =
        element.radius || Math.min(element.width, element.height) / 2;

      // Check edge handles (at cardinal directions)
      const handles = [
        { x: 0, y: -radius, type: "n" }, // Top (north)
        { x: radius, y: 0, type: "e" }, // Right (east)
        { x: 0, y: radius, type: "s" }, // Bottom (south)
        { x: -radius, y: 0, type: "w" }, // Left (west)
      ];

      for (const handle of handles) {
        const worldPos = {
          x: element.x + handle.x,
          y: element.y + handle.y,
        };
        const screenPos = worldToScreen(worldPos.x, worldPos.y);
        const dist = Math.sqrt(
          Math.pow(screenX - screenPos.x, 2) +
            Math.pow(screenY - screenPos.y, 2),
        );
        // Increased hitbox for easier clicking (6px handle + buffer)
        if (dist < 12) {
          return { type: handle.type, elementId: element.id };
        }
      }

      return null;
    },
    [worldToScreen],
  );

  const getImageHandle = useCallback(
    (screenX, screenY, element) => {
      if (!element || element.type !== ELEMENT_TYPES.IMAGE) return null;

      const halfWidth = element.width / 2;
      const halfHeight = element.height / 2;

      // Check corner handles for proportional scaling
      const corners = [
        { x: -halfWidth, y: -halfHeight, type: "nw" },
        { x: halfWidth, y: -halfHeight, type: "ne" },
        { x: halfWidth, y: halfHeight, type: "se" },
        { x: -halfWidth, y: halfHeight, type: "sw" },
      ];

      for (const handle of corners) {
        const worldPos = {
          x: element.x + handle.x,
          y: element.y + handle.y,
        };
        const screenPos = worldToScreen(worldPos.x, worldPos.y);
        const dist = Math.sqrt(
          Math.pow(screenX - screenPos.x, 2) +
            Math.pow(screenY - screenPos.y, 2),
        );
        // Increased hitbox for easier clicking (6px handle + buffer)
        if (dist < 12) {
          return { type: handle.type, elementId: element.id };
        }
      }

      return null;
    },
    [worldToScreen],
  );

  // Check if clicking on a row rotation handle
  const getRowHandle = useCallback(
    (screenX, screenY, row, rowSeats) => {
      if (!row || !rowSeats || rowSeats.length === 0) return null;

      // Calculate row center and bounding box from seats
      const seatPositions = rowSeats.map((seat) => ({
        x: seat.localX,
        y: seat.localY,
      }));

      const minX = Math.min(...seatPositions.map((p) => p.x));
      const maxX = Math.max(...seatPositions.map((p) => p.x));
      const minY = Math.min(...seatPositions.map((p) => p.y));
      const maxY = Math.max(...seatPositions.map((p) => p.y));

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const height = maxY - minY;

      const rotation = row.transform?.rotation || 0;
      const scale = state.scene.view.scale;

      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      // Calculate rotation handle position (30 pixels above the row)
      const rotationHandleDistance = 30 / scale;
      const halfHeight = Math.max(height / 2, 15);

      const rotHandleLocal = {
        x: 0,
        y: -halfHeight - rotationHandleDistance,
      };

      const rotHandleWorld = {
        x: rotHandleLocal.x * cos - rotHandleLocal.y * sin + centerX,
        y: rotHandleLocal.x * sin + rotHandleLocal.y * cos + centerY,
      };

      const rotHandleScreen = worldToScreen(rotHandleWorld.x, rotHandleWorld.y);
      const dist = Math.sqrt(
        Math.pow(screenX - rotHandleScreen.x, 2) +
          Math.pow(screenY - rotHandleScreen.y, 2),
      );

      // Increased hitbox for easier clicking (8px handle + buffer)
      if (dist < 15) {
        return {
          handleType: "rotate",
          rowId: row.id,
          centerX,
          centerY,
          rotation,
        };
      }

      return null;
    },
    [worldToScreen, state.scene.view.scale],
  );

  const getMultiSelectionHandle = useCallback(
    (screenX, screenY) => {
      const { seats, rows, sections } = state.scene;
      // Index seats by row once so rotated-row pivots are O(1).
      const seatsByRow = buildSeatsByRow(seats);
      const getRowCentroid = makeRowCentroidGetter(seatsByRow);
      const selectedSeatsList = state.selectedIds
        .map((id) => seats[id])
        .filter(Boolean);

      if (selectedSeatsList.length < 2) return null;

      const selectedRowIds = new Set();
      selectedSeatsList.forEach((seat) => {
        if (seat.rowId) {
          selectedRowIds.add(seat.rowId);
        }
      });

      // Check if we should show multi-selection handle
      let showMultiSelectionHandle = false;

      if (selectedSeatsList.length > 1) {
        if (selectedRowIds.size === 1) {
          const rowId = Array.from(selectedRowIds)[0];
          const row = rows[rowId];
          if (row) {
            const rowSeats = Object.values(seats).filter(
              (s) => s.rowId === rowId,
            );
            const allSeatsSelected = rowSeats.every((s) =>
              state.selectedIds.includes(s.id),
            );
            if (!allSeatsSelected) {
              showMultiSelectionHandle = true;
            }
          } else {
            showMultiSelectionHandle = true;
          }
        } else {
          showMultiSelectionHandle = true;
        }
      }

      if (!showMultiSelectionHandle) return null;

      const allPositions = [];

      selectedSeatsList.forEach((seat) => {
        let worldX = seat.localX;
        let worldY = seat.localY;

        if (seat.rowId) {
          const row = rows[seat.rowId];
          if (row && row.transform && row.transform.rotation) {
            const { cx: centerX, cy: centerY, count } = getRowCentroid(row.id);
            if (count > 0) {
              const cos = Math.cos(row.transform.rotation);
              const sin = Math.sin(row.transform.rotation);
              const relativeX = worldX - centerX;
              const relativeY = worldY - centerY;
              const rotatedX = relativeX * cos - relativeY * sin;
              const rotatedY = relativeX * sin + relativeY * cos;
              worldX = rotatedX + centerX;
              worldY = rotatedY + centerY;
            }
          }
          if (row) {
            const section = sections[row.sectionId];
            if (section && section.transform) {
              const cos = Math.cos(section.transform.rotation || 0);
              const sin = Math.sin(section.transform.rotation || 0);
              const rotatedX = worldX * cos - worldY * sin;
              const rotatedY = worldX * sin + worldY * cos;
              worldX = rotatedX + section.transform.x;
              worldY = rotatedY + section.transform.y;
            }
          }
        }

        allPositions.push({ x: worldX, y: worldY });
      });

      if (allPositions.length === 0) return null;

      const minX = Math.min(...allPositions.map((p) => p.x));
      const maxX = Math.max(...allPositions.map((p) => p.x));
      const minY = Math.min(...allPositions.map((p) => p.y));
      const maxY = Math.max(...allPositions.map((p) => p.y));

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      const height = maxY - minY;

      const rotationHandleDistance = 30;
      const halfHeight = Math.max(height / 2, 15);
      const scale = state.scene.view.scale;

      const currentRotation = 0;
      const cos = Math.cos(currentRotation);
      const sin = Math.sin(currentRotation);

      const rotHandleLocal = {
        x: 0,
        y: -halfHeight - rotationHandleDistance / scale,
      };

      const rotHandleWorld = {
        x: rotHandleLocal.x * cos - rotHandleLocal.y * sin + centerX,
        y: rotHandleLocal.x * sin + rotHandleLocal.y * cos + centerY,
      };

      const rotHandleScreen = worldToScreen(rotHandleWorld.x, rotHandleWorld.y);
      const dist = Math.sqrt(
        Math.pow(screenX - rotHandleScreen.x, 2) +
          Math.pow(screenY - rotHandleScreen.y, 2),
      );

      if (dist < 15) {
        const worldPos = screenToWorld(screenX, screenY);
        const dx = worldPos.x - centerX;
        const dy = worldPos.y - centerY;
        const angle = Math.atan2(dy, dx);
        const initialRotation = angle + Math.PI / 2;

        return {
          handleType: "rotate",
          isMultiSelection: true,
          centerX,
          centerY,
          initialRotation: initialRotation,
          lastRotation: initialRotation,
        };
      }

      return null;
    },
    [
      worldToScreen,
      screenToWorld,
      state.scene.view.scale,
      state.selectedIds,
      state.scene.seats,
      state.scene.rows,
      state.scene.sections,
    ],
  );

  // Find seat columns and Y position in nearby rows for column alignment snapping
  // Works bidirectionally - finds rows both above and below cursor
  const findNearbyRowInfo = useCallback(
    (cursorY, cursorX) => {
      // Find all rows and their Y positions
      const rowsByY = new Map(); // Y position -> array of seat X positions
      const rowYTolerance = 15; // pixels to consider seats as same row

      Object.values(state.scene.seats).forEach((seat) => {
        // Round Y to group seats into rows
        const rowY = Math.round(seat.localY / rowYTolerance) * rowYTolerance;

        if (!rowsByY.has(rowY)) {
          rowsByY.set(rowY, { columns: [], actualYPositions: [] });
        }
        rowsByY.get(rowY).columns.push(seat.localX);
        rowsByY.get(rowY).actualYPositions.push(seat.localY);
      });

      // Find the closest row to cursor, prioritizing rows with seats near cursor X position
      let closestRowY = /** @type {number | null} */ (null);
      let closestRowData = /** @type {any} */ (null);
      let closestDistance = Infinity;
      const maxRowDistance = 100; // Maximum distance to look for nearby rows
      const xAlignmentBonus = 50; // Bonus distance for rows with seats near cursor X

      rowsByY.forEach((rowData) => {
        // Calculate actual average Y position for this row
        const avgY =
          rowData.actualYPositions.reduce((sum, y) => sum + y, 0) /
          rowData.actualYPositions.length;
        const yDistance = Math.abs(avgY - cursorY);
        if (yDistance >= maxRowDistance) return;

        // Check if this row has any seats near the cursor's X position
        const hasNearbyColumn = rowData.columns.some((colX) => {
          return Math.abs(colX - cursorX) < 50; // Within 50 pixels horizontally
        });

        // Apply bonus to distance calculation if row has nearby columns
        // This makes rows directly above/below the cursor preferred
        const effectiveDistance = hasNearbyColumn
          ? yDistance
          : yDistance + xAlignmentBonus;

        if (effectiveDistance < closestDistance) {
          closestDistance = effectiveDistance;
          closestRowY = avgY; // Use actual average Y, not rounded grouping key
          closestRowData = rowData;
        }
      });

      // If we found a nearby row, return its columns and Y position
      if (closestRowY !== null && closestRowData) {
        return {
          columns: [...new Set(closestRowData.columns)].sort((a, b) => a - b),
          rowY: closestRowY,
          hasRow: true,
        };
      }

      // Fallback: use last created row if available
      if (lastCreatedRowStart) {
        const seatColumns = [];
        Object.values(state.scene.seats).forEach((seat) => {
          const yDistance = Math.abs(seat.localY - lastCreatedRowStart.y);
          if (yDistance < rowYTolerance) {
            seatColumns.push(seat.localX);
          }
        });
        return {
          columns: [...new Set(seatColumns)].sort((a, b) => a - b),
          rowY: lastCreatedRowStart.y,
          hasRow: true,
        };
      }

      return { columns: [], rowY: null, hasRow: false };
    },
    [lastCreatedRowStart, state.scene.seats],
  );

  // Calculate snap effect for row drawing
  const calculateSnap = useCallback((start, end) => {
    if (!start || !end)
      return { snappedEnd: end, isSnapped: false, snapType: null };

    const dx = end.x - start.x;
    const dy = end.y - start.y;

    // Calculate angle in radians
    const angle = Math.atan2(dy, dx);
    const angleDegrees = (angle * 180) / Math.PI;

    // Normalize angle to 0-360 degrees
    const normalizedAngle = ((angleDegrees % 360) + 360) % 360;

    // Define tolerance for snap detection (±2.5 degrees)
    const tolerance = 2.5;

    let snappedEnd = end;
    let isSnapped = false;
    let snapType = null;

    // Check for horizontal snap (0° or 180°)
    if (
      Math.abs(normalizedAngle - 0) <= tolerance ||
      Math.abs(normalizedAngle - 180) <= tolerance
    ) {
      snappedEnd = { x: end.x, y: start.y };
      isSnapped = true;
      snapType = "horizontal";
    }
    // Check for vertical snap (90° or 270°)
    else if (
      Math.abs(normalizedAngle - 90) <= tolerance ||
      Math.abs(normalizedAngle - 270) <= tolerance
    ) {
      snappedEnd = { x: start.x, y: end.y };
      isSnapped = true;
      snapType = "vertical";
    }

    return { snappedEnd, isSnapped, snapType };
  }, []);

  // Render grid background
  const renderGrid = useCallback(
    (ctx, canvas) => {
      renderGridUtil(ctx, canvas, state, screenToWorld);
    },
    [state.isGridVisible, state.scene.view, screenToWorld],
  );

  // Render seats
  const renderSeats = useCallback(
    (ctx) => {
      renderSeatsUtil(
        ctx,
        state,
        isDraggingSeats,
        dragOffset,
        worldToScreen,
        categoryMap,
        isSnapped,
        /** @type {any} */ (snapType),
        isDraggingHandle,
        draggedHandle,
      );
    },
    [
      state.scene,
      state.selectedIds,
      isDraggingSeats,
      dragOffset,
      worldToScreen,
      categoryMap,
      isSnapped,
      snapType,
      isDraggingHandle,
      draggedHandle,
    ],
  );

  const loadImage = useCallback(
    (src) => {
      if (loadedImages.has(src)) {
        return loadedImages.get(src);
      }

      const img = new Image();
      img.onload = () => {
        setLoadedImages((prev) => {
          const newMap = new Map(prev);
          newMap.set(src, img);
          return newMap;
        });
      };
      img.src = src;
      return null;
    },
    [loadedImages],
  );
  // Render non-text elements (circles, rectangles, paths)
  const renderElements = useCallback(
    (ctx) => {
      renderElementsUtil(
        ctx,
        state,
        isDraggingSeats,
        dragOffset,
        worldToScreen,
        ELEMENT_TYPES,
        isDraggingHandle,
        draggedHandle,
        loadedImages,
        loadImage,
      );
    },
    [
      state.scene.elements,
      state.scene.view.scale,
      state.selectedIds,
      isDraggingSeats,
      dragOffset,
      worldToScreen,
      isDraggingHandle,
      draggedHandle,
      loadedImages,
      loadImage,
    ],
  );

  // Render seating sections (after seats for proper z-ordering)
  const renderSeatingSections = useCallback(
    (ctx) => {
      renderSeatingSectionsUtil(
        ctx,
        state,
        isDraggingSeats,
        dragOffset,
        worldToScreen,
        ELEMENT_TYPES,
        loadedImages,
        loadImage,
      );
    },
    [
      state.scene.elements,
      state.scene.view.scale,
      state.selectedIds,
      state.currentTool,
      state.toolSettings,
      isDraggingSeats,
      dragOffset,
      worldToScreen,
      loadedImages,
      loadImage,
    ],
  );

  // Render boundary elements (always on top of seats)
  const renderBoundaries = useCallback(
    (ctx) => {
      renderBoundariesUtil(
        ctx,
        state,
        isDraggingSeats,
        dragOffset,
        worldToScreen,
        ELEMENT_TYPES,
        isDraggingHandle,
        draggedHandle,
      );
    },
    [
      state.scene.elements,
      state.scene.view.scale,
      state.selectedIds,
      isDraggingSeats,
      dragOffset,
      worldToScreen,
      isDraggingHandle,
      draggedHandle,
    ],
  );

  // Render section boundaries with zoom-based display
  const renderSectionBoundaries = useCallback(
    (ctx) => {
      // Create category map for section boundaries
      const categoryMap = new Map();
      if (state.scene.venue?.categories) {
        state.scene.venue.categories.forEach((category) => {
          categoryMap.set(category.id, category);
        });
      }

      renderSectionBoundariesUtil(
        ctx,
        state,
        isDraggingSeats,
        dragOffset,
        worldToScreen,
        ELEMENT_TYPES,
        categoryMap,
      );
    },
    [
      state.scene.elements,
      state.scene.view.scale,
      state.scene.venue?.categories,
      state.selectedIds,
      isDraggingSeats,
      dragOffset,
      worldToScreen,
    ],
  );

  // Render text elements (always on top)
  const renderTextElements = useCallback(
    (ctx) => {
      renderTextElementsUtil(
        ctx,
        state,
        isDraggingSeats,
        dragOffset,
        worldToScreen,
        ELEMENT_TYPES,
        /** @type {any} */ (textSnapPosition),
        isDraggingHandle,
        draggedHandle,
      );
    },
    [
      state.scene.elements,
      state.scene.view.scale,
      state.selectedIds,
      isDraggingSeats,
      dragOffset,
      worldToScreen,
      textSnapPosition,
      isDraggingHandle,
      draggedHandle,
    ],
  );

  // Load image and cache it

  // Render image elements
  const renderImageElements = useCallback(
    (ctx) => {
      renderImageElementsUtil(
        ctx,
        state,
        isDraggingSeats,
        dragOffset,
        worldToScreen,
        loadedImages,
        loadImage,
        ELEMENT_TYPES,
        isDraggingHandle,
        /** @type {any} */ (draggedHandle),
      );
    },
    [
      state.scene.elements,
      state.scene.view.scale,
      state.selectedIds,
      isDraggingSeats,
      dragOffset,
      worldToScreen,
      loadedImages,
      loadImage,
      isDraggingHandle,
      draggedHandle,
    ],
  );

  // Render rows (guide lines)
  const renderRows = useCallback(
    (ctx) => {
      renderRowsUtil(ctx, state, worldToScreen);
    },
    [state.scene, state.selectedIds, worldToScreen],
  );

  // Render selection rectangle
  const renderSelectionRect = useCallback(
    (ctx) => {
      renderSelectionRectUtil(ctx, selectionRect);
    },
    [selectionRect],
  );

  // Render drawing preview for row tools and path drawing
  const renderDrawingPreview = useCallback(
    (ctx) => {
      const toolSettings = state.toolSettings[state.currentTool] || {};

      // Multi-row preview rendering
      if (state.currentTool === "multi-row") {
        ctx.save();

        // Phase 1: Show first point with crosshair and preview row with seats
        if (multiRowState.phase === "first-click" && multiRowState.firstPoint) {
          const p1World = multiRowState.firstPoint;
          const p1 = worldToScreen(p1World.x, p1World.y);

          // Get settings for seat preview
          const seatWidth =
            toolSettings.seatWidth || state.globalSettings?.seatWidth || 20;
          const seatHeight =
            toolSettings.seatHeight || state.globalSettings?.seatHeight || 20;
          const seatSpacing =
            toolSettings.seatSpacing ||
            state.globalSettings?.seatSpacing ||
            7.0;
          const categoryId =
            toolSettings.categoryId ||
            state.scene.venue?.categories?.[0]?.id ||
            "default";

          // Get category color
          const category = categoryMap.get(categoryId);
          const seatColor = category?.color || "#cccccc";

          // Draw crosshair at first point
          ctx.strokeStyle = "#3b82f6";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(p1.x - 15, p1.y);
          ctx.lineTo(p1.x + 15, p1.y);
          ctx.moveTo(p1.x, p1.y - 15);
          ctx.lineTo(p1.x, p1.y + 15);
          ctx.stroke();

          // Draw circle at first point
          ctx.setLineDash([]);
          ctx.fillStyle = "#3b82f6";
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(p1.x, p1.y, 6, 0, 2 * Math.PI);
          ctx.fill();

          // Draw line preview to cursor with seats if we have mouse position
          if (mousePosition) {
            // Use snapped position if available, otherwise use raw mouse position
            const p2World = multiRowState.previewPoint || mousePosition;
            const p2 = worldToScreen(p2World.x, p2World.y);
            const isSnapped = multiRowState.isSnapped || false;

            // Draw dashed line - highlight when snapped
            ctx.globalAlpha = isSnapped ? 0.6 : 0.4;
            ctx.strokeStyle = isSnapped ? "#3b82f6" : "#8d6fbf";
            ctx.lineWidth = isSnapped ? 3 : 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Draw snap indicator if snapped
            if (isSnapped) {
              // Determine if it's horizontal or vertical snap
              const dx = Math.abs(p2World.x - p1World.x);
              const dy = Math.abs(p2World.y - p1World.y);
              const isHorizontal = dx > dy;

              ctx.globalAlpha = 0.5;
              ctx.strokeStyle = "#3b82f6";
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);

              // Draw guide line across the canvas
              if (isHorizontal) {
                ctx.beginPath();
                ctx.moveTo(0, p1.y);
                ctx.lineTo(ctx.canvas.width, p1.y);
                ctx.stroke();
              } else {
                ctx.beginPath();
                ctx.moveTo(p1.x, 0);
                ctx.lineTo(p1.x, ctx.canvas.height);
                ctx.stroke();
              }
            }

            // Calculate seat count for preview
            const distance = Math.sqrt(
              Math.pow(p2World.x - p1World.x, 2) +
                Math.pow(p2World.y - p1World.y, 2),
            );
            const seatCount = Math.max(
              1,
              Math.floor((distance - seatWidth) / (seatWidth + seatSpacing)) +
                1,
            );

            // Draw preview seats along the line
            ctx.setLineDash([]);
            for (let j = 0; j < seatCount; j++) {
              const t = j / Math.max(1, seatCount - 1);
              const seatWorldX = p1World.x + t * (p2World.x - p1World.x);
              const seatWorldY = p1World.y + t * (p2World.y - p1World.y);
              const seatPos = worldToScreen(seatWorldX, seatWorldY);

              // Draw seat
              ctx.globalAlpha = 0.5;
              ctx.fillStyle = seatColor;
              ctx.strokeStyle = "#8d6fbf";
              ctx.lineWidth = 1;

              const seatWidthScreen = seatWidth * state.scene.view.scale;
              const seatHeightScreen = seatHeight * state.scene.view.scale;
              const radius = Math.min(
                seatWidthScreen / 2,
                seatHeightScreen / 2,
              );

              ctx.beginPath();
              ctx.roundRect(
                seatPos.x - seatWidthScreen / 2,
                seatPos.y - seatHeightScreen / 2,
                seatWidthScreen,
                seatHeightScreen,
                radius,
              );
              ctx.fill();
              ctx.stroke();
            }

            // Draw seat count indicator
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = "#8d6fbf";
            ctx.font = "bold 12px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${seatCount} seats`, p2.x, p2.y - 20);
          }
        }

        // Phase 2: Show preview rows below the first row
        if (
          multiRowState.phase === "second-click" &&
          (multiRowState.previewRowCount ?? 0) > 0 &&
          multiRowState.firstPoint &&
          multiRowState.secondPoint
        ) {
          const firstPoint = multiRowState.firstPoint;
          const secondPoint = multiRowState.secondPoint;
          const previewRowCount = multiRowState.previewRowCount ?? 0;
          const rowSpacing = toolSettings.rowSpacing || 30;
          const seatWidth =
            toolSettings.seatWidth || state.globalSettings?.seatWidth || 20;
          const seatHeight =
            toolSettings.seatHeight || state.globalSettings?.seatHeight || 20;
          const seatSpacing =
            toolSettings.seatSpacing ||
            state.globalSettings?.seatSpacing ||
            7.0;
          const categoryId =
            toolSettings.categoryId ||
            state.scene.venue?.categories?.[0]?.id ||
            "default";

          // Get category color
          const category = categoryMap.get(categoryId);
          const seatColor = category?.color || "#cccccc";

          // Calculate seat count from the first row
          const distance = Math.sqrt(
            Math.pow(
              secondPoint.x - firstPoint.x,
              2,
            ) +
              Math.pow(
                secondPoint.y - firstPoint.y,
                2,
              ),
          );
          const seatCount = Math.max(
            1,
            Math.floor((distance - seatWidth) / (seatWidth + seatSpacing)) + 1,
          );

          // Draw preview rows with seats
          for (let i = 1; i <= previewRowCount; i++) {
            const yOffset = i * rowSpacing;
            const p1World = {
              x: firstPoint.x,
              y: firstPoint.y + yOffset,
            };
            const p2World = {
              x: secondPoint.x,
              y: secondPoint.y + yOffset,
            };

            // Draw row line
            const p1 = worldToScreen(p1World.x, p1World.y);
            const p2 = worldToScreen(p2World.x, p2World.y);

            ctx.globalAlpha = 0.3;
            ctx.strokeStyle = "#3b82f6";
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            // Draw seats along the row
            ctx.setLineDash([]);

            // Calculate seat positions along the row
            for (let j = 0; j < seatCount; j++) {
              const t = j / Math.max(1, seatCount - 1);
              const seatWorldX = p1World.x + t * (p2World.x - p1World.x);
              const seatWorldY = p1World.y + t * (p2World.y - p1World.y);
              const seatPos = worldToScreen(seatWorldX, seatWorldY);

              // Draw seat
              ctx.globalAlpha = 0.5;
              ctx.fillStyle = seatColor;
              ctx.strokeStyle = "#3b82f6";
              ctx.lineWidth = 1;

              const seatWidthScreen = seatWidth * state.scene.view.scale;
              const seatHeightScreen = seatHeight * state.scene.view.scale;
              const radius = Math.min(
                seatWidthScreen / 2,
                seatHeightScreen / 2,
              );

              ctx.beginPath();
              ctx.roundRect(
                seatPos.x - seatWidthScreen / 2,
                seatPos.y - seatHeightScreen / 2,
                seatWidthScreen,
                seatHeightScreen,
                radius,
              );
              ctx.fill();
              ctx.stroke();
            }
          }

          // Draw row count indicator
          if (mousePosition) {
            const cursorPos = worldToScreen(mousePosition.x, mousePosition.y);
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = "#3b82f6";
            ctx.font = "bold 14px Arial";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
              `${previewRowCount + 1} rows × ${seatCount} seats`,
              cursorPos.x + 60,
              cursorPos.y,
            );
          }
        }

        ctx.restore();
      }

      renderDrawingPreviewUtil(
        ctx,
        state,
        isDrawingRow,
        isDrawingElement,
        pathPoints,
        curveHandles,
        drawingStart,
        drawingEnd,
        worldToScreen,
        isSnapped,
        snapType,
        isDraggingHandle,
        draggedHandle,
        isPathCloseable,
        pathPreviewPoint,
        pathSnapAngle,
        pathSnapType,
        pathSnapPoints,
      );
    },
    [
      isDrawingRow,
      isDrawingElement,
      pathPoints,
      curveHandles,
      drawingStart,
      drawingEnd,
      worldToScreen,
      state.currentTool,
      state.toolSettings,
      state.scene.view.scale,
      state.globalSettings,
      state.scene.venue.categories,
      isSnapped,
      snapType,
      isDraggingHandle,
      isPathCloseable,
      draggedHandle,
      pathPreviewPoint,
      pathSnapAngle,
      pathSnapType,
      pathSnapPoints,
      multiRowState,
      mousePosition,
      categoryMap,
    ],
  );

  // Render rectangle grid when dragging text inside rectangles
  const renderTextGrid = useCallback(
    (ctx) => {
      if (textDragRectangle) {
        renderRectangleGrid(
          ctx,
          textDragRectangle,
          worldToScreen,
          state.scene.view.scale,
          20,
        );
      }
    },
    [textDragRectangle, worldToScreen, state.scene.view.scale],
  );

  // Render snap indicators for visual feedback
  const renderSnapIndicators = useCallback(
    (ctx) => {
      if (!snapIndicatorPosition) return;

      const screenPos = worldToScreen(
        snapIndicatorPosition.x,
        snapIndicatorPosition.y,
      );

      ctx.save();
      ctx.strokeStyle = "#3b82f6"; // Blue color for snap indicator
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6;

      // Draw crosshair at snap position
      const crossSize = 20;
      ctx.beginPath();
      ctx.moveTo(screenPos.x - crossSize, screenPos.y);
      ctx.lineTo(screenPos.x + crossSize, screenPos.y);
      ctx.moveTo(screenPos.x, screenPos.y - crossSize);
      ctx.lineTo(screenPos.x, screenPos.y + crossSize);
      ctx.stroke();

      // Draw circle around snap point
      ctx.beginPath();
      ctx.arc(screenPos.x, screenPos.y, 15, 0, 2 * Math.PI);
      ctx.stroke();

      // Draw vertical alignment line if snapping to column
      if (snapIndicatorPosition.type === "column") {
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;

        const canvas = ctx.canvas;
        ctx.beginPath();
        ctx.moveTo(screenPos.x, 0);
        ctx.lineTo(screenPos.x, canvas.height);
        ctx.stroke();

        ctx.setLineDash([]);
      }

      ctx.restore();
    },
    [snapIndicatorPosition, worldToScreen],
  );

  // Render tool preview when hovering with an active tool
  const renderToolPreview = useCallback(
    (ctx) => {
      // For row tools and seat tool, show preview until user actually drags
      // Check if we've started drawing but haven't moved significantly yet
      const hasDrawnSignificantly =
        isDrawingRow &&
        drawingStart &&
        drawingEnd &&
        (Math.abs(drawingEnd.x - drawingStart.x) > 5 ||
          Math.abs(drawingEnd.y - drawingStart.y) > 5);

      // Only show preview when not actively drawing/dragging
      // For row-line, row-arc, and seat tools: show preview until significant movement
      if (isDragging || isDraggingSeats || isDrawingElement) {
        return;
      }

      // For row tools, only hide preview after significant drag movement
      if (isDrawingRow && hasDrawnSignificantly) {
        return;
      }

      // Apply snapping to preview position for row tools (magnetic snap when nearby) - only when Alt is pressed
      let previewPosition = mousePosition;
      if (
        mousePosition &&
        isAltPressed &&
        (state.currentTool === "row-line" || state.currentTool === "row-arc")
      ) {
        const seatSpacing = state.globalSettings.seatSpacing || 7.0;
        const seatHeight = state.globalSettings.seatHeight || 20;
        // Row vertical spacing: full seat height + spacing between rows
        // This is center-to-center distance between adjacent rows
        const rowVerticalSpacing = seatHeight + seatSpacing;

        // Find nearby row info (bidirectional - above or below cursor)
        const nearbyRowInfo = findNearbyRowInfo(
          mousePosition.y,
          mousePosition.x,
        );

        if (nearbyRowInfo.hasRow && nearbyRowInfo.rowY != null) {
          // Calculate Y position: offset from detected row (above or below)
          const direction = mousePosition.y < nearbyRowInfo.rowY ? -1 : 1;
          const snapY = nearbyRowInfo.rowY + direction * rowVerticalSpacing;

          // Start with first column or last created row X
          let snapX =
            lastCreatedRowStart?.x ||
            nearbyRowInfo.columns[0] ||
            mousePosition.x;

          // Column alignment: Check if cursor is near any seat column from nearby row
          const columnSnapTolerance = 25; // pixels for column alignment

          if (nearbyRowInfo.columns.length > 0) {
            // Find nearest column to cursor X position
            let nearestColumn = null;
            let nearestDistance = columnSnapTolerance;

            nearbyRowInfo.columns.forEach((columnX) => {
              const distance = Math.abs(mousePosition.x - columnX);
              if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestColumn = columnX;
              }
            });

            // If we found a nearby column, snap to it
            if (nearestColumn !== null) {
              snapX = nearestColumn;
            }
          }

          // Define snap tolerance (how close you need to be to trigger snap)
          const snapTolerance = 30; // pixels in world coordinates

          // Calculate distance from ideal position
          const distanceX = Math.abs(mousePosition.x - snapX);
          const distanceY = Math.abs(mousePosition.y - snapY);

          // Snap only if within tolerance on both axes
          if (distanceX < snapTolerance && distanceY < snapTolerance) {
            previewPosition = { x: snapX, y: snapY };
            setSnapIndicatorPosition({ x: snapX, y: snapY, type: "column" });
          } else {
            setSnapIndicatorPosition(null);
          }
        } else {
          setSnapIndicatorPosition(null);
        }
      } else {
        setSnapIndicatorPosition(null);
      }

      renderToolPreviewUtil(
        ctx,
        state,
        previewPosition,
        worldToScreen,
        ELEMENT_TYPES,
        categoryMap,
      );
    },
    [
      mousePosition,
      state.currentTool,
      state.toolSettings,
      state.scene.view.scale,
      state.globalSettings,
      worldToScreen,
      categoryMap,
      isDragging,
      isDraggingSeats,
      isDrawingRow,
      isDrawingElement,
      drawingStart,
      drawingEnd,
      isAltPressed,
      lastCreatedRowStart,
      findNearbyRowInfo,
    ],
  );

  // Main render function
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size accounting for device pixel ratio
    const rect = canvas.getBoundingClientRect();
    const displayWidth = rect.width;
    const displayHeight = rect.height;

    // Set the actual canvas size in memory (scaled for high-DPI displays)
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    // Scale the canvas style back down to the desired CSS size
    canvas.style.width = displayWidth + "px";
    canvas.style.height = displayHeight + "px";

    // Scale the drawing context so everything we draw will be scaled
    ctx.scale(dpr, dpr);

    // Clear the entire canvas
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // Render layers
    renderGrid(ctx, { width: displayWidth, height: displayHeight });
    renderImageElements(ctx); // Images first as background reference
    renderRows(ctx);
    renderElements(ctx);
    renderSeats(ctx);
    renderSeatingSections(ctx); // Seating sections render on top of seats
    renderSectionBoundaries(ctx); // Section boundaries with zoom-based display
    renderBoundaries(ctx); // Regular boundaries render on top of seats
    renderMeasurementUtil(
      ctx,
      measurementStart,
      measurementEnd,
      worldToScreen,
      state.scene.view.scale,
    );
    renderSelectionRect(ctx);
    renderDrawingPreview(ctx);
    renderTextGrid(ctx); // Rectangle grid for text dragging
    renderTextElements(ctx); // Text elements always on top
    renderSnapIndicators(ctx); // Snap indicators for visual feedback
    renderToolPreview(ctx); // Tool preview on top of everything
  }, [
    renderGrid,
    renderImageElements,
    renderRows,
    renderElements,
    renderSeats,
    renderSeatingSections,
    renderSectionBoundaries,
    renderBoundaries,
    measurementStart,
    measurementEnd,
    worldToScreen,
    state.scene.view.scale,
    renderSelectionRect,
    renderDrawingPreview,
    renderTextGrid,
    renderTextElements,
    renderSnapIndicators,
    renderToolPreview,
  ]);

  // Hit testing for elements
  const hitTestElement = useCallback(
    (worldX, worldY) => {
      return hitTestElementUtil(worldX, worldY, state, ELEMENT_TYPES);
    },
    [state.scene.elements],
  );

  // Hit testing for seats
  const hitTestSeat = useCallback(
    (worldX, worldY) => {
      return hitTestSeatUtil(worldX, worldY, state);
    },
    [state.scene],
  );

  // Hit testing for rows (guide lines)
  const hitTestRow = useCallback(
    (worldX, worldY) => {
      return hitTestRowUtil(worldX, worldY, state);
    },
    [state.scene],
  );

  // Get seats and elements within selection rectangle
  const getItemsInRect = useCallback(
    (startX, startY, endX, endY) => {
      return getItemsInRectUtil(startX, startY, endX, endY, state);
    },
    [state.scene],
  );

  // Handle mouse events
  const handleMouseDown = useMouseDown({
    canvasRef,
    state,
    actions,
    categories,
    // State setters
    setIsDragging,
    setDragStart,
    setLastPanPoint,
    setIsDraggingSeats,
    setDragOffset,
    setIsSelectionDrag,
    setSelectionRect,
    setIsDrawingRow,
    setDrawingStart,
    setDrawingEnd,
    setIsAltPressed,
    setIsDraggingHandle,
    setDraggedHandle,
    setIsDrawingElement,
    setPathPoints,
    setCurveHandles,
    setIsPathCloseable,
    setEditingTextId,
    setEditingTextValue,
    setLastClickTime,
    setLastClickedElement,
    setMultiRowState,
    setMeasurementStart,
    setMeasurementEnd,
    setIsMeasuring,
    setExtendingPathSegment,
    // Utility functions
    screenToWorld,
    getRectangleHandle,
    getCircleHandle,
    getImageHandle,
    getRowHandle,
    getMultiSelectionHandle,
    hitTestElement,
    hitTestSeat,
    hitTestRow,
    hitTestBoundary,
    hitTestPathSegment,
    isNearHandle,
    isNearFirstPoint,
    findNearbyRowInfo,
    calculatePathSnapPosition,
    findSnapPoint,
    // Other dependencies
    lastCreatedRowStart,
    isDrawingElement,
    pathPoints,
    curveHandles,
    lastClickTime,
    lastClickedElement,
    multiRowState,
    measurementStart,
    measurementEnd,
    isMeasuring,
    extendingPathSegment,
  });

  const handleMouseMove = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Update mouse position for tool previews (world coordinates)
      const worldPos = screenToWorld(x, y);
      setMousePosition(worldPos);

      if (isMeasuring && measurementStart) {
        const snappedPoint = findSnapPoint(worldPos.x, worldPos.y);
        setMeasurementEnd(snappedPoint);
      }

      // Check for hovered handles when not dragging (for cursor feedback)
      if (
        !isDragging &&
        !isDraggingSeats &&
        !isSelectionDrag &&
        !isDraggingHandle &&
        state.currentTool === "select"
      ) {
        // Check if hovering over a rectangle handle
        const selectedElements = state.selectedIds
          .map((id) => state.scene.elements[id])
          .filter((el) => el && el.type === ELEMENT_TYPES.RECTANGLE);

        let foundHandle = null;
        for (const element of selectedElements) {
          const handle = getRectangleHandle(x, y, element);
          if (handle) {
            foundHandle = handle;
            break;
          }
        }
        setHoveredHandle(foundHandle);
      } else if (isDraggingHandle || isDragging || isDraggingSeats) {
        // Clear hovered handle when dragging
        setHoveredHandle(null);
      }

      if (isDragging) {
        const dx = x - dragStart.x;
        const dy = y - dragStart.y;

        actions.updateView({
          tx: lastPanPoint.x + dx,
          ty: lastPanPoint.y + dy,
        });
      } else if (isDraggingSeats && extendingPathSegment) {
        const dx = x - dragStart.x;
        const dy = y - dragStart.y;

        // Convert screen delta to world delta
        const worldDx = dx / state.scene.view.scale;
        const worldDy = dy / state.scene.view.scale;

        // Sensitivity factor to reduce the impact of mouse movement (0.3 = 30% sensitivity)
        const sensitivityFactor = 0.3;
        const adjustedDx = worldDx * sensitivityFactor;
        const adjustedDy = worldDy * sensitivityFactor;

        const element = state.scene.elements[extendingPathSegment.elementId];

        console.log("[PathExtension] Extending path segment:", {
          extendingPathSegment,
          dragOffset: { dx, dy },
          worldOffset: { worldDx, worldDy },
          adjustedOffset: { adjustedDx, adjustedDy },
        });

        if (element && element.type === "path" && element.points) {
          const { segmentIndex, endpoint, pointIndex, initialPoint } =
            extendingPathSegment;
          const newPoints = [...element.points];
          const newCurveHandles = { ...(element.curveHandles || {}) };

          if (endpoint === "start") {
            const p1 = element.points[segmentIndex];
            const p2 =
              element.points[(segmentIndex + 1) % element.points.length];
            const segmentHandles = element.curveHandles?.[segmentIndex];

            // Calculate direction vector
            const direction = {
              x: p2.x - p1.x,
              y: p2.y - p1.y,
            };
            const length = Math.hypot(direction.x, direction.y);
            const unitX = length > 0 ? direction.x / length : 0;
            const unitY = length > 0 ? direction.y / length : 0;

            // Project drag offset onto the line direction
            const projection = adjustedDx * unitX + adjustedDy * unitY;

            // Calculate new point position based on initial point + projection
            const newP1 = {
              x: (initialPoint?.x || p1.x) - unitX * projection,
              y: (initialPoint?.y || p1.y) - unitY * projection,
            };

            if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
              const oldLength = length;
              const newLength = Math.hypot(p2.x - newP1.x, p2.y - newP1.y);
              const scale = oldLength > 0 ? newLength / oldLength : 1;

              const cp1Offset = {
                x: segmentHandles.cp1.x - p1.x,
                y: segmentHandles.cp1.y - p1.y,
              };
              const cp2Offset = {
                x: segmentHandles.cp2.x - p1.x,
                y: segmentHandles.cp2.y - p1.y,
              };

              newPoints[pointIndex] = newP1;
              newCurveHandles[segmentIndex] = {
                cp1: {
                  x: newP1.x + cp1Offset.x * scale,
                  y: newP1.y + cp1Offset.y * scale,
                },
                cp2: {
                  x: newP1.x + cp2Offset.x * scale,
                  y: newP1.y + cp2Offset.y * scale,
                },
              };
            } else {
              newPoints[pointIndex] = newP1;
            }
          } else {
            const p1 = element.points[segmentIndex];
            const p2 =
              element.points[(segmentIndex + 1) % element.points.length];
            const segmentHandles = element.curveHandles?.[segmentIndex];

            // Calculate direction vector
            const direction = {
              x: p2.x - p1.x,
              y: p2.y - p1.y,
            };
            const length = Math.hypot(direction.x, direction.y);
            const unitX = length > 0 ? direction.x / length : 0;
            const unitY = length > 0 ? direction.y / length : 0;

            // Project drag offset onto the line direction
            const projection = adjustedDx * unitX + adjustedDy * unitY;

            // Calculate new point position based on initial point + projection
            const newP2 = {
              x: (initialPoint?.x || p2.x) + unitX * projection,
              y: (initialPoint?.y || p2.y) + unitY * projection,
            };

            if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
              const oldLength = length;
              const newLength = Math.hypot(newP2.x - p1.x, newP2.y - p1.y);
              const scale = oldLength > 0 ? newLength / oldLength : 1;

              const cp1Offset = {
                x: segmentHandles.cp1.x - p1.x,
                y: segmentHandles.cp1.y - p1.y,
              };
              const cp2Offset = {
                x: segmentHandles.cp2.x - p1.x,
                y: segmentHandles.cp2.y - p1.y,
              };

              newPoints[pointIndex] = newP2;
              newCurveHandles[segmentIndex] = {
                cp1: {
                  x: p1.x + cp1Offset.x * scale,
                  y: p1.y + cp1Offset.y * scale,
                },
                cp2: {
                  x: p1.x + cp2Offset.x * scale,
                  y: p1.y + cp2Offset.y * scale,
                },
              };
            } else {
              newPoints[pointIndex] = newP2;
            }
          }

          console.log("[PathExtension] Updating element with new points:", {
            elementId: extendingPathSegment.elementId,
            newPoints,
            newCurveHandles,
          });

          actions.updateElement(extendingPathSegment.elementId, {
            points: newPoints,
            curveHandles: newCurveHandles,
          });
        }
      } else if (isDraggingSeats) {
        const dx = x - dragStart.x;
        const dy = y - dragStart.y;

        // Convert screen delta to world delta
        let worldDx = dx / state.scene.view.scale;
        let worldDy = dy / state.scene.view.scale;

        // Check if dragging text elements and find rectangle intersections
        const selectedElements = state.selectedIds
          .map((id) => state.scene.elements[id])
          .filter((element) => element && element.type === ELEMENT_TYPES.TEXT);

        if (selectedElements.length > 0) {
          const textElement = selectedElements[0];

          // Find rectangles that the text could be inside
          let foundRectangle = null;
          Object.values(state.scene.elements).forEach((element) => {
            if (element.type === ELEMENT_TYPES.RECTANGLE) {
              if (
                isTextInsideRectangle(textElement, element, {
                  x: worldDx,
                  y: worldDy,
                })
              ) {
                foundRectangle = element;
              }
            }
          });

          setTextDragRectangle(foundRectangle);

          // Calculate snap position if inside a rectangle
          if (foundRectangle) {
            const snapResult = calculateSnapPosition(
              textElement,
              foundRectangle,
              { x: worldDx, y: worldDy },
              worldToScreen,
            );
            if (snapResult.isSnapped) {
              setTextSnapPosition(snapResult);
              setDragOffset({
                x: snapResult.x - textElement.x,
                y: snapResult.y - textElement.y,
              });
              return; // Don't update drag offset if snapped
            }
          }

          setTextSnapPosition(null);
        } else {
          setTextDragRectangle(null);
          setTextSnapPosition(null);
        }

        // Column snapping for seats: snap to Y-axis of seats in the same column (only when Alt is pressed)
        const selectedSeats = state.selectedIds
          .map((id) => state.scene.seats[id])
          .filter((seat) => seat);

        if (selectedSeats.length > 0 && isAltPressed) {
          // Get the first selected seat to use as reference
          const primarySeat = selectedSeats[0];
          const newSeatX = primarySeat.localX + worldDx;
          const newSeatY = primarySeat.localY + worldDy;

          // Calculate seat size for snap point calculation
          const seatHeight = primarySeat.height || 10; // Default to 10 if height not defined

          // Find all other seats (not selected) that are in approximately the same column
          const columnTolerance = 15; // X-axis tolerance for column detection

          // Step 1: Find the nearest seat in the column by Y-distance
          let nearestSeat = /** @type {any} */ (null);
          let nearestSeatDistance = Infinity;

          Object.values(state.scene.seats).forEach((otherSeat) => {
            // Skip if this seat is selected (being dragged)
            if (state.selectedIds.includes(otherSeat.id)) return;

            // Check if the other seat is in approximately the same column
            const xDistance = Math.abs(otherSeat.localX - newSeatX);

            if (xDistance < columnTolerance) {
              // Calculate Y distance to this seat's center
              const yDistance = Math.abs(otherSeat.localY - newSeatY);

              if (yDistance < nearestSeatDistance) {
                nearestSeatDistance = yDistance;
                nearestSeat = otherSeat;
              }
            }
          });

          // Step 2: If we found a nearest seat, check if we're close to one of its two snap points
          let closestSnapY = null;

          if (nearestSeat) {
            const otherSeatHeight = nearestSeat.height || 10;
            const snapDetectionThreshold = 10; // pixels tolerance to detect proximity to snap point

            // Calculate the two specific snap points for the nearest seat only
            // Point 1: Directly below the nearest seat
            const snapPointBelow =
              nearestSeat.localY + otherSeatHeight / 2 + seatHeight / 2;
            // Point 2: Directly above the nearest seat
            const snapPointAbove =
              nearestSeat.localY - otherSeatHeight / 2 - seatHeight / 2;

            // Check distance to snap point below
            const distanceToBelow = Math.abs(newSeatY - snapPointBelow);
            // Check distance to snap point above
            const distanceToAbove = Math.abs(newSeatY - snapPointAbove);

            // Snap to whichever point is closest, if within threshold
            if (
              distanceToBelow < snapDetectionThreshold &&
              distanceToBelow <= distanceToAbove
            ) {
              closestSnapY = snapPointBelow;
            } else if (distanceToAbove < snapDetectionThreshold) {
              closestSnapY = snapPointAbove;
            }
          }

          // Apply Y-axis snap if we found a close snap point
          if (closestSnapY !== null) {
            worldDy = closestSnapY - primarySeat.localY;
            setIsSnapped(true);
            setSnapType("vertical");
          } else {
            setIsSnapped(false);
            setSnapType(null);
          }
        }

        setDragOffset({ x: worldDx, y: worldDy });
      } else if (isSelectionDrag) {
        // Update selection rectangle
        setSelectionRect((prev) => ({
          ...prev,
          endX: x,
          endY: y,
        }));
      } else if (isDraggingHandle && draggedHandle) {
        // Update curve handle position or rectangle resize/rotate
        const worldPos = screenToWorld(x, y);

        if (draggedHandle.elementId) {
          const element = state.scene.elements[draggedHandle.elementId];

          // Handle rectangle resize/rotate
          if (element && element.type === ELEMENT_TYPES.RECTANGLE) {
            const { handleType } = draggedHandle;

            if (handleType === "rotate") {
              // Calculate rotation angle
              const dx = worldPos.x - element.x;
              const dy = worldPos.y - element.y;
              const angle = Math.atan2(dy, dx);
              // Add 90 degrees (PI/2) because the handle is at the top (pointing up)
              const newRotation = angle + Math.PI / 2;

              actions.updateElement(draggedHandle.elementId, {
                rotation: newRotation,
              });
            } else {
              // Handle resize
              const rotation = element.rotation || 0;
              const cos = Math.cos(-rotation); // Inverse rotation
              const sin = Math.sin(-rotation);

              // Convert mouse position to element's local coordinate system
              const localX = worldPos.x - element.x;
              const localY = worldPos.y - element.y;
              const rotatedX = localX * cos - localY * sin;
              const rotatedY = localX * sin + localY * cos;

              let newWidth = element.width;
              let newHeight = element.height;
              let newX = element.x;
              let newY = element.y;

              // Resize based on handle type (keeping opposite corner fixed)
              const halfWidth = element.width / 2;
              const halfHeight = element.height / 2;

              if (handleType.includes("n")) {
                // North handles - adjust top edge
                const delta = rotatedY + halfHeight;
                newHeight = element.height - delta;
                const offset = delta / 2;
                const offsetX = offset * sin;
                const offsetY = offset * cos;
                newX = element.x + offsetX;
                newY = element.y + offsetY;
              }
              if (handleType.includes("s")) {
                // South handles - adjust bottom edge
                const delta = rotatedY - halfHeight;
                newHeight = element.height + delta;
                const offset = delta / 2;
                const offsetX = offset * sin;
                const offsetY = offset * cos;
                newX = element.x + offsetX;
                newY = element.y + offsetY;
              }
              if (handleType.includes("w")) {
                // West handles - adjust left edge
                const delta = rotatedX + halfWidth;
                newWidth = element.width - delta;
                const offset = delta / 2;
                const offsetX = offset * cos;
                const offsetY = -offset * sin;
                newX = element.x + offsetX;
                newY = element.y + offsetY;
              }
              if (handleType.includes("e")) {
                // East handles - adjust right edge
                const delta = rotatedX - halfWidth;
                newWidth = element.width + delta;
                const offset = delta / 2;
                const offsetX = offset * cos;
                const offsetY = -offset * sin;
                newX = element.x + offsetX;
                newY = element.y + offsetY;
              }

              // Enforce minimum size
              newWidth = Math.max(20, newWidth);
              newHeight = Math.max(20, newHeight);

              actions.updateElement(draggedHandle.elementId, {
                width: newWidth,
                height: newHeight,
                x: newX,
                y: newY,
              });
            }
          }
          // Handle circle resize
          else if (element && element.type === ELEMENT_TYPES.CIRCLE) {
            const { handleType } = draggedHandle;

            // Calculate new radius based on distance from center to mouse
            const dx = worldPos.x - element.x;
            const dy = worldPos.y - element.y;
            let newRadius;

            // For each cardinal direction, calculate radius based on that axis
            if (handleType === "n" || handleType === "s") {
              // Vertical handles - use Y distance
              newRadius = Math.abs(dy);
            } else if (handleType === "e" || handleType === "w") {
              // Horizontal handles - use X distance
              newRadius = Math.abs(dx);
            }

            // Enforce minimum radius
            newRadius = Math.max(5, /** @type {number} */ (newRadius));

            // Update circle with new radius
            actions.updateElement(draggedHandle.elementId, {
              radius: newRadius,
              width: newRadius * 2,
              height: newRadius * 2,
            });
          }
          // Handle image resize (proportional scaling)
          else if (element && element.type === ELEMENT_TYPES.IMAGE) {
            const { handleType } = draggedHandle;

            // Calculate distance from center to mouse position
            const dx = worldPos.x - element.x;
            const dy = worldPos.y - element.y;

            // Calculate the current distance from center to handle
            const currentHalfWidth = element.width / 2;
            const currentHalfHeight = element.height / 2;

            // Determine which corner is being dragged
            let scaleFactor = 1;

            if (handleType === "nw") {
              // Top-left corner
              const targetDist = Math.sqrt(dx * dx + dy * dy);
              const currentDist = Math.sqrt(
                currentHalfWidth * currentHalfWidth +
                  currentHalfHeight * currentHalfHeight,
              );
              scaleFactor = targetDist / currentDist;
            } else if (handleType === "ne") {
              // Top-right corner
              const targetDist = Math.sqrt(dx * dx + dy * dy);
              const currentDist = Math.sqrt(
                currentHalfWidth * currentHalfWidth +
                  currentHalfHeight * currentHalfHeight,
              );
              scaleFactor = targetDist / currentDist;
            } else if (handleType === "se") {
              // Bottom-right corner
              const targetDist = Math.sqrt(dx * dx + dy * dy);
              const currentDist = Math.sqrt(
                currentHalfWidth * currentHalfWidth +
                  currentHalfHeight * currentHalfHeight,
              );
              scaleFactor = targetDist / currentDist;
            } else if (handleType === "sw") {
              // Bottom-left corner
              const targetDist = Math.sqrt(dx * dx + dy * dy);
              const currentDist = Math.sqrt(
                currentHalfWidth * currentHalfWidth +
                  currentHalfHeight * currentHalfHeight,
              );
              scaleFactor = targetDist / currentDist;
            }

            // Calculate new dimensions maintaining aspect ratio
            const aspectRatio = element.width / element.height;
            let newWidth = element.width * scaleFactor;
            let newHeight = element.height * scaleFactor;

            // Enforce minimum size (20px)
            const minSize = 20;
            if (newWidth < minSize) {
              newWidth = minSize;
              newHeight = newWidth / aspectRatio;
            }
            if (newHeight < minSize) {
              newHeight = minSize;
              newWidth = newHeight * aspectRatio;
            }

            // Update image with new dimensions (proportional scaling)
            actions.updateElement(draggedHandle.elementId, {
              width: newWidth,
              height: newHeight,
            });
          }
          // Handle path element curve handles
          else if (element && element.type === "path" && element.curveHandles) {
            const { segmentIndex, handleType } = draggedHandle;
            const newCurveHandles = { ...element.curveHandles };
            newCurveHandles[segmentIndex] = {
              ...newCurveHandles[segmentIndex],
              [handleType]: worldPos,
            };

            // Update the element in the scene
            actions.updateElement(draggedHandle.elementId, {
              curveHandles: newCurveHandles,
            });
          }
        }
        // Handle multi-selection rotation
        else if (
          draggedHandle.isMultiSelection &&
          draggedHandle.handleType === "rotate"
        ) {
          const dx = worldPos.x - draggedHandle.centerX;
          const dy = worldPos.y - draggedHandle.centerY;
          const angle = Math.atan2(dy, dx);
          const newRotation = angle + Math.PI / 2;

          if (draggedHandle.lastRotation === undefined) {
            setDraggedHandle({
              ...draggedHandle,
              lastRotation: newRotation,
            });
            return;
          }

          const deltaRotation = newRotation - draggedHandle.lastRotation;

          if (Math.abs(deltaRotation) > 0.001) {
            actions.rotateSelectedSeats(deltaRotation);
            setDraggedHandle({
              ...draggedHandle,
              lastRotation: newRotation,
              initialRotation:
                (draggedHandle.initialRotation || 0) + deltaRotation,
            });
          }
        }
        // Handle row rotation
        else if (draggedHandle.rowId) {
          const row = state.scene.rows[draggedHandle.rowId];
          if (row && draggedHandle.handleType === "rotate") {
            // Calculate rotation angle from row center to mouse position
            const dx = worldPos.x - draggedHandle.centerX;
            const dy = worldPos.y - draggedHandle.centerY;
            const angle = Math.atan2(dy, dx);
            // Add 90 degrees (PI/2) because the handle is at the top (pointing up)
            const newRotation = angle + Math.PI / 2;

            actions.updateRow(draggedHandle.rowId, {
              transform: {
                ...row.transform,
                rotation: newRotation,
              },
            });
          }
        }
        // Dragging handle during path creation (no elementId means it's a new path being drawn)
        else if (!draggedHandle.elementId) {
          const { segmentIndex, handleType } = draggedHandle;
          setCurveHandles((prev) => ({
            ...prev,
            [segmentIndex]: {
              ...prev[segmentIndex],
              [handleType]: worldPos,
            },
          }));
        }
      } else if (isDrawingRow) {
        // Update drawing end point with snap effect
        const worldPos = screenToWorld(x, y);

        // Apply row snapping only if Alt is pressed
        // Start point is already snapped (if Alt was pressed), just update end point following cursor
        const {
          snappedEnd,
          isSnapped: newIsSnapped,
          snapType: newSnapType,
        } = calculateSnap(drawingStart, worldPos);

        setDrawingEnd(snappedEnd);
        setIsSnapped(newIsSnapped);
        setSnapType(newSnapType);
      } else if (
        state.currentTool === "multi-row" &&
        multiRowState.phase === "first-click"
      ) {
        // Multi-row tool Phase 1: Update preview with snapping to horizontal/vertical
        const worldPos = screenToWorld(x, y);

        if (multiRowState.firstPoint) {
          const dx = worldPos.x - multiRowState.firstPoint.x;
          const dy = worldPos.y - multiRowState.firstPoint.y;
          const angle = Math.atan2(dy, dx);
          const snapThreshold = 10 * (Math.PI / 180); // 10 degrees in radians

          // Snap to horizontal (0° or 180°) or vertical (90° or 270°)
          const snappedAngles = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
          let snappedAngle = angle;
          let isSnapped = false;

          for (const snapAngle of snappedAngles) {
            const angleDiff = Math.abs(angle - snapAngle);
            if (
              angleDiff < snapThreshold ||
              angleDiff > 2 * Math.PI - snapThreshold
            ) {
              snappedAngle = snapAngle;
              isSnapped = true;
              break;
            }
          }

          // Store snapped position in state for rendering
          if (isSnapped) {
            const distance = Math.sqrt(dx * dx + dy * dy);
            const snappedPos = {
              x: multiRowState.firstPoint.x + distance * Math.cos(snappedAngle),
              y: multiRowState.firstPoint.y + distance * Math.sin(snappedAngle),
            };
            setMultiRowState((prev) => ({
              ...prev,
              previewPoint: snappedPos,
              isSnapped: true,
            }));
          } else {
            setMultiRowState((prev) => ({
              ...prev,
              previewPoint: worldPos,
              isSnapped: false,
            }));
          }
        }
      } else if (
        state.currentTool === "multi-row" &&
        multiRowState.phase === "second-click" &&
        multiRowState.secondPoint
      ) {
        // Multi-row tool Phase 2: show preview of additional rows when cursor moves below the first row
        const worldPos = screenToWorld(x, y);
        const toolSettings = state.toolSettings[state.currentTool] || {};
        const rowSpacing = toolSettings.rowSpacing || 30;

        // Calculate how many additional rows based on cursor position
        const dy = worldPos.y - multiRowState.secondPoint.y;

        if (dy > rowSpacing / 2) {
          // Cursor is below the first row, calculate number of rows
          const numAdditionalRows = Math.floor(dy / rowSpacing);

          if (numAdditionalRows > 0) {
            console.log(
              "[MultiRow] Preview mode: showing",
              numAdditionalRows,
              "additional rows",
            );
            // Store preview state for rendering
            setMultiRowState((prev) => ({
              ...prev,
              previewRowCount: numAdditionalRows,
              previewCursorPos: worldPos,
            }));
          }
        } else {
          // Clear preview if cursor moves back up
          setMultiRowState((prev) => ({
            ...prev,
            previewRowCount: 0,
            previewCursorPos: null,
          }));
        }
      }

      // Update path preview point with angle snapping and axis alignment
      if (
        state.currentTool === "element-path" &&
        isDrawingElement &&
        pathPoints.length > 0 &&
        !isDraggingHandle
      ) {
        const worldPos = screenToWorld(x, y);
        const lastPoint = pathPoints[pathPoints.length - 1];

        // Calculate snapped position (includes axis alignment and angle snapping)
        const {
          point: snappedPoint,
          angle,
          snapType,
          xSnapPoint,
          ySnapPoint,
        } = calculatePathSnapPosition(worldPos, lastPoint, pathPoints);

        setPathPreviewPoint(snappedPoint);
        setPathSnapAngle(angle);
        setPathSnapType(snapType);
        setPathSnapPoints(
          xSnapPoint || ySnapPoint ? { xSnapPoint, ySnapPoint } : null,
        );
      } else if (pathPreviewPoint) {
        setPathPreviewPoint(null);
        setPathSnapAngle(null);
        setPathSnapType(null);
        setPathSnapPoints(null);
      }

      // Check if mouse is near first point for auto-closing path
      if (
        state.currentTool === "element-path" &&
        isDrawingElement &&
        pathPoints.length >= 3
      ) {
        const nearFirstPoint = isNearFirstPoint(x, y);
        setIsPathCloseable(nearFirstPoint);
      } else if (isPathCloseable) {
        setIsPathCloseable(false);
      }
    },
    [
      isDragging,
      isDraggingSeats,
      isSelectionDrag,
      isDrawingRow,
      isDraggingHandle,
      draggedHandle,
      drawingStart,
      dragStart,
      lastPanPoint,
      state.scene.view.scale,
      state.scene.elements,
      state.selectedIds,
      state.currentTool,
      screenToWorld,
      worldToScreen,
      actions,
      calculateSnap,
      getRectangleHandle,
      isDrawingElement,
      pathPoints,
      isNearFirstPoint,
      isPathCloseable,
      isAltPressed,
      lastCreatedRowStart,
      state.globalSettings,
      calculatePathSnapPosition,
      pathPreviewPoint,
    ],
  );

  const handleMouseUp = useCallback(
    (e) => {
      if (
        isDraggingSeats &&
        (Math.abs(dragOffset.x) > 1 || Math.abs(dragOffset.y) > 1)
      ) {
        // Check if we're moving elements or seats
        const selectedElements = state.selectedIds.filter(
          (id) => state.scene.elements[id],
        );
        const selectedSeats = state.selectedIds.filter(
          (id) => state.scene.seats[id],
        );

        if (selectedElements.length > 0) {
          actions.moveElements(selectedElements, dragOffset.x, dragOffset.y);
        }

        if (selectedSeats.length > 0) {
          actions.moveSeats(selectedSeats, dragOffset.x, dragOffset.y);
        }
      }

      if (isSelectionDrag && selectionRect) {
        // Convert screen coordinates to world coordinates for selection
        const startWorld = screenToWorld(
          selectionRect.startX,
          selectionRect.startY,
        );
        const endWorld = screenToWorld(selectionRect.endX, selectionRect.endY);

        // Get seats and elements within the selection rectangle
        const itemsInRect = getItemsInRect(
          startWorld.x,
          startWorld.y,
          endWorld.x,
          endWorld.y,
        );

        if (itemsInRect.length > 0) {
          if (e?.shiftKey) {
            // Add to existing selection
            const newSelection = [
              ...new Set([...state.selectedIds, ...itemsInRect]),
            ];
            actions.setSelection(newSelection);
          } else {
            // Replace selection
            actions.setSelection(itemsInRect);
          }
        }
      }

      // Complete row drawing if in row tool mode
      // Only proceed if we have valid drawing state (not cancelled)
      if (isDrawingRow && drawingStart && drawingEnd) {
        // Calculate distance between start and end points
        const dx = drawingEnd.x - drawingStart.x;
        const dy = drawingEnd.y - drawingStart.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 5) {
          // Lower threshold for easier testing - minimum distance threshold for row creation
          // Ensure we have a section to add the row to
          const sectionId = actions.ensureSectionExists();
          let geometry;

          if (state.currentTool === "row-line") {
            geometry = createLineGeometry(
              drawingStart.x,
              drawingStart.y,
              drawingEnd.x,
              drawingEnd.y,
            );
          } else if (state.currentTool === "row-arc") {
            // Create elliptical arc geometry with customizable aspect ratio
            const centerX = (drawingStart.x + drawingEnd.x) / 2;
            const centerY = Math.min(drawingStart.y, drawingEnd.y) - 50;
            const width = Math.abs(drawingEnd.x - drawingStart.x);
            const height = Math.abs(drawingEnd.y - drawingStart.y) + 100;

            // Create elliptical arc with 4:1 aspect ratio (major:minor)
            const radiusX = width / 2; // Major axis (horizontal)
            const radiusY = Math.max(height / 8, 20); // Minor axis (vertical), minimum 20px
            const startAngle = 0;
            const endAngle = Math.PI;

            geometry = createArcGeometry(
              centerX,
              centerY,
              radiusX,
              radiusY,
              startAngle,
              endAngle,
            );
          }

          if (geometry) {
            const rowToolSettings = state.toolSettings[state.currentTool] || {};
            const seatWidth =
              rowToolSettings.seatWidth || state.globalSettings.seatWidth;
            const seatHeight =
              rowToolSettings.seatHeight || state.globalSettings.seatHeight;
            const seatSpacing =
              rowToolSettings.seatSpacing || state.globalSettings.seatSpacing;
            const minSeats = 1;

            const globalSettings = state.globalSettings;
            const isSeatCountLocked = globalSettings.seatCountLocked;
            const isSeatSpacingLocked = globalSettings.seatSpacingLocked;
            const lockedSeatCount = globalSettings.defaultSeatCount || 10;
            const lockedSeatSpacing = globalSettings.seatSpacing || 7.0;

            let effectiveDistance = distance;

            if (state.currentTool === "row-arc") {
              const { radiusX, radiusY, startAngle, endAngle } = geometry;
              const angleSpan = Math.abs(endAngle - startAngle);
              effectiveDistance = ((radiusX + radiusY) / 2) * angleSpan;
            }

            if (effectiveDistance < seatWidth) {
              effectiveDistance = seatWidth;
            }

            let calculatedSeatCount = minSeats;
            let calculatedSeatSpacing = seatSpacing;

            if (isSeatCountLocked && isSeatSpacingLocked) {
              calculatedSeatCount = Math.max(1, lockedSeatCount);
              calculatedSeatSpacing = lockedSeatSpacing;
            } else if (isSeatCountLocked) {
              calculatedSeatCount = Math.max(1, lockedSeatCount);
              if (calculatedSeatCount > 1) {
                const totalSeatWidth = calculatedSeatCount * seatWidth;
                const availableSpace = effectiveDistance - totalSeatWidth;
                calculatedSeatSpacing = Math.max(
                  1,
                  availableSpace / (calculatedSeatCount - 1),
                );
              } else {
                calculatedSeatSpacing = seatSpacing;
              }
            } else if (isSeatSpacingLocked) {
              calculatedSeatSpacing = lockedSeatSpacing;
              const availableSpace = effectiveDistance - seatWidth;
              const maxSeatsBySpace =
                Math.floor(availableSpace / calculatedSeatSpacing) + 1;

              for (
                let testSeats = maxSeatsBySpace;
                testSeats >= minSeats;
                testSeats--
              ) {
                const totalSpaceNeeded =
                  (testSeats - 1) * calculatedSeatSpacing +
                  testSeats * seatWidth;
                if (totalSpaceNeeded <= effectiveDistance) {
                  calculatedSeatCount = testSeats;
                  break;
                }
              }
            } else {
              const availableSpace = effectiveDistance - seatWidth;
              const maxSeatsBySpace =
                Math.floor(availableSpace / seatSpacing) + 1;

              for (
                let testSeats = maxSeatsBySpace;
                testSeats >= minSeats;
                testSeats--
              ) {
                const totalSpaceNeeded =
                  (testSeats - 1) * seatSpacing + testSeats * seatWidth;
                if (totalSpaceNeeded <= effectiveDistance) {
                  calculatedSeatCount = testSeats;
                  break;
                }
              }
              calculatedSeatSpacing = seatSpacing;
            }

            const rowSeatSpacing = calculatedSeatSpacing;
            const rowSeatWidth =
              rowToolSettings.seatWidth || globalSettings.seatWidth;
            const rowSeatHeight =
              rowToolSettings.seatHeight || globalSettings.seatHeight;
            const rowCategoryId =
              rowToolSettings.categoryId ||
              globalSettings.categoryId ||
              "default";

            const row = createRow(
              sectionId,
              geometry,
              calculatedSeatCount,
              rowSeatSpacing,
              rowCategoryId,
              0,
            );

            // Store the seat dimensions in the row for seat generation
            row.seatWidth = rowSeatWidth;
            row.seatHeight = rowSeatHeight;
            console.log(
              `Dynamic row creation: ${calculatedSeatCount} seats, ${rowSeatSpacing}pt spacing, ${Math.round(
                effectiveDistance,
              )}pt distance`,
            );
            actions.addRow(row);

            // Track the start position of the newly created row for snapping next row
            if (geometry.kind === "line") {
              // For line rows, use the p1 (start point)
              setLastCreatedRowStart({ x: geometry.p1.x, y: geometry.p1.y });
              console.log(
                "[RowDraw] Saved row start position for snapping:",
                geometry.p1,
              );
            } else if (geometry.kind === "arc") {
              // For arc rows, use the leftmost point on the arc (start of the arc)
              const startAngle = geometry.startAngle;
              const startX =
                geometry.center.x + geometry.radiusX * Math.cos(startAngle);
              const startY =
                geometry.center.y + geometry.radiusY * Math.sin(startAngle);
              setLastCreatedRowStart({ x: startX, y: startY });
              console.log(
                "[RowDraw] Saved arc row start position for snapping:",
                { x: startX, y: startY },
              );
            }

            // Only reset to select for non-row tools (seat, element tools should reset)
            if (
              state.currentTool !== "row-line" &&
              state.currentTool !== "row-arc"
            ) {
              actions.setTool("select");
            }
          }
        }
      }

      // Handle path completion on right-click only (not on regular clicks)
      // Path completion happens only via right-click or keyboard shortcut
      if (isDrawingElement && pathPoints.length > 1 && e.button === 2) {
        // Check if path is closed (first and last points are close enough)
        const firstPoint = pathPoints[0];
        const lastPoint = pathPoints[pathPoints.length - 1];
        const distance = Math.sqrt(
          Math.pow(lastPoint.x - firstPoint.x, 2) +
            Math.pow(lastPoint.y - firstPoint.y, 2),
        );
        const isClosed = distance < 20; // 20 pixel threshold for closure

        if (isClosed && pathPoints.length >= 3) {
          // Create section boundary element for closed paths
          const toolSettings = state.toolSettings[state.currentTool] || {};
          const sectionBoundary = createElement(
            ELEMENT_TYPES.SECTION_BOUNDARY,
            0,
            0,
            0,
            0,
            {
              points: pathPoints,
              curveHandles: curveHandles,
              strokeColor: toolSettings.strokeColor || "rgba(0, 0, 0, 0.9)",
              strokeWidth: toolSettings.strokeWidth || 2,
              fillColor: toolSettings.fillColor || "rgba(0, 0, 0, 0.1)",
              label: "Section Boundary",
              sectionName: `Section ${
                Object.keys(state.scene.sections).length + 1
              }`,
              categoryId: "default",
              opacity: toolSettings.opacity || 0.8,
              showAsSolid:
                toolSettings.showAsSolid !== undefined
                  ? toolSettings.showAsSolid
                  : true,
              zoomThreshold: toolSettings.zoomThreshold || 0.5,
            },
          );

          actions.addElement(sectionBoundary);
          actions.setSelection([sectionBoundary.id]);
        } else {
          // Create regular path element for open paths
          const toolSettings = state.toolSettings[state.currentTool] || {};
          const pathElement = createElement(ELEMENT_TYPES.PATH, 0, 0, 0, 0, {
            points: pathPoints,
            curveHandles: curveHandles,
            strokeColor: toolSettings.strokeColor || "rgba(0, 0, 0, 0.9)",
            strokeWidth: toolSettings.strokeWidth || 2,
            label: "Boundary",
            opacity: toolSettings.opacity || 0.8,
          });

          actions.addElement(pathElement);
          actions.setSelection([pathElement.id]);
        }

        // Reset path drawing state
        setIsDrawingElement(false);
        setPathPoints([]);
        setCurveHandles({});
        e.preventDefault();
      }

      // Reset all drag states
      setIsDragging(false);
      setIsDraggingSeats(false);
      setIsSelectionDrag(false);
      setIsDrawingRow(false);
      setIsDraggingHandle(false);
      setDraggedHandle(null);
      setDragOffset({ x: 0, y: 0 });
      setSelectionRect(null);
      setDrawingStart(null);
      setDrawingEnd(null);
      setIsSnapped(false);
      setSnapType(null);
      setTextDragRectangle(null);
      if (extendingPathSegment) {
        setExtendingPathSegment(null);
      }
      setTextSnapPosition(null);
      setIsAltPressed(false); // Reset Alt key state
      setSnapIndicatorPosition(null); // Clear snap indicators

      // Reset path drawing state only if not completing a path
      if (!isDrawingElement) {
        setPathPoints([]);
        setCurveHandles({});
      }
    },
    [
      isDraggingSeats,
      isSelectionDrag,
      isDrawingRow,
      isDrawingElement,
      pathPoints,
      dragOffset,
      selectionRect,
      drawingStart,
      drawingEnd,
      state.selectedIds,
      state.scene.sections,
      state.scene.elements,
      state.scene.seats,
      state.currentTool,
      state.globalSettings,
      state.toolSettings,
      actions,
      screenToWorld,
      getItemsInRect,
    ],
  );

  // Utility functions for touch gestures
  const getTouchDistance = (touches) => {
    if (touches.length < 2) return null;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchCenter = (touches) => {
    if (touches.length < 2) return null;
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  };

  const handleWheel = useCallback(
    (e) => {
      // e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const { scale, tx, ty } = state.scene.view;
      const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.1, Math.min(5, scale * scaleFactor));

      // Zoom towards mouse position
      const newTx = mouseX - (mouseX - tx) * (newScale / scale);
      const newTy = mouseY - (mouseY - ty) * (newScale / scale);

      actions.updateView({
        scale: newScale,
        tx: newTx,
        ty: newTy,
      });
    },
    [state.scene.view, actions],
  );

  // Touch event handlers for pinch zoom
  const handleTouchStart = useCallback(
    (e) => {
      if (e.touches.length === 2) {
        // Two-finger touch for pinch zoom
        e.preventDefault();
        const distance = getTouchDistance(e.touches);
        setLastTouchDistance(distance);
      } else if (e.touches.length === 1) {
        // Single touch - let mousedown handler deal with it
        // Convert touch to mouse event coordinates for pan tool
        const touch = e.touches[0];
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        if (state.currentTool === "pan") {
          setIsDragging(true);
          setDragStart({ x, y });
          setLastPanPoint({ x: state.scene.view.tx, y: state.scene.view.ty });
          e.preventDefault();
        }
      }
    },
    [state.currentTool, state.scene.view.tx, state.scene.view.ty],
  );

  const handleTouchMove = useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (e.touches.length === 2 && lastTouchDistance) {
        // Pinch zoom gesture
        e.preventDefault();

        const currentDistance = getTouchDistance(e.touches);
        const center = getTouchCenter(e.touches);

        if (currentDistance && center) {
          const rect = canvas.getBoundingClientRect();
          const touchX = center.x - rect.left;
          const touchY = center.y - rect.top;

          const { scale, tx, ty } = state.scene.view;

          // Calculate scale factor based on pinch distance change
          const scaleFactor = currentDistance / lastTouchDistance;
          const newScale = Math.max(0.1, Math.min(5, scale * scaleFactor));

          // Zoom towards touch center position
          const newTx = touchX - (touchX - tx) * (newScale / scale);
          const newTy = touchY - (touchY - ty) * (newScale / scale);

          actions.updateView({
            scale: newScale,
            tx: newTx,
            ty: newTy,
          });

          setLastTouchDistance(currentDistance);
        }
      } else if (
        e.touches.length === 1 &&
        isDragging &&
        state.currentTool === "pan"
      ) {
        // Single touch pan
        e.preventDefault();

        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        const dx = x - dragStart.x;
        const dy = y - dragStart.y;

        actions.updateView({
          tx: lastPanPoint.x + dx,
          ty: lastPanPoint.y + dy,
        });
      }
    },
    [
      lastTouchDistance,
      state.scene.view,
      actions,
      isDragging,
      dragStart,
      lastPanPoint,
      state.currentTool,
    ],
  );

  const handleTouchEnd = useCallback((e) => {
    e.preventDefault();
    setLastTouchDistance(null);

    if (e.touches.length === 0) {
      setIsDragging(false);
    }
  }, []);

  // Handle drag and drop for images
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((file) => file.type.startsWith("image/"));

      if (imageFiles.length === 0) return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const worldPos = screenToWorld(x, y);

      // Process each image file
      imageFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (!event.target) return;
          const dataUrl = /** @type {string} */ (event.target.result);
          const img = new Image();
          img.onload = () => {
            // Preload the image into our cache
            setLoadedImages((prev) =>
              new Map(prev).set(dataUrl, img),
            );

            // Create image element
            const imageElement = createElement(
              ELEMENT_TYPES.IMAGE,
              worldPos.x,
              worldPos.y,
              img.width,
              img.height,
              {
                src: dataUrl,
                imageWidth: img.width,
                imageHeight: img.height,
                opacity: 0.8,
              },
            );

            actions.addImage(imageElement);
            actions.setSelection([imageElement.id]);
            actions.setTool("select");
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });
    },
    [screenToWorld, actions],
  );

  // Setup canvas and event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleContextMenu = (e) => {
      // Only prevent default and complete path if we're drawing a new path
      // Don't interfere with path extension (handled in useMouseDown)
      if (isDrawingElement && pathPoints.length > 1) {
        e.preventDefault();
        // Complete path on right-click with venue boundary styling
        const toolSettings = state.toolSettings[state.currentTool] || {};
        const pathElement = createElement(ELEMENT_TYPES.PATH, 0, 0, 0, 0, {
          points: pathPoints,
          curveHandles: curveHandles,
          strokeColor: toolSettings.strokeColor || "rgba(0, 0, 0, 0.9)",
          strokeWidth: toolSettings.strokeWidth || 2,
          label: "Boundary",
          opacity: toolSettings.opacity || 0.8,
        });

        actions.addElement(pathElement);
        actions.setSelection([pathElement.id]);

        // Reset path drawing state
        setIsDrawingElement(false);
        setPathPoints([]);
        setCurveHandles({});
      } else if (extendingPathSegment) {
        // Prevent context menu when extending path
        e.preventDefault();
      }
    };

    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel);
    canvas.addEventListener("contextmenu", handleContextMenu);
    canvas.addEventListener("dragover", handleDragOver);
    canvas.addEventListener("dragleave", handleDragLeave);
    canvas.addEventListener("drop", handleDrop);

    // Add touch event listeners with { passive: false } to prevent browser zoom
    canvas.addEventListener("touchstart", handleTouchStart, { passive: false });
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false });
    canvas.addEventListener("touchend", handleTouchEnd, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      canvas.removeEventListener("dragover", handleDragOver);
      canvas.removeEventListener("dragleave", handleDragLeave);
      canvas.removeEventListener("drop", handleDrop);
      canvas.removeEventListener("touchstart", handleTouchStart);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", handleTouchEnd);
    };
  }, [
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    isDrawingElement,
    pathPoints,
    actions,
  ]);

  // Attach global mouse listeners when dragging to handle mouse leaving canvas
  useEffect(() => {
    const isDraggingActive =
      isDragging || isDraggingSeats || isSelectionDrag || isDraggingHandle;

    if (isDraggingActive) {
      // When dragging starts, attach listeners to window to capture events outside canvas
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [
    isDragging,
    isDraggingSeats,
    isSelectionDrag,
    isDraggingHandle,
    handleMouseMove,
    handleMouseUp,
  ]);

  // Handle path completion requests from keyboard
  useEffect(() => {
    if (
      state.pathCompletionRequested &&
      isDrawingElement &&
      pathPoints.length > 1
    ) {
      // Complete the current path with venue boundary styling
      const pathElement = createElement(ELEMENT_TYPES.PATH, 0, 0, 0, 0, {
        points: pathPoints,
        curveHandles: curveHandles,
        strokeColor: "rgba(0, 0, 0, 0.9)",
        strokeWidth: 2,
        label: "Boundary",
        opacity: 0.8,
      });

      actions.addElement(pathElement);
      actions.setSelection([pathElement.id]);

      // Reset path drawing state
      setIsDrawingElement(false);
      setPathPoints([]);
      setCurveHandles({});
      setIsPathCloseable(false);
    }
  }, [state.pathCompletionRequested, isDrawingElement, pathPoints, actions]);

  // Reset drawing state when tool changes
  useEffect(() => {
    if (state.currentTool !== "element-path") {
      setIsDrawingElement(false);
      setPathPoints([]);
      setCurveHandles({});
      setIsDraggingHandle(false);
      setDraggedHandle(null);
      setIsPathCloseable(false);
      setPathPreviewPoint(null);
      setPathSnapAngle(null);
      setPathSnapType(null);
      setPathSnapPoints(null);
    }

    // Reset multi-row state when switching away from multi-row tool
    if (state.currentTool !== "multi-row") {
      setMultiRowState({
        phase: "initial",
        firstPoint: null,
        secondPoint: null,
        rowDirection: null,
        createdRows: [],
      });
    }

    // Reset measurement state when switching away from measure tool
    if (state.currentTool !== "measure") {
      setMeasurementStart(null);
      setMeasurementEnd(null);
      setIsMeasuring(false);
    }
  }, [state.currentTool]);

  // Handle Alt key for enabling row snapping (disabled by default)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Alt") {
        setIsAltPressed(true);
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === "Alt") {
        setIsAltPressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Handle Escape key to cancel operations and return to select tool
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Only handle Escape key
      if (e.key !== "Escape" && e.key !== "Esc") return;

      // Skip if user is typing in an input field
      const activeElement = document.activeElement;
      const isTypingInInput =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          /** @type {HTMLElement} */ (activeElement).contentEditable ===
            "true");

      if (isTypingInInput) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      // Check if we're in an active drag/draw operation
      const hasActiveOperation =
        isDraggingSeats ||
        isDrawingRow ||
        isDrawingElement ||
        isDraggingHandle ||
        isSelectionDrag;

      if (hasActiveOperation) {
        console.log(
          "[Escape-Canvas] Escape pressed during drag/draw operation",
        );
        console.log("[Escape-Canvas] Active states:", {
          isDraggingSeats,
          isDrawingRow,
          isDrawingElement,
          isDraggingHandle,
          isSelectionDrag,
          currentTool: state.currentTool,
        });

        // Cancel all active operations immediately
        if (isDraggingSeats) {
          console.log("[Escape-Canvas] Cancelling seat drag immediately");
          setIsDraggingSeats(false);
          setDragOffset({ x: 0, y: 0 });
        }
        if (isDrawingRow) {
          console.log(
            "[Escape-Canvas] Cancelling row drawing immediately (tool:",
            state.currentTool,
            ")",
          );
          setIsDrawingRow(false);
          setDrawingStart(null);
          setDrawingEnd(null);
          setIsSnapped(false);
          setSnapType(null);
        }
        if (isDrawingElement) {
          console.log("[Escape-Canvas] Cancelling element drawing immediately");
          setIsDrawingElement(false);
          setPathPoints([]);
          setCurveHandles({});
          setIsPathCloseable(false);
        }
        if (isDraggingHandle) {
          console.log("[Escape-Canvas] Cancelling handle drag immediately");
          setIsDraggingHandle(false);
          setDraggedHandle(null);
        }
        if (isSelectionDrag) {
          console.log("[Escape-Canvas] Cancelling selection drag immediately");
          setIsSelectionDrag(false);
          setSelectionRect(null);
        }

        // Also trigger the standard cancellation action
        actions.cancelDrawing();
      }

      // Clear measurement if active
      if (isMeasuring || measurementStart || measurementEnd) {
        setMeasurementStart(null);
        setMeasurementEnd(null);
        setIsMeasuring(false);
      }

      // Always switch to select tool on Escape, regardless of active operations
      console.log(
        "[Escape-Canvas] Switching from",
        state.currentTool,
        "to select",
      );
      actions.setTool("select");
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [
    isDraggingSeats,
    isDrawingRow,
    isDrawingElement,
    isDraggingHandle,
    isSelectionDrag,
    isMeasuring,
    measurementStart,
    measurementEnd,
    state.currentTool,
    actions,
  ]);

  // Handle drawing cancellation when Escape is pressed
  useEffect(() => {
    console.log("[Cancel] Cancellation effect triggered");
    console.log("[Cancel] Current tool:", state.currentTool);
    console.log("[Cancel] Drawing states:", {
      isDraggingSeats,
      isDrawingRow,
      isDrawingElement,
      isDraggingHandle,
      isSelectionDrag,
    });
    // Cancel any active drawing operations
    if (isDraggingSeats) {
      console.log("[Cancel] Cancelling seat drag operation");
      setIsDraggingSeats(false);
      setDragOffset({ x: 0, y: 0 });
    }
    if (isDrawingRow) {
      console.log(
        "[Cancel] Cancelling row drawing operation (tool:",
        state.currentTool,
        ")",
      );
      setIsDrawingRow(false);
      setDrawingStart(null);
      setDrawingEnd(null);
      setIsSnapped(false);
      setSnapType(null);
    }
    if (isDrawingElement) {
      console.log("[Cancel] Cancelling element drawing operation");
      setIsDrawingElement(false);
      setPathPoints([]);
      setCurveHandles({});
    }
    if (isDraggingHandle) {
      console.log("[Cancel] Cancelling handle drag operation");
      setIsDraggingHandle(false);
      setDraggedHandle(null);
    }
    if (isSelectionDrag) {
      console.log("[Cancel] Cancelling selection drag operation");
      setIsSelectionDrag(false);
      setSelectionRect(null);
    }
    console.log("[Cancel] Cancellation complete");
  }, [state.drawingCancelled]);

  // Trigger re-render when images are loaded
  useEffect(() => {
    // This will trigger a re-render when loadedImages changes
  }, [loadedImages]);

  // Auto-fit content when scene is first loaded
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if there's content to fit
    const hasContent =
      state.scene.seats.length > 0 ||
      state.scene.rows.length > 0 ||
      state.scene.elements.length > 0;

    // Only perform initial fit once when content is available
    if (hasContent && !hasInitialFitRef.current) {
      hasInitialFitRef.current = true;

      // Get canvas dimensions
      const rect = canvas.getBoundingClientRect();
      const canvasWidth = rect.width;
      const canvasHeight = rect.height;

      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        actions.zoomToFit(canvasWidth, canvasHeight, 80);
      });
    }
  }, [
    state.scene.seats.length,
    state.scene.rows.length,
    state.scene.elements.length,
    actions,
  ]);

  // Handle container resize (e.g., when properties panel is toggled)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create ResizeObserver to detect container size changes
    const resizeObserver = new ResizeObserver((entries) => {
      // Trigger a re-render when the canvas container size changes
      // The render function uses getBoundingClientRect() to get the new size
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        render();
      });
    });

    // Observe the canvas element
    resizeObserver.observe(canvas);

    // Also listen for window resize
    const handleWindowResize = () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        render();
      });
    };
    window.addEventListener("resize", handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleWindowResize);
    };
  }, [render]);

  // Animation loop
  useEffect(() => {
    const animate = () => {
      render();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [render]);

  // Determine cursor style based on current state
  const getCursor = () => {
    if (isDragOver) return "";
    if (isDraggingHandle && draggedHandle?.handleType === "rotate")
      return "cursor-grabbing";
    if (isDraggingHandle) return ""; // Use default cursor for resize drag
    if (isDraggingSeats) return "cursor-move";
    if (isDragging) return "cursor-grabbing";
    if (isSelectionDrag) return "cursor-crosshair";

    // Check for hovered handles
    if (hoveredHandle && state.currentTool === "select") {
      const cursor = getCursorForHandle(
        hoveredHandle.type,
        hoveredHandle.rotation,
      );
      return `cursor-${cursor}`;
    }

    // Tool-specific cursors
    if (state.currentTool === "select") return "cursor-custom-select";
    if (state.currentTool === "seat") return "cursor-crosshair";
    if (state.currentTool === "row-line") return "cursor-crosshair";
    if (state.currentTool === "row-arc") return "cursor-crosshair";
    if (state.currentTool === "multi-row") return "cursor-crosshair";
    if (state.currentTool === "element-text") return "cursor-text";
    if (state.currentTool === "element-path") return "cursor-crosshair";
    if (state.currentTool === "element-circle") return "cursor-crosshair";
    if (state.currentTool === "element-table") return "cursor-crosshair";
    if (state.currentTool === "element-rectangle") return "cursor-crosshair";
    if (state.currentTool === "standing-section") return "cursor-crosshair";
    if (state.currentTool === "measure") return "cursor-crosshair";
    return "cursor-grab";
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        data-canvas-stage
        className={`w-full h-full ${
          isDragOver
            ? "bg-blue-50 border-2 border-dashed border-blue-400"
            : getCursor()
        }`}
        style={{ touchAction: "none" }} // touchAction is set to "none" to ensure all touch and pointer events on the canvas (such as pinch-zoom, pan, swipe) are handled by custom logic and are not intercepted by the browser's default gestures, which is important for custom drag/pan/zoom behavior on touch devices.
      />
      {editingTextId &&
        (() => {
          const element = state.scene.elements[editingTextId];
          if (!element) return null;

          const screenPos = worldToScreen(element.x, element.y);
          const fontSize = (element.fontSize || 16) * state.scene.view.scale;

          return (
            <div
              style={{
                position: "absolute",
                left: `${screenPos.x}px`,
                top: `${screenPos.y}px`,
                transform: "translate(-50%, -50%)",
                zIndex: 1000,
              }}
            >
              <input
                type="text"
                value={editingTextValue}
                onChange={(e) => setEditingTextValue(e.target.value)}
                onBlur={() => {
                  actions.updateElement(editingTextId, {
                    text: editingTextValue,
                  });
                  setEditingTextId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    actions.updateElement(editingTextId, {
                      text: editingTextValue,
                    });
                    setEditingTextId(null);
                  } else if (e.key === "Escape") {
                    setEditingTextId(null);
                  }
                }}
                autoFocus
                style={{
                  fontFamily: element.fontFamily || "Arial",
                  fontSize: `${fontSize}px`,
                  fontWeight: element.fontWeight || "normal",
                  fontStyle: element.fontStyle || "normal",
                  textAlign: element.textAlign || "center",
                  color: element.fillColor || "#000000",
                  background: "rgba(255, 255, 255, 0.95)",
                  border: "2px solid #3b82f6",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  outline: "none",
                  minWidth: "100px",
                }}
              />
            </div>
          );
        })()}
    </div>
  );
}
