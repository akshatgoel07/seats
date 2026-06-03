import { useMemo } from "react";
import { generateSeatsForRow } from "../geometry.js";
import { createLineGeometry, createArcGeometry } from "../types.js";
import { buildSeatsByRow, makeRowCentroidGetter } from "./seatIndex.js";

/**
 * Module-level memo cache for darkenColor. renderSeats calls darkenColor once
 * per non-selected seat every frame, but a layout only uses a handful of
 * distinct (color, factor) pairs, so caching turns thousands of hex parses +
 * string allocations per frame into a single Map lookup.
 * @type {Map<string, string>}
 */
const darkenColorCache = new Map();

/**
 * Convert hex color to darker version by reducing RGB values
 * @param {string} hexColor - Hex color string (e.g., "#ff0000")
 * @param {number} factor - Darkening factor (0-1, default 0.3 = 30% darker)
 * @returns {string} Darker hex color
 */
function darkenColor(hexColor, factor = 0.3) {
  const cacheKey = `${hexColor}|${factor}`;
  const cached = darkenColorCache.get(cacheKey);
  if (cached !== undefined) return cached;

  // Remove # if present
  const hex = hexColor.replace("#", "");

  // Parse RGB components
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  // Darken each component
  const darkR = Math.max(0, Math.floor(r * (1 - factor)));
  const darkG = Math.max(0, Math.floor(g * (1 - factor)));
  const darkB = Math.max(0, Math.floor(b * (1 - factor)));

  // Convert back to hex
  const result = `#${darkR.toString(16).padStart(2, "0")}${darkG
    .toString(16)
    .padStart(2, "0")}${darkB.toString(16).padStart(2, "0")}`;
  darkenColorCache.set(cacheKey, result);
  return result;
}

export function renderGrid(ctx, canvas, state, screenToWorld) {
  if (!state.isGridVisible) return;
  const { scale, tx, ty } = state.scene.view;
  const gridSize = 50;
  const screenGridSize = gridSize * scale;
  if (screenGridSize < 5) return;
  ctx.save();
  ctx.strokeStyle = "#e0e0e0";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.5;
  const topLeft = screenToWorld(0, 0);
  const bottomRight = screenToWorld(canvas.width, canvas.height);
  const startX = Math.floor(topLeft.x / gridSize) * gridSize;
  const endX = Math.ceil(bottomRight.x / gridSize) * gridSize;
  for (let x = startX; x <= endX; x += gridSize) {
    const screenX = x * scale + tx;
    ctx.beginPath();
    ctx.moveTo(screenX, 0);
    ctx.lineTo(screenX, canvas.height);
    ctx.stroke();
  }
  const startY = Math.floor(topLeft.y / gridSize) * gridSize;
  const endY = Math.ceil(bottomRight.y / gridSize) * gridSize;
  for (let y = startY; y <= endY; y += gridSize) {
    const screenY = y * scale + ty;
    ctx.beginPath();
    ctx.moveTo(0, screenY);
    ctx.lineTo(canvas.width, screenY);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Render resize and rotation handles for a selected rectangle
 */
function renderRectangleHandles(
  ctx,
  element,
  elementX,
  elementY,
  worldToScreen,
  scale,
  isDraggingHandle,
  draggedHandle,
) {
  const rotation = element.rotation || 0;
  const width = element.width;
  const height = element.height;

  // Calculate corner positions in world coordinates (before rotation)
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  const corners = [
    { x: -halfWidth, y: -halfHeight, type: "nw" }, // Top-left
    { x: halfWidth, y: -halfHeight, type: "ne" }, // Top-right
    { x: halfWidth, y: halfHeight, type: "se" }, // Bottom-right
    { x: -halfWidth, y: halfHeight, type: "sw" }, // Bottom-left
  ];

  // Calculate edge midpoint positions (before rotation)
  const edges = [
    { x: 0, y: -halfHeight, type: "n" }, // Top
    { x: halfWidth, y: 0, type: "e" }, // Right
    { x: 0, y: halfHeight, type: "s" }, // Bottom
    { x: -halfWidth, y: 0, type: "w" }, // Left
  ];

  // Rotation handle position (above top edge)
  const rotationHandleDistance = 30; // pixels above the shape
  const rotationHandle = {
    x: 0,
    y: -halfHeight - rotationHandleDistance / scale,
    type: "rotate",
  };

  ctx.save();

  // Apply rotation to all handle positions
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  const rotatePoint = (px, py) => {
    return {
      x: px * cos - py * sin + elementX,
      y: px * sin + py * cos + elementY,
    };
  };

  // Draw resize handles (corners and edges)
  [...corners, ...edges].forEach((handle) => {
    const worldPos = rotatePoint(handle.x, handle.y);
    const screenPos = worldToScreen(worldPos.x, worldPos.y);

    const isActive =
      isDraggingHandle &&
      draggedHandle?.elementId === element.id &&
      draggedHandle?.handleType === handle.type;

    // Draw handle
    ctx.fillStyle = isActive ? "#ef4444" : "#ffffff";
    ctx.strokeStyle = "#8d6fbf";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  });

  // Draw rotation handle
  const rotWorldPos = rotatePoint(rotationHandle.x, rotationHandle.y);
  const rotScreenPos = worldToScreen(rotWorldPos.x, rotWorldPos.y);

  const isRotateActive =
    isDraggingHandle &&
    draggedHandle?.elementId === element.id &&
    draggedHandle?.handleType === "rotate";

  // Draw line connecting rotation handle to shape
  const topMidWorld = rotatePoint(0, -halfHeight);
  const topMidScreen = worldToScreen(topMidWorld.x, topMidWorld.y);
  ctx.strokeStyle = "#8d6fbf";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(topMidScreen.x, topMidScreen.y);
  ctx.lineTo(rotScreenPos.x, rotScreenPos.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw rotation handle (blue circle)
  ctx.fillStyle = isRotateActive ? "#ef4444" : "#3b82f6";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(rotScreenPos.x, rotScreenPos.y, 8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  // Draw rotation icon (circular arrow)
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(rotScreenPos.x, rotScreenPos.y, 4, 0.2, Math.PI * 1.8);
  ctx.stroke();

  ctx.restore();
}

/**
 * Render rotation handle for a selected row
 */
function renderRowHandles(
  ctx,
  row,
  rowSeats,
  worldToScreen,
  scale,
  isDraggingHandle,
  draggedHandle,
) {
  if (!rowSeats || rowSeats.length === 0) return;

  // Calculate row center and bounding box
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
  const width = maxX - minX;
  const height = maxY - minY;

  const rotation = row.transform?.rotation || 0;

  // Calculate rotation handle position (30 pixels above the row)
  const rotationHandleDistance = 30;
  const halfHeight = Math.max(height / 2, 15); // Minimum height for visibility

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  // Rotation handle at the top
  const rotHandleLocal = {
    x: 0,
    y: -halfHeight - rotationHandleDistance / scale,
  };

  const rotHandleWorld = {
    x: rotHandleLocal.x * cos - rotHandleLocal.y * sin + centerX,
    y: rotHandleLocal.x * sin + rotHandleLocal.y * cos + centerY,
  };

  const rotScreenPos = worldToScreen(rotHandleWorld.x, rotHandleWorld.y);

  // Top midpoint of the row for connecting line
  const topMidLocal = {
    x: 0,
    y: -halfHeight,
  };

  const topMidWorld = {
    x: topMidLocal.x * cos - topMidLocal.y * sin + centerX,
    y: topMidLocal.x * sin + topMidLocal.y * cos + centerY,
  };

  const topMidScreen = worldToScreen(topMidWorld.x, topMidWorld.y);

  const isRotateActive =
    isDraggingHandle &&
    draggedHandle?.rowId === row.id &&
    draggedHandle?.handleType === "rotate";

  ctx.save();

  // Draw dashed line connecting rotation handle to row top
  ctx.strokeStyle = "#8d6fbf";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(topMidScreen.x, topMidScreen.y);
  ctx.lineTo(rotScreenPos.x, rotScreenPos.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw rotation handle (blue circle)
  ctx.fillStyle = isRotateActive ? "#ef4444" : "#3b82f6";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(rotScreenPos.x, rotScreenPos.y, 8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  // Draw rotation icon (circular arrow)
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(rotScreenPos.x, rotScreenPos.y, 4, 0.2, Math.PI * 1.8);
  ctx.stroke();

  ctx.restore();
}

/**
 * Render rotation handle for multiple selected seats/rows
 */
function renderMultiSelectionHandles(
  ctx,
  selectedSeats,
  allSeats,
  rows,
  sections,
  worldToScreen,
  scale,
  isDraggingHandle,
  draggedHandle,
  currentRotation = 0,
) {
  if (!selectedSeats || selectedSeats.length === 0) return;

  const allPositions = [];

  selectedSeats.forEach((seat) => {
    let worldX = seat.localX;
    let worldY = seat.localY;

    if (seat.rowId) {
      const row = rows[seat.rowId];
      if (row && row.transform && row.transform.rotation) {
        const rowSeatsList = Object.values(allSeats).filter(
          (s) => s.rowId === row.id,
        );
        if (rowSeatsList.length > 0) {
          const centerX =
            rowSeatsList.reduce((sum, s) => sum + s.localX, 0) /
            rowSeatsList.length;
          const centerY =
            rowSeatsList.reduce((sum, s) => sum + s.localY, 0) /
            rowSeatsList.length;
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

  if (allPositions.length === 0) return;

  const minX = Math.min(...allPositions.map((p) => p.x));
  const maxX = Math.max(...allPositions.map((p) => p.x));
  const minY = Math.min(...allPositions.map((p) => p.y));
  const maxY = Math.max(...allPositions.map((p) => p.y));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const height = maxY - minY;

  const rotationHandleDistance = 30;
  const halfHeight = Math.max(height / 2, 15);

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

  const rotScreenPos = worldToScreen(rotHandleWorld.x, rotHandleWorld.y);

  const topMidLocal = {
    x: 0,
    y: -halfHeight,
  };

  const topMidWorld = {
    x: topMidLocal.x * cos - topMidLocal.y * sin + centerX,
    y: topMidLocal.x * sin + topMidLocal.y * cos + centerY,
  };

  const topMidScreen = worldToScreen(topMidWorld.x, topMidWorld.y);

  const isRotateActive =
    isDraggingHandle &&
    draggedHandle?.handleType === "rotate" &&
    draggedHandle?.isMultiSelection === true;

  ctx.save();

  ctx.strokeStyle = "#8d6fbf";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(topMidScreen.x, topMidScreen.y);
  ctx.lineTo(rotScreenPos.x, rotScreenPos.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = isRotateActive ? "#ef4444" : "#3b82f6";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(rotScreenPos.x, rotScreenPos.y, 8, 0, 2 * Math.PI);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(rotScreenPos.x, rotScreenPos.y, 4, 0.2, Math.PI * 1.8);
  ctx.stroke();

  ctx.restore();
}

/**
 * Render bounding box for a selected text element
 */
function renderTextHandles(
  ctx,
  element,
  elementX,
  elementY,
  worldToScreen,
  scale,
  isDraggingHandle,
  draggedHandle,
) {
  const fontSize = (element.fontSize || 16) * scale;
  const text = element.text || "Text";

  ctx.save();
  ctx.font = `${element.fontStyle || "normal"} ${
    element.fontWeight || "normal"
  } ${fontSize}px ${element.fontFamily || "Arial"}`;
  ctx.textAlign = element.textAlign || "center";
  ctx.textBaseline = "middle";

  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = fontSize;

  const padding = 8;
  const halfWidth = (textWidth + padding * 2) / 2;
  const halfHeight = (textHeight + padding * 2) / 2;

  const width = textWidth + padding * 2;
  const height = textHeight + padding * 2;

  ctx.restore();
  ctx.save();

  const screenPos = worldToScreen(elementX, elementY);

  ctx.translate(screenPos.x, screenPos.y);
  const rotation = element.rotation || 0;
  if (rotation !== 0) {
    ctx.rotate(rotation);
  }

  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 2;
  ctx.setLineDash([]);

  ctx.beginPath();
  ctx.rect(-halfWidth, -halfHeight, width, height);
  ctx.stroke();

  ctx.restore();
}

/**
 * Render resize handles for a selected circle
 */
function renderCircleHandles(
  ctx,
  element,
  elementX,
  elementY,
  worldToScreen,
  scale,
  isDraggingHandle,
  draggedHandle,
) {
  const radius = element.radius || Math.min(element.width, element.height) / 2;

  // Calculate edge handle positions in world coordinates (at cardinal directions)
  const edges = [
    { x: 0, y: -radius, type: "n" }, // Top (north)
    { x: radius, y: 0, type: "e" }, // Right (east)
    { x: 0, y: radius, type: "s" }, // Bottom (south)
    { x: -radius, y: 0, type: "w" }, // Left (west)
  ];

  ctx.save();

  // Draw edge handles
  edges.forEach((handle) => {
    const worldPos = {
      x: elementX + handle.x,
      y: elementY + handle.y,
    };
    const screenPos = worldToScreen(worldPos.x, worldPos.y);

    const isActive =
      isDraggingHandle &&
      draggedHandle?.elementId === element.id &&
      draggedHandle?.handleType === handle.type;

    // Draw handle
    ctx.fillStyle = isActive ? "#ef4444" : "#ffffff";
    ctx.strokeStyle = "#8d6fbf";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
}

/**
 * Render resize handles for a selected image
 */
function renderImageHandles(
  ctx,
  element,
  elementX,
  elementY,
  worldToScreen,
  scale,
  isDraggingHandle,
  draggedHandle,
) {
  const halfWidth = element.width / 2;
  const halfHeight = element.height / 2;

  // Calculate corner handle positions in world coordinates
  const corners = [
    { x: -halfWidth, y: -halfHeight, type: "nw" }, // Top-left
    { x: halfWidth, y: -halfHeight, type: "ne" }, // Top-right
    { x: halfWidth, y: halfHeight, type: "se" }, // Bottom-right
    { x: -halfWidth, y: halfHeight, type: "sw" }, // Bottom-left
  ];

  ctx.save();

  // Draw corner handles for proportional scaling
  corners.forEach((handle) => {
    const worldPos = {
      x: elementX + handle.x,
      y: elementY + handle.y,
    };
    const screenPos = worldToScreen(worldPos.x, worldPos.y);

    const isActive =
      isDraggingHandle &&
      draggedHandle?.elementId === element.id &&
      draggedHandle?.handleType === handle.type;

    // Draw handle
    ctx.fillStyle = isActive ? "#ef4444" : "#ffffff";
    ctx.strokeStyle = "#8d6fbf";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(screenPos.x, screenPos.y, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  });

  ctx.restore();
}

/**
 * @param {*} ctx
 * @param {*} state
 * @param {*} isDraggingSeats
 * @param {*} dragOffset
 * @param {*} worldToScreen
 * @param {*} [categoryMap]
 * @param {*} [isSnapped]
 * @param {*} [snapType]
 * @param {*} [isDraggingHandle]
 * @param {*} [draggedHandle]
 */
export function renderSeats(
  ctx,
  state,
  isDraggingSeats,
  dragOffset,
  worldToScreen,
  categoryMap = new Map(),
  isSnapped = false,
  snapType = null,
  isDraggingHandle = false,
  draggedHandle = null,
) {
  const { seats, rows, sections } = state.scene;

  // Index seats by row ONCE per pass (O(n)) so the rotated-row pivot centroid
  // is an O(1) lookup instead of an Object.values(seats).filter(...) per seat
  // (which was O(seats^2) per frame for layouts with rotated rows).
  const seatsByRow = buildSeatsByRow(seats);
  const getRowCentroid = makeRowCentroidGetter(seatsByRow);

  Object.values(seats).forEach((seat) => {
    if (!seat.rowId) {
      // Apply drag offset for selected standalone seats (e.g., table seats)
      const isSelected = state.selectedIds.includes(seat.id);
      let worldX = seat.localX;
      let worldY = seat.localY;
      if (isSelected && isDraggingSeats) {
        worldX += dragOffset.x;
        worldY += dragOffset.y;
      }
      const screenPos = worldToScreen(worldX, worldY);
      const screenWidth = seat.width * state.scene.view.scale;
      const screenHeight = seat.height * state.scene.view.scale;
      if (screenWidth < 1 || screenHeight < 1) return;
      ctx.save();
      // Use categoryMap to get the correct color for standalone seats
      const category = categoryMap.get(seat.categoryId);
      const color = category?.color || "#cccccc";
      ctx.fillStyle = color;
      // Show green stroke when snapping is active
      const strokeColor =
        isSelected && isSnapped && snapType === "vertical"
          ? "#22c55e"
          : isSelected
          ? "#8d6fbf"
          : darkenColor(color, 0.4);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = isSelected ? 2 : 0.5;
      const radius = Math.min(screenWidth / 2, screenHeight / 2);
      ctx.beginPath();
      ctx.roundRect(
        screenPos.x - screenWidth / 2,
        screenPos.y - screenHeight / 2,
        screenWidth,
        screenHeight,
        radius,
      );
      ctx.fill();
      ctx.stroke();
      // Seat labels temporarily commented out
      // if (state.scene.view.scale > 0.5 && seat.label) {
      //   ctx.fillStyle = "#000000";
      //   ctx.font = `${Math.min(12, screenHeight * 0.6)}px Arial`;
      //   ctx.textAlign = "center";
      //   ctx.textBaseline = "middle";
      //   ctx.fillText(seat.label, screenPos.x, screenPos.y);
      // }
      ctx.restore();
      return;
    }
    const row = rows[seat.rowId];
    if (!row) return;
    let worldX = seat.localX;
    let worldY = seat.localY;
    const isSelected = state.selectedIds.includes(seat.id);
    if (isSelected && isDraggingSeats) {
      worldX += dragOffset.x;
      worldY += dragOffset.y;
    }
    if (row.transform && row.transform.rotation) {
      // Rotation pivot = centroid of the row's seats (O(1) cached lookup).
      const { cx: centerX, cy: centerY, count } = getRowCentroid(row.id);
      if (count > 0) {
        // Apply rotation around the center of seats
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
    const section = sections[row.sectionId];
    if (section && section.transform) {
      const cos = Math.cos(section.transform.rotation || 0);
      const sin = Math.sin(section.transform.rotation || 0);
      const rotatedX = worldX * cos - worldY * sin;
      const rotatedY = worldX * sin + worldY * cos;
      worldX = rotatedX + section.transform.x;
      worldY = rotatedY + section.transform.y;
    }
    const screenPos = worldToScreen(worldX, worldY);
    const screenWidth = seat.width * state.scene.view.scale;
    const screenHeight = seat.height * state.scene.view.scale;
    if (screenWidth < 1 || screenHeight < 1) return;
    ctx.save();
    const category = categoryMap.get(seat.categoryId);
    const color = category?.color || "#cccccc";
    ctx.fillStyle = color;
    // Show green stroke when snapping is active
    const strokeColor =
      isSelected && isSnapped && snapType === "vertical"
        ? "#22c55e"
        : isSelected
        ? "#8d6fbf"
        : darkenColor(color, 0.4);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isSelected ? 2 : 1;
    const radius = Math.min(screenWidth / 2, screenHeight / 2);
    ctx.beginPath();
    ctx.roundRect(
      screenPos.x - screenWidth / 2,
      screenPos.y - screenHeight / 2,
      screenWidth,
      screenHeight,
      radius,
    );
    ctx.fill();
    ctx.stroke();
    // Seat labels temporarily commented out
    // if (state.scene.view.scale > 0.5 && seat.label) {
    //   ctx.fillStyle = "#000000";
    //   ctx.font = `${Math.min(12, screenHeight * 0.6)}px Arial`;
    //   ctx.textAlign = "center";
    //   ctx.textBaseline = "middle";
    //   ctx.fillText(seat.label, screenPos.x, screenPos.y);
    // }
    ctx.restore();
  });

  // Render rotation handles for selected rows
  const selectedRowIds = new Set();
  state.selectedIds.forEach((id) => {
    const seat = seats[id];
    if (seat && seat.rowId) {
      selectedRowIds.add(seat.rowId);
    }
  });

  const selectedSeatsList = state.selectedIds
    .map((id) => seats[id])
    .filter(Boolean);

  // Check if we should show multi-selection handle
  let showMultiSelectionHandle = false;
  let multiSelectionRotation = 0;

  if (selectedSeatsList.length > 1) {
    // Check if it's NOT a single complete row selection
    if (selectedRowIds.size === 1) {
      const rowId = Array.from(selectedRowIds)[0];
      const row = rows[rowId];
      if (row) {
        const rowSeats = seatsByRow.get(rowId) || [];
        const allSeatsSelected = rowSeats.every((s) =>
          state.selectedIds.includes(s.id),
        );
        // If all seats in the row are selected, use row rotation handle instead
        if (!allSeatsSelected) {
          showMultiSelectionHandle = true;
        }
      } else {
        showMultiSelectionHandle = true;
      }
    } else {
      // Multiple rows or mixed selection
      showMultiSelectionHandle = true;
    }
  }

  // Only render rotation handle when exactly one row is selected
  if (selectedRowIds.size === 1 && !showMultiSelectionHandle) {
    selectedRowIds.forEach((rowId) => {
      const row = rows[rowId];
      if (!row) return;

      const rowSeats = seatsByRow.get(rowId) || [];
      if (rowSeats.length === 0) return;

      // Only render rotation handle if all seats in the row are selected
      const allSeatsSelected = rowSeats.every((s) =>
        state.selectedIds.includes(s.id),
      );
      if (!allSeatsSelected) return;

      renderRowHandles(
        ctx,
        row,
        rowSeats,
        worldToScreen,
        state.scene.view.scale,
        isDraggingHandle,
        draggedHandle,
      );
    });
  }

  // Render multi-selection rotation handle
  if (showMultiSelectionHandle && selectedSeatsList.length > 1) {
    if (
      draggedHandle?.isMultiSelection &&
      draggedHandle?.initialRotation !== undefined
    ) {
      multiSelectionRotation = draggedHandle.initialRotation;
    }
    renderMultiSelectionHandles(
      ctx,
      selectedSeatsList,
      seats,
      rows,
      sections,
      worldToScreen,
      state.scene.view.scale,
      isDraggingHandle,
      draggedHandle,
      multiSelectionRotation,
    );
  }
}

export function renderElements(
  ctx,
  state,
  isDraggingSeats,
  dragOffset,
  worldToScreen,
  ELEMENT_TYPES,
  isDraggingHandle,
  draggedHandle,
  loadedImages = new Map(),
  loadImage = (/** @type {string=} */ _src) => null,
) {
  const { elements } = state.scene;
  Object.values(elements)
    .filter(
      (element) =>
        element.type !== ELEMENT_TYPES.TEXT &&
        element.type !== ELEMENT_TYPES.IMAGE &&
        element.type !== ELEMENT_TYPES.SEATING_SECTION &&
        !(element.type === ELEMENT_TYPES.PATH && element.label === "Boundary"),
    )
    .forEach((element) => {
      const isSelected = state.selectedIds.includes(element.id);
      let elementX = element.x;
      let elementY = element.y;
      if (isSelected && isDraggingSeats) {
        elementX += dragOffset.x;
        elementY += dragOffset.y;
      }
      const screenPos = worldToScreen(elementX, elementY);
      ctx.save();
      ctx.globalAlpha = element.opacity || 1;
      if (isSelected) {
        ctx.strokeStyle = "#8d6fbf";
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = element.strokeColor || "#333333";
        ctx.lineWidth = element.strokeWidth || 2;
      }
      ctx.fillStyle = element.fillColor || "#f0f0f0";
      if (element.type === ELEMENT_TYPES.CIRCLE) {
        const radius =
          (element.radius || Math.min(element.width, element.height) / 2) *
          state.scene.view.scale;
        if (radius > 1) {
          ctx.beginPath();
          ctx.arc(screenPos.x, screenPos.y, radius, 0, 2 * Math.PI);
          if (element.fillColor !== "transparent") {
            ctx.fill();
          }
          ctx.stroke();
        }

        // Draw resize handles for selected circles
        if (isSelected) {
          renderCircleHandles(
            ctx,
            element,
            elementX,
            elementY,
            worldToScreen,
            state.scene.view.scale,
            isDraggingHandle,
            draggedHandle,
          );
        }

        if (element.label) {
          const labelX =
            screenPos.x + (element.labelX || 0) * state.scene.view.scale;
          const labelY =
            screenPos.y + (element.labelY || 0) * state.scene.view.scale;

          ctx.save();
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = "#000000";
          ctx.font = `${
            (element.labelFontSize || 12) * state.scene.view.scale
          }px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          if (element.labelRotation) {
            ctx.translate(labelX, labelY);
            ctx.rotate(element.labelRotation);
            ctx.fillText(element.label, 0, 0);
          } else {
            ctx.fillText(element.label, labelX, labelY);
          }

          ctx.restore();
        }
      } else if (element.type === ELEMENT_TYPES.RECTANGLE) {
        const width = element.width * state.scene.view.scale;
        const height = element.height * state.scene.view.scale;
        if (width > 1 && height > 1) {
          ctx.save();
          ctx.translate(screenPos.x, screenPos.y);
          ctx.rotate(element.rotation || 0);
          const x = -width / 2;
          const y = -height / 2;
          const borderRadius =
            (element.borderRadius || 0) * state.scene.view.scale;
          ctx.beginPath();
          ctx.roundRect(x, y, width, height, borderRadius);
          if (element.fillColor !== "transparent") {
            ctx.fill();
          }
          ctx.stroke();
          ctx.restore();

          // Draw resize and rotation handles for selected rectangles
          if (isSelected) {
            renderRectangleHandles(
              ctx,
              element,
              elementX,
              elementY,
              worldToScreen,
              state.scene.view.scale,
              isDraggingHandle,
              draggedHandle,
            );
          }

          if (element.label) {
            const labelX =
              screenPos.x + (element.labelX || 0) * state.scene.view.scale;
            const labelY =
              screenPos.y + (element.labelY || 0) * state.scene.view.scale;

            ctx.save();
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = "#000000";
            ctx.font = `${
              (element.labelFontSize || 12) * state.scene.view.scale
            }px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            if (element.labelRotation) {
              ctx.translate(labelX, labelY);
              ctx.rotate(element.labelRotation);
              ctx.fillText(element.label, 0, 0);
            } else {
              ctx.fillText(element.label, labelX, labelY);
            }

            ctx.restore();
          }
        }
      } else if (element.type === ELEMENT_TYPES.STANDING_SECTION) {
        const width = element.width * state.scene.view.scale;
        const height = element.height * state.scene.view.scale;
        if (width > 1 && height > 1) {
          ctx.save();
          ctx.translate(screenPos.x, screenPos.y);
          ctx.rotate(element.rotation || 0);
          const x = -width / 2;
          const y = -height / 2;
          const borderRadius =
            (element.borderRadius || 8) * state.scene.view.scale;

          // Draw background image if it exists
          if (element.backgroundImage) {
            const loadedImg = loadedImages.get(element.backgroundImage);
            if (loadedImg) {
              ctx.globalAlpha = element.opacity || 1;
              ctx.drawImage(loadedImg, x, y, width, height);
            } else {
              // Load the image and draw placeholder while loading
              loadImage(element.backgroundImage);
              ctx.fillStyle = element.fillColor || "#e5e7eb";
              ctx.fillRect(x, y, width, height);
            }
          } else {
            // Draw standing section background
            ctx.fillStyle = element.fillColor || "#e5e7eb";
            ctx.fillRect(x, y, width, height);
          }

          // Draw border only if strokeWidth > 0 or if selected
          const hasBackgroundImage = element.backgroundImage;
          const strokeWidth = element.strokeWidth || 0;
          const shouldDrawBorder =
            isSelected || (!hasBackgroundImage && strokeWidth > 0);

          if (shouldDrawBorder) {
            ctx.strokeStyle = isSelected
              ? "#8d6fbf"
              : element.strokeColor || "#6b7280";
            ctx.lineWidth = isSelected ? 3 : strokeWidth;
            ctx.globalAlpha = element.opacity || 1;

            ctx.beginPath();
            ctx.roundRect(x, y, width, height, borderRadius);
            ctx.stroke();
          }

          ctx.restore();
        }

        if (element.label) {
          const labelX =
            screenPos.x + (element.labelX || 0) * state.scene.view.scale;
          const labelY =
            screenPos.y + (element.labelY || 0) * state.scene.view.scale;

          ctx.save();
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = "#000000";
          ctx.font = `${
            (element.labelFontSize || 12) * state.scene.view.scale
          }px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          if (element.labelRotation) {
            ctx.translate(labelX, labelY);
            ctx.rotate(element.labelRotation);
            ctx.fillText(element.label, 0, 0);
          } else {
            ctx.fillText(element.label, labelX, labelY);
          }

          ctx.restore();
        }
      }
    });
}

// Render seating sections separately after seats for proper z-ordering
export function renderSeatingSections(
  ctx,
  state,
  isDraggingSeats,
  dragOffset,
  worldToScreen,
  ELEMENT_TYPES,
  loadedImages = new Map(),
  loadImage = (/** @type {string=} */ _src) => null,
) {
  const { elements } = state.scene;
  const showStrokeOnly =
    state.globalSettings?.showSeatingSectionStroke === true;

  Object.values(elements)
    .filter((element) => element.type === ELEMENT_TYPES.SEATING_SECTION)
    .forEach((element) => {
      const isSelected = state.selectedIds.includes(element.id);
      let elementX = element.x;
      let elementY = element.y;
      if (isSelected && isDraggingSeats) {
        elementX += dragOffset.x;
        elementY += dragOffset.y;
      }

      // Check if this seating section has a custom path boundary
      if (
        element.pathBoundary &&
        element.pathBoundary.points &&
        element.pathBoundary.points.length > 0
      ) {
        // Render using custom path boundary (same as SVG image conversion)
        ctx.save();
        ctx.globalAlpha = 1.0;

        const points = element.pathBoundary.points;
        const curveHandles = element.pathBoundary.curveHandles || {};
        const rotation = element.rotation || 0;

        // Calculate center point for rotation
        const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
        const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

        // Adjust points for rotation and drag offset if selected
        const adjustedPoints = points.map((point) => {
          let adjustedX = point.x;
          let adjustedY = point.y;

          // Apply rotation transformation around center point
          if (rotation !== 0) {
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            const dx = adjustedX - centerX;
            const dy = adjustedY - centerY;
            adjustedX = centerX + dx * cos - dy * sin;
            adjustedY = centerY + dx * sin + dy * cos;
          }

          if (isSelected && isDraggingSeats) {
            adjustedX += dragOffset.x;
            adjustedY += dragOffset.y;
          }
          return worldToScreen(adjustedX, adjustedY);
        });

        // Draw fill
        ctx.fillStyle = element.fillColor || "transparent";
        ctx.beginPath();
        ctx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);

        // Use bezier curves if curve handles are available
        if (Object.keys(curveHandles).length > 0) {
          for (let i = 1; i < adjustedPoints.length; i++) {
            const segmentIndex = i - 1;
            const segmentHandles = curveHandles[segmentIndex];

            if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
              let cp1X = segmentHandles.cp1.x;
              let cp1Y = segmentHandles.cp1.y;
              let cp2X = segmentHandles.cp2.x;
              let cp2Y = segmentHandles.cp2.y;

              // Apply rotation transformation around center point
              if (rotation !== 0) {
                const cos = Math.cos(rotation);
                const sin = Math.sin(rotation);

                const dx1 = cp1X - centerX;
                const dy1 = cp1Y - centerY;
                cp1X = centerX + dx1 * cos - dy1 * sin;
                cp1Y = centerY + dx1 * sin + dy1 * cos;

                const dx2 = cp2X - centerX;
                const dy2 = cp2Y - centerY;
                cp2X = centerX + dx2 * cos - dy2 * sin;
                cp2Y = centerY + dx2 * sin + dy2 * cos;
              }

              if (isSelected && isDraggingSeats) {
                cp1X += dragOffset.x;
                cp1Y += dragOffset.y;
                cp2X += dragOffset.x;
                cp2Y += dragOffset.y;
              }

              const cp1Screen = worldToScreen(cp1X, cp1Y);
              const cp2Screen = worldToScreen(cp2X, cp2Y);

              ctx.bezierCurveTo(
                cp1Screen.x,
                cp1Screen.y,
                cp2Screen.x,
                cp2Screen.y,
                adjustedPoints[i].x,
                adjustedPoints[i].y,
              );
            } else {
              ctx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
            }
          }
        } else {
          // Straight lines
          for (let i = 1; i < adjustedPoints.length; i++) {
            ctx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
          }
        }

        // Close the path and fill
        ctx.closePath();
        if (
          !showStrokeOnly &&
          element.fillColor &&
          element.fillColor !== "transparent"
        ) {
          ctx.fill();
        }

        // Draw border
        const strokeWidth = element.strokeWidth || 2;
        if (showStrokeOnly || isSelected || strokeWidth > 0) {
          ctx.strokeStyle = isSelected
            ? "#8d6fbf"
            : element.strokeColor || "#6b7280";
          ctx.lineWidth = isSelected ? 3 : strokeWidth;
          ctx.stroke();
        }

        if (element.sectionName || element.label) {
          const centerScreen = worldToScreen(elementX, elementY);
          const labelX =
            centerScreen.x + (element.labelX || 0) * state.scene.view.scale;
          const labelY =
            centerScreen.y + (element.labelY || 0) * state.scene.view.scale;

          ctx.save();
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = "#000000";
          ctx.font = `${
            (element.labelFontSize || 12) * state.scene.view.scale
          }px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          if (element.labelRotation) {
            ctx.translate(labelX, labelY);
            ctx.rotate(element.labelRotation);
            ctx.fillText(element.sectionName || element.label || "", 0, 0);
          } else {
            ctx.fillText(
              element.sectionName || element.label || "",
              labelX,
              labelY,
            );
          }

          ctx.restore();
        }

        ctx.restore();
      } else {
        // Render as rectangle (original behavior for image-based conversions)
        const screenPos = worldToScreen(elementX, elementY);
        ctx.save();
        ctx.globalAlpha = 1.0; // Always fully opaque for seating sections

        const width = element.width * state.scene.view.scale;
        const height = element.height * state.scene.view.scale;
        if (width > 1 && height > 1) {
          ctx.translate(screenPos.x, screenPos.y);
          ctx.rotate(element.rotation || 0);
          const x = -width / 2;
          const y = -height / 2;
          const borderRadius =
            (element.borderRadius || 8) * state.scene.view.scale;

          // Draw background image if it exists
          if (!showStrokeOnly && element.backgroundImage) {
            const loadedImg = loadedImages.get(element.backgroundImage);
            if (loadedImg) {
              ctx.globalAlpha = 1.0;
              ctx.drawImage(loadedImg, x, y, width, height);
            } else {
              loadImage(element.backgroundImage);
              ctx.globalAlpha = 1.0;
              ctx.fillStyle = element.fillColor || "#e5e7eb";
              ctx.beginPath();
              ctx.roundRect(x, y, width, height, borderRadius);
              ctx.fill();
            }
          } else if (!showStrokeOnly) {
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = element.fillColor || "#e5e7eb";
            ctx.beginPath();
            ctx.roundRect(x, y, width, height, borderRadius);
            ctx.fill();
          }

          // Draw border for seating sections
          const strokeWidth = element.strokeWidth || 2;
          if (showStrokeOnly || isSelected || strokeWidth > 0) {
            ctx.strokeStyle = isSelected
              ? "#8d6fbf"
              : element.strokeColor || "#6b7280";
            ctx.lineWidth = isSelected
              ? 3
              : strokeWidth * state.scene.view.scale;
            ctx.globalAlpha = 1.0;

            ctx.beginPath();
            ctx.roundRect(x, y, width, height, borderRadius);
            ctx.stroke();
          }

          if (element.sectionName || element.label) {
            const labelX = (element.labelX || 0) * state.scene.view.scale;
            const labelY = (element.labelY || 0) * state.scene.view.scale;

            ctx.save();
            ctx.globalAlpha = 1.0;
            ctx.fillStyle = "#000000";
            ctx.font = `${
              (element.labelFontSize || 12) * state.scene.view.scale
            }px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";

            if (element.labelRotation) {
              ctx.translate(labelX, labelY);
              ctx.rotate(element.labelRotation);
              ctx.fillText(element.sectionName || element.label || "", 0, 0);
            } else {
              ctx.fillText(
                element.sectionName || element.label || "",
                labelX,
                labelY,
              );
            }

            ctx.restore();
          }
        }

        ctx.restore();
      }
    });
}

export function renderBoundaries(
  ctx,
  state,
  isDraggingSeats,
  dragOffset,
  worldToScreen,
  ELEMENT_TYPES,
  isDraggingHandle,
  draggedHandle,
) {
  const { elements } = state.scene;
  // Only render boundary elements (PATH type with "Boundary" or "Closed Boundary" label)
  Object.values(elements)
    .filter(
      (element) =>
        element.type === ELEMENT_TYPES.PATH &&
        (element.label === "Boundary" ||
          element.label === "Closed Boundary" ||
          element.isClosed),
    )
    .forEach((element) => {
      const isSelected = state.selectedIds.includes(element.id);
      let elementX = element.x;
      let elementY = element.y;
      if (isSelected && isDraggingSeats) {
        elementX += dragOffset.x;
        elementY += dragOffset.y;
      }
      const screenPos = worldToScreen(elementX, elementY);
      ctx.save();
      ctx.globalAlpha = element.opacity || 1;
      if (isSelected) {
        ctx.strokeStyle = "#8d6fbf";
        ctx.lineWidth = 3;
      } else {
        ctx.strokeStyle = element.strokeColor || "rgba(0, 0, 0, 0.9)";
        ctx.lineWidth = element.strokeWidth || 2;
      }

      if (element.type === ELEMENT_TYPES.PATH && element.points) {
        ctx.strokeStyle = element.strokeColor || "rgba(0, 0, 0, 0.9)";
        ctx.lineWidth =
          (element.strokeWidth || 2) * Math.max(state.scene.view.scale, 0.5);
        if (element.points.length > 1) {
          ctx.beginPath();

          // Calculate center point for scaling and rotation
          const centerX =
            element.points.reduce((sum, p) => sum + p.x, 0) /
            element.points.length;
          const centerY =
            element.points.reduce((sum, p) => sum + p.y, 0) /
            element.points.length;
          const scale = element.scale || 1.0;
          const rotation = element.rotation || 0;

          const adjustedPoints = element.points.map((point) => {
            let adjustedX = point.x;
            let adjustedY = point.y;

            // Apply scale transformation around center point
            if (scale !== 1.0) {
              adjustedX = centerX + (point.x - centerX) * scale;
              adjustedY = centerY + (point.y - centerY) * scale;
            }

            // Apply rotation transformation around center point
            if (rotation !== 0) {
              const cos = Math.cos(rotation);
              const sin = Math.sin(rotation);
              const dx = adjustedX - centerX;
              const dy = adjustedY - centerY;
              adjustedX = centerX + dx * cos - dy * sin;
              adjustedY = centerY + dx * sin + dy * cos;
            }

            if (isSelected && isDraggingSeats) {
              adjustedX += dragOffset.x;
              adjustedY += dragOffset.y;
            }
            return worldToScreen(adjustedX, adjustedY);
          });

          // Use bezier curves if curve handles are available
          if (
            element.curveHandles &&
            Object.keys(element.curveHandles).length > 0
          ) {
            ctx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);

            for (let i = 1; i < adjustedPoints.length; i++) {
              const segmentIndex = i - 1;
              const segmentHandles = element.curveHandles[segmentIndex];

              if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
                // Apply same transformations to control points
                let cp1X = segmentHandles.cp1.x;
                let cp1Y = segmentHandles.cp1.y;
                let cp2X = segmentHandles.cp2.x;
                let cp2Y = segmentHandles.cp2.y;

                // Apply scale transformation around center point
                if (scale !== 1.0) {
                  cp1X = centerX + (segmentHandles.cp1.x - centerX) * scale;
                  cp1Y = centerY + (segmentHandles.cp1.y - centerY) * scale;
                  cp2X = centerX + (segmentHandles.cp2.x - centerX) * scale;
                  cp2Y = centerY + (segmentHandles.cp2.y - centerY) * scale;
                }

                // Apply rotation transformation around center point
                if (rotation !== 0) {
                  const cos = Math.cos(rotation);
                  const sin = Math.sin(rotation);

                  const dx1 = cp1X - centerX;
                  const dy1 = cp1Y - centerY;
                  cp1X = centerX + dx1 * cos - dy1 * sin;
                  cp1Y = centerY + dx1 * sin + dy1 * cos;

                  const dx2 = cp2X - centerX;
                  const dy2 = cp2Y - centerY;
                  cp2X = centerX + dx2 * cos - dy2 * sin;
                  cp2Y = centerY + dx2 * sin + dy2 * cos;
                }

                if (isSelected && isDraggingSeats) {
                  cp1X += dragOffset.x;
                  cp1Y += dragOffset.y;
                  cp2X += dragOffset.x;
                  cp2Y += dragOffset.y;
                }

                const cp1Screen = worldToScreen(cp1X, cp1Y);
                const cp2Screen = worldToScreen(cp2X, cp2Y);

                ctx.bezierCurveTo(
                  cp1Screen.x,
                  cp1Screen.y,
                  cp2Screen.x,
                  cp2Screen.y,
                  adjustedPoints[i].x,
                  adjustedPoints[i].y,
                );
              } else {
                // Fallback to straight line if no control points
                ctx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
              }
            }

            // Close the path if it's marked as closed
            if (element.isClosed) {
              // Draw closing segment from last point back to first point
              const closingSegmentIndex = adjustedPoints.length - 1;
              const closingHandles = element.curveHandles[closingSegmentIndex];

              if (closingHandles && closingHandles.cp1 && closingHandles.cp2) {
                // Apply same transformations to closing segment control points
                let cp1X = closingHandles.cp1.x;
                let cp1Y = closingHandles.cp1.y;
                let cp2X = closingHandles.cp2.x;
                let cp2Y = closingHandles.cp2.y;

                if (scale !== 1.0) {
                  cp1X = centerX + (closingHandles.cp1.x - centerX) * scale;
                  cp1Y = centerY + (closingHandles.cp1.y - centerY) * scale;
                  cp2X = centerX + (closingHandles.cp2.x - centerX) * scale;
                  cp2Y = centerY + (closingHandles.cp2.y - centerY) * scale;
                }

                // Apply rotation transformation around center point
                if (rotation !== 0) {
                  const cos = Math.cos(rotation);
                  const sin = Math.sin(rotation);

                  const dx1 = cp1X - centerX;
                  const dy1 = cp1Y - centerY;
                  cp1X = centerX + dx1 * cos - dy1 * sin;
                  cp1Y = centerY + dx1 * sin + dy1 * cos;

                  const dx2 = cp2X - centerX;
                  const dy2 = cp2Y - centerY;
                  cp2X = centerX + dx2 * cos - dy2 * sin;
                  cp2Y = centerY + dx2 * sin + dy2 * cos;
                }

                if (isSelected && isDraggingSeats) {
                  cp1X += dragOffset.x;
                  cp1Y += dragOffset.y;
                  cp2X += dragOffset.x;
                  cp2Y += dragOffset.y;
                }

                const cp1Screen = worldToScreen(cp1X, cp1Y);
                const cp2Screen = worldToScreen(cp2X, cp2Y);

                ctx.bezierCurveTo(
                  cp1Screen.x,
                  cp1Screen.y,
                  cp2Screen.x,
                  cp2Screen.y,
                  adjustedPoints[0].x,
                  adjustedPoints[0].y,
                );
              } else {
                // Straight line back to start
                ctx.lineTo(adjustedPoints[0].x, adjustedPoints[0].y);
              }
              ctx.closePath();
            }
          } else if (adjustedPoints.length > 3) {
            // Legacy quadratic curve rendering for old paths without curve handles
            ctx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);
            for (let i = 1; i < adjustedPoints.length - 1; i++) {
              const xc = (adjustedPoints[i].x + adjustedPoints[i + 1].x) / 2;
              const yc = (adjustedPoints[i].y + adjustedPoints[i + 1].y) / 2;
              ctx.quadraticCurveTo(
                adjustedPoints[i].x,
                adjustedPoints[i].y,
                xc,
                yc,
              );
            }
            if (adjustedPoints.length > 1) {
              const lastPoint = adjustedPoints[adjustedPoints.length - 1];
              const secondLastPoint = adjustedPoints[adjustedPoints.length - 2];
              ctx.quadraticCurveTo(
                secondLastPoint.x,
                secondLastPoint.y,
                lastPoint.x,
                lastPoint.y,
              );
            }
          } else {
            // Straight lines for simple paths
            ctx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);
            for (let i = 1; i < adjustedPoints.length; i++) {
              ctx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
            }
          }

          // Fill closed paths if fillColor is set
          if (
            element.isClosed &&
            element.fillColor &&
            element.fillColor !== "transparent"
          ) {
            ctx.fillStyle = element.fillColor;
            ctx.fill();
          }

          ctx.stroke();

          // Draw control points and handles for selected paths
          if (isSelected && element.curveHandles) {
            Object.entries(element.curveHandles).forEach(
              ([segmentIndex, handles]) => {
                const segmentIdx = parseInt(segmentIndex);

                if (handles.cp1) {
                  let cp1X = handles.cp1.x;
                  let cp1Y = handles.cp1.y;

                  // Apply same transformations as above
                  if (scale !== 1.0) {
                    cp1X = centerX + (handles.cp1.x - centerX) * scale;
                    cp1Y = centerY + (handles.cp1.y - centerY) * scale;
                  }

                  // Apply rotation transformation
                  if (rotation !== 0) {
                    const cos = Math.cos(rotation);
                    const sin = Math.sin(rotation);
                    const dx = cp1X - centerX;
                    const dy = cp1Y - centerY;
                    cp1X = centerX + dx * cos - dy * sin;
                    cp1Y = centerY + dx * sin + dy * cos;
                  }

                  if (isDraggingSeats) {
                    cp1X += dragOffset.x;
                    cp1Y += dragOffset.y;
                  }

                  const cp1Screen = worldToScreen(cp1X, cp1Y);
                  const startPointScreen = adjustedPoints[segmentIdx];

                  // Draw control line
                  ctx.strokeStyle = "#9ca3af";
                  ctx.lineWidth = 1;
                  ctx.setLineDash([2, 2]);
                  ctx.globalAlpha = 0.6;
                  ctx.beginPath();
                  ctx.moveTo(startPointScreen.x, startPointScreen.y);
                  ctx.lineTo(cp1Screen.x, cp1Screen.y);
                  ctx.stroke();

                  // Draw handle (larger for easier clicking)
                  ctx.fillStyle =
                    isDraggingHandle &&
                    draggedHandle?.segmentIndex === segmentIdx &&
                    draggedHandle?.handleType === "cp1"
                      ? "#ef4444"
                      : "#6b7280";
                  ctx.globalAlpha = 1;
                  ctx.beginPath();
                  ctx.arc(cp1Screen.x, cp1Screen.y, 6, 0, 2 * Math.PI); // Larger handle (6px instead of 4px)
                  ctx.fill();

                  ctx.strokeStyle = "#ffffff";
                  ctx.lineWidth = 2;
                  ctx.stroke();
                }

                if (handles.cp2) {
                  let cp2X = handles.cp2.x;
                  let cp2Y = handles.cp2.y;

                  // Apply same transformations as above
                  if (scale !== 1.0) {
                    cp2X = centerX + (handles.cp2.x - centerX) * scale;
                    cp2Y = centerY + (handles.cp2.y - centerY) * scale;
                  }

                  // Apply rotation transformation
                  if (rotation !== 0) {
                    const cos = Math.cos(rotation);
                    const sin = Math.sin(rotation);
                    const dx = cp2X - centerX;
                    const dy = cp2Y - centerY;
                    cp2X = centerX + dx * cos - dy * sin;
                    cp2Y = centerY + dx * sin + dy * cos;
                  }

                  if (isDraggingSeats) {
                    cp2X += dragOffset.x;
                    cp2Y += dragOffset.y;
                  }

                  const cp2Screen = worldToScreen(cp2X, cp2Y);
                  const endPointScreen = adjustedPoints[segmentIdx + 1];

                  // Draw control line
                  ctx.strokeStyle = "#9ca3af";
                  ctx.lineWidth = 1;
                  ctx.setLineDash([2, 2]);
                  ctx.globalAlpha = 0.6;
                  ctx.beginPath();
                  ctx.moveTo(cp2Screen.x, cp2Screen.y);
                  ctx.lineTo(endPointScreen.x, endPointScreen.y);
                  ctx.stroke();

                  // Draw handle (larger for easier clicking)
                  ctx.fillStyle =
                    isDraggingHandle &&
                    draggedHandle?.segmentIndex === segmentIdx &&
                    draggedHandle?.handleType === "cp2"
                      ? "#ef4444"
                      : "#6b7280";
                  ctx.globalAlpha = 1;
                  ctx.beginPath();
                  ctx.arc(cp2Screen.x, cp2Screen.y, 6, 0, 2 * Math.PI); // Larger handle (6px instead of 4px)
                  ctx.fill();

                  ctx.strokeStyle = "#ffffff";
                  ctx.lineWidth = 2;
                  ctx.stroke();
                }
              },
            );
          }

          if (isSelected) {
            ctx.fillStyle = "#ff0000";
            adjustedPoints.forEach((point) => {
              ctx.beginPath();
              ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
              ctx.fill();
            });
          }
        }
      }

      ctx.restore();
    });
}

export function renderSectionBoundaries(
  ctx,
  state,
  isDraggingSeats,
  dragOffset,
  worldToScreen,
  ELEMENT_TYPES,
  categoryMap = new Map(),
) {
  const { elements } = state.scene;
  const currentScale = state.scene.view.scale;

  // Only render section boundary elements
  Object.values(elements)
    .filter((element) => element.type === ELEMENT_TYPES.SECTION_BOUNDARY)
    .forEach((element) => {
      const isSelected = state.selectedIds.includes(element.id);
      let elementX = element.x;
      let elementY = element.y;

      if (isSelected && isDraggingSeats) {
        elementX += dragOffset.x;
        elementY += dragOffset.y;
      }

      const screenPos = worldToScreen(elementX, elementY);
      ctx.save();
      ctx.globalAlpha = element.opacity || 1;

      // Check if we should show as solid area based on zoom level
      const shouldShowAsSolid =
        element.showAsSolid && currentScale < (element.zoomThreshold || 0.5);

      if (element.points && element.points.length > 2) {
        // Calculate center point for transformations
        const centerX =
          element.points.reduce((sum, p) => sum + p.x, 0) /
          element.points.length;
        const centerY =
          element.points.reduce((sum, p) => sum + p.y, 0) /
          element.points.length;
        const scale = element.scale || 1.0;
        const rotation = element.rotation || 0;

        const adjustedPoints = element.points.map((point) => {
          let adjustedX = point.x;
          let adjustedY = point.y;

          // Apply scale transformation around center point
          if (scale !== 1.0) {
            adjustedX = centerX + (point.x - centerX) * scale;
            adjustedY = centerY + (point.y - centerY) * scale;
          }

          // Apply rotation transformation around center point
          if (rotation !== 0) {
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            const dx = adjustedX - centerX;
            const dy = adjustedY - centerY;
            adjustedX = centerX + dx * cos - dy * sin;
            adjustedY = centerY + dx * sin + dy * cos;
          }

          if (isSelected && isDraggingSeats) {
            adjustedX += dragOffset.x;
            adjustedY += dragOffset.y;
          }
          return worldToScreen(adjustedX, adjustedY);
        });

        // Get category color for the section
        const category = categoryMap.get(element.categoryId);
        const fillColor =
          category?.color || element.fillColor || "rgba(0, 0, 0, 0.1)";
        const strokeColor =
          category?.color || element.strokeColor || "rgba(0, 0, 0, 0.9)";

        if (shouldShowAsSolid) {
          // Render as solid filled area (like SILVER, PLATINUM sections in the image)
          ctx.fillStyle = fillColor;
          ctx.beginPath();

          // Use bezier curves if available, otherwise straight lines
          if (
            element.curveHandles &&
            Object.keys(element.curveHandles).length > 0
          ) {
            ctx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);

            for (let i = 1; i < adjustedPoints.length; i++) {
              const segmentIndex = i - 1;
              const segmentHandles = element.curveHandles[segmentIndex];

              if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
                let cp1X = segmentHandles.cp1.x;
                let cp1Y = segmentHandles.cp1.y;
                let cp2X = segmentHandles.cp2.x;
                let cp2Y = segmentHandles.cp2.y;

                // Apply scale transformation around center point
                if (scale !== 1.0) {
                  cp1X = centerX + (segmentHandles.cp1.x - centerX) * scale;
                  cp1Y = centerY + (segmentHandles.cp1.y - centerY) * scale;
                  cp2X = centerX + (segmentHandles.cp2.x - centerX) * scale;
                  cp2Y = centerY + (segmentHandles.cp2.y - centerY) * scale;
                }

                // Apply rotation transformation around center point
                if (rotation !== 0) {
                  const cos = Math.cos(rotation);
                  const sin = Math.sin(rotation);

                  const dx1 = cp1X - centerX;
                  const dy1 = cp1Y - centerY;
                  cp1X = centerX + dx1 * cos - dy1 * sin;
                  cp1Y = centerY + dx1 * sin + dy1 * cos;

                  const dx2 = cp2X - centerX;
                  const dy2 = cp2Y - centerY;
                  cp2X = centerX + dx2 * cos - dy2 * sin;
                  cp2Y = centerY + dx2 * sin + dy2 * cos;
                }

                if (isSelected && isDraggingSeats) {
                  cp1X += dragOffset.x;
                  cp1Y += dragOffset.y;
                  cp2X += dragOffset.x;
                  cp2Y += dragOffset.y;
                }

                const cp1Screen = worldToScreen(cp1X, cp1Y);
                const cp2Screen = worldToScreen(cp2X, cp2Y);

                ctx.bezierCurveTo(
                  cp1Screen.x,
                  cp1Screen.y,
                  cp2Screen.x,
                  cp2Screen.y,
                  adjustedPoints[i].x,
                  adjustedPoints[i].y,
                );
              } else {
                ctx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
              }
            }
          } else {
            // Simple straight lines
            ctx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);
            for (let i = 1; i < adjustedPoints.length; i++) {
              ctx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
            }
          }

          ctx.closePath();
          ctx.fill();

          // Add section label in the center
          if (element.sectionName) {
            const centerScreen = worldToScreen(centerX, centerY);
            ctx.fillStyle = "#ffffff";
            ctx.font = `${Math.max(12, 16 * currentScale)}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(element.sectionName, centerScreen.x, centerScreen.y);
          }
        } else {
          // Render as outline with individual seats visible
          ctx.strokeStyle = isSelected ? "#8d6fbf" : strokeColor;
          ctx.lineWidth =
            (element.strokeWidth || 2) * Math.max(currentScale, 0.5);
          ctx.beginPath();

          // Use bezier curves if available, otherwise straight lines
          if (
            element.curveHandles &&
            Object.keys(element.curveHandles).length > 0
          ) {
            ctx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);

            for (let i = 1; i < adjustedPoints.length; i++) {
              const segmentIndex = i - 1;
              const segmentHandles = element.curveHandles[segmentIndex];

              if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
                let cp1X = segmentHandles.cp1.x;
                let cp1Y = segmentHandles.cp1.y;
                let cp2X = segmentHandles.cp2.x;
                let cp2Y = segmentHandles.cp2.y;

                // Apply scale transformation around center point
                if (scale !== 1.0) {
                  cp1X = centerX + (segmentHandles.cp1.x - centerX) * scale;
                  cp1Y = centerY + (segmentHandles.cp1.y - centerY) * scale;
                  cp2X = centerX + (segmentHandles.cp2.x - centerX) * scale;
                  cp2Y = centerY + (segmentHandles.cp2.y - centerY) * scale;
                }

                // Apply rotation transformation around center point
                if (rotation !== 0) {
                  const cos = Math.cos(rotation);
                  const sin = Math.sin(rotation);

                  const dx1 = cp1X - centerX;
                  const dy1 = cp1Y - centerY;
                  cp1X = centerX + dx1 * cos - dy1 * sin;
                  cp1Y = centerY + dx1 * sin + dy1 * cos;

                  const dx2 = cp2X - centerX;
                  const dy2 = cp2Y - centerY;
                  cp2X = centerX + dx2 * cos - dy2 * sin;
                  cp2Y = centerY + dx2 * sin + dy2 * cos;
                }

                if (isSelected && isDraggingSeats) {
                  cp1X += dragOffset.x;
                  cp1Y += dragOffset.y;
                  cp2X += dragOffset.x;
                  cp2Y += dragOffset.y;
                }

                const cp1Screen = worldToScreen(cp1X, cp1Y);
                const cp2Screen = worldToScreen(cp2X, cp2Y);

                ctx.bezierCurveTo(
                  cp1Screen.x,
                  cp1Screen.y,
                  cp2Screen.x,
                  cp2Screen.y,
                  adjustedPoints[i].x,
                  adjustedPoints[i].y,
                );
              } else {
                ctx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
              }
            }
          } else {
            // Simple straight lines
            ctx.moveTo(adjustedPoints[0].x, adjustedPoints[0].y);
            for (let i = 1; i < adjustedPoints.length; i++) {
              ctx.lineTo(adjustedPoints[i].x, adjustedPoints[i].y);
            }
          }

          ctx.closePath();
          ctx.stroke();
        }
      }

      ctx.restore();
    });
}

/**
 * @param {*} ctx
 * @param {*} state
 * @param {*} isDraggingSeats
 * @param {*} dragOffset
 * @param {*} worldToScreen
 * @param {*} ELEMENT_TYPES
 * @param {*} [textSnapPosition]
 * @param {*} [isDraggingHandle]
 * @param {*} [draggedHandle]
 */
export function renderTextElements(
  ctx,
  state,
  isDraggingSeats,
  dragOffset,
  worldToScreen,
  ELEMENT_TYPES,
  textSnapPosition = null,
  isDraggingHandle = false,
  draggedHandle = null,
) {
  const { elements } = state.scene;
  Object.values(elements)
    .filter((element) => element.type === ELEMENT_TYPES.TEXT)
    .forEach((element) => {
      const isSelected = state.selectedIds.includes(element.id);
      let elementX = element.x;
      let elementY = element.y;
      let isSnapped = false;

      if (isSelected && isDraggingSeats) {
        elementX += dragOffset.x;
        elementY += dragOffset.y;

        // Check if this text element is snapped
        if (textSnapPosition && textSnapPosition.isSnapped) {
          isSnapped = true;
        }
      }

      const screenPos = worldToScreen(elementX, elementY);
      ctx.save();
      ctx.globalAlpha = element.opacity || 1;

      ctx.translate(screenPos.x, screenPos.y);
      const rotation = element.rotation || 0;
      if (rotation !== 0) {
        ctx.rotate(rotation);
      }

      // Draw snap indicator if snapped
      if (isSnapped) {
        ctx.strokeStyle = "#00ff00";
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.8;

        const crosshairSize = 20;
        ctx.beginPath();
        ctx.moveTo(-crosshairSize, 0);
        ctx.lineTo(crosshairSize, 0);
        ctx.moveTo(0, -crosshairSize);
        ctx.lineTo(0, crosshairSize);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.setLineDash([]);
      }

      ctx.fillStyle = element.fillColor || "#000000";
      ctx.font = `${element.fontStyle || "normal"} ${
        element.fontWeight || "normal"
      } ${(element.fontSize || 16) * state.scene.view.scale}px ${
        element.fontFamily || "Arial"
      }`;
      ctx.textAlign = element.textAlign || "center";
      ctx.textBaseline = "middle";

      if (isSnapped) {
        ctx.fillStyle = "#00ff00";
      }
      ctx.fillText(element.text || "Text", 0, 0);

      if (element.textDecoration === "underline") {
        const metrics = ctx.measureText(element.text || "Text");
        const textWidth = metrics.width;
        const underlineY =
          (element.fontSize || 16) * state.scene.view.scale * 0.1;

        let underlineStartX;
        if (element.textAlign === "left") {
          underlineStartX = 0;
        } else if (element.textAlign === "right") {
          underlineStartX = -textWidth;
        } else {
          underlineStartX = -textWidth / 2;
        }

        ctx.beginPath();
        ctx.moveTo(underlineStartX, underlineY);
        ctx.lineTo(underlineStartX + textWidth, underlineY);
        ctx.lineWidth = Math.max(
          1,
          (element.fontSize || 16) * state.scene.view.scale * 0.05,
        );
        ctx.strokeStyle = element.fillColor || "#000000";
        ctx.stroke();
      }

      ctx.restore();

      // Draw bounding box and handles for selected text
      if (isSelected) {
        renderTextHandles(
          ctx,
          element,
          elementX,
          elementY,
          worldToScreen,
          state.scene.view.scale,
          isDraggingHandle,
          draggedHandle,
        );
      }
    });
}

export function renderRectangleGrid(
  ctx,
  rectangle,
  worldToScreen,
  scale,
  gridSize = 20,
) {
  if (!rectangle) return;

  const rectLeft = rectangle.x - rectangle.width / 2;
  const rectRight = rectangle.x + rectangle.width / 2;
  const rectTop = rectangle.y - rectangle.height / 2;
  const rectBottom = rectangle.y + rectangle.height / 2;

  // Get screen coordinates of rectangle corners
  const topLeft = worldToScreen(rectLeft, rectTop);
  const topRight = worldToScreen(rectRight, rectTop);
  const bottomLeft = worldToScreen(rectLeft, rectBottom);
  const bottomRight = worldToScreen(rectRight, rectBottom);

  const screenWidth = Math.abs(topRight.x - topLeft.x);
  const screenHeight = Math.abs(bottomLeft.y - topLeft.y);

  if (screenWidth < 10 || screenHeight < 10) return;

  ctx.save();
  ctx.strokeStyle = "#00ff00";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3;
  ctx.setLineDash([2, 2]);

  // Draw vertical grid lines
  const worldGridSize = gridSize;
  for (let worldX = rectLeft; worldX <= rectRight; worldX += worldGridSize) {
    const screenX = worldToScreen(worldX, rectangle.y).x;
    ctx.beginPath();
    ctx.moveTo(screenX, topLeft.y);
    ctx.lineTo(screenX, bottomLeft.y);
    ctx.stroke();
  }

  // Draw horizontal grid lines
  for (let worldY = rectTop; worldY <= rectBottom; worldY += worldGridSize) {
    const screenY = worldToScreen(rectangle.x, worldY).y;
    ctx.beginPath();
    ctx.moveTo(topLeft.x, screenY);
    ctx.lineTo(topRight.x, screenY);
    ctx.stroke();
  }

  // Draw center lines (horizontal and vertical)
  const centerScreenX = worldToScreen(rectangle.x, rectangle.y).x;
  const centerScreenY = worldToScreen(rectangle.x, rectangle.y).y;

  ctx.strokeStyle = "#ff0000";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.globalAlpha = 0.6;

  // Vertical center line
  ctx.beginPath();
  ctx.moveTo(centerScreenX, topLeft.y);
  ctx.lineTo(centerScreenX, bottomLeft.y);
  ctx.stroke();

  // Horizontal center line
  ctx.beginPath();
  ctx.moveTo(topLeft.x, centerScreenY);
  ctx.lineTo(topRight.x, centerScreenY);
  ctx.stroke();

  // Draw center point
  ctx.fillStyle = "#ff0000";
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(centerScreenX, centerScreenY, 4, 0, 2 * Math.PI);
  ctx.fill();

  ctx.restore();
}

export function isTextInsideRectangle(
  textElement,
  rectangle,
  dragOffset = { x: 0, y: 0 },
) {
  if (!textElement || !rectangle) return false;

  const textX = textElement.x + dragOffset.x;
  const textY = textElement.y + dragOffset.y;
  const rectLeft = rectangle.x - rectangle.width / 2;
  const rectRight = rectangle.x + rectangle.width / 2;
  const rectTop = rectangle.y - rectangle.height / 2;
  const rectBottom = rectangle.y + rectangle.height / 2;

  return (
    textX >= rectLeft &&
    textX <= rectRight &&
    textY >= rectTop &&
    textY <= rectBottom
  );
}

export function calculateSnapPosition(
  textElement,
  rectangle,
  dragOffset = { x: 0, y: 0 },
  worldToScreen = /** @type {((x: number, y: number) => { x: number, y: number }) | null} */ (
    null
  ),
) {
  if (!textElement || !rectangle || !worldToScreen)
    return {
      x: textElement.x + dragOffset.x,
      y: textElement.y + dragOffset.y,
      isSnapped: false,
    };

  const textX = textElement.x + dragOffset.x;
  const textY = textElement.y + dragOffset.y;
  const rectCenterX = rectangle.x;
  const rectCenterY = rectangle.y;

  // Convert to screen coordinates for threshold calculation
  const textScreen = worldToScreen(textX, textY);
  const rectCenterScreen = worldToScreen(rectCenterX, rectCenterY);

  const snapThreshold = 15; // pixels
  let snappedX = textX;
  let snappedY = textY;
  let isSnapped = false;

  // Check horizontal snap to center
  if (Math.abs(textScreen.x - rectCenterScreen.x) <= snapThreshold) {
    snappedX = rectCenterX;
    isSnapped = true;
  }

  // Check vertical snap to center
  if (Math.abs(textScreen.y - rectCenterScreen.y) <= snapThreshold) {
    snappedY = rectCenterY;
    isSnapped = true;
  }

  return { x: snappedX, y: snappedY, isSnapped };
}

export function renderImageElements(
  ctx,
  state,
  isDraggingSeats,
  dragOffset,
  worldToScreen,
  loadedImages,
  loadImage,
  ELEMENT_TYPES,
  isDraggingHandle = false,
  draggedHandle = null,
) {
  const { elements } = state.scene;
  Object.values(elements)
    .filter((element) => element.type === ELEMENT_TYPES.IMAGE)
    .forEach((element) => {
      const isSelected = state.selectedIds.includes(element.id);
      let elementX = element.x;
      let elementY = element.y;
      if (isSelected && isDraggingSeats && !element.locked) {
        elementX += dragOffset.x;
        elementY += dragOffset.y;
      }
      const screenPos = worldToScreen(elementX, elementY);
      const width = element.width * state.scene.view.scale;
      const height = element.height * state.scene.view.scale;
      if (width > 1 && height > 1 && element.src) {
        loadImage(element.src);
        const img = loadedImages.get(element.src);
        if (img) {
          ctx.save();
          ctx.globalAlpha = element.opacity || 1;
          ctx.drawImage(
            img,
            screenPos.x - width / 2,
            screenPos.y - height / 2,
            width,
            height,
          );
          if (isSelected) {
            // Use different styling for locked vs unlocked images
            if (element.locked) {
              ctx.strokeStyle = "#dc2626"; // Red border for locked images
              ctx.lineWidth = 4;
              ctx.setLineDash([5, 3]); // Dashed line for locked images
            } else {
              ctx.strokeStyle = "#8d6fbf"; // Purple border for unlocked images
              ctx.lineWidth = 3;
              ctx.setLineDash([]); // Solid line for unlocked images
            }
            ctx.strokeRect(
              screenPos.x - width / 2,
              screenPos.y - height / 2,
              width,
              height,
            );

            // Add lock icon for locked images
            if (element.locked && state.scene.view.scale > 0.5) {
              ctx.fillStyle = "#dc2626";
              ctx.font = `${Math.min(16, width * 0.15)}px Arial`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillText(
                "🔒",
                screenPos.x + width / 2 - 15,
                screenPos.y - height / 2 + 15,
              );
            }

            // Render resize handles for unlocked images
            if (!element.locked) {
              renderImageHandles(
                ctx,
                element,
                elementX,
                elementY,
                worldToScreen,
                state.scene.view.scale,
                isDraggingHandle,
                draggedHandle,
              );
            }
          } else if (element.locked && state.scene.view.scale > 0.3) {
            // Show lock icon for non-selected locked images too
            ctx.fillStyle = "#dc2626";
            ctx.font = `${Math.min(12, width * 0.1)}px Arial`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(
              "🔒",
              screenPos.x + width / 2 - 10,
              screenPos.y - height / 2 + 10,
            );
          }
          ctx.restore();
        }
      }
    });
}

export function renderRows(ctx, state, worldToScreen) {
  // Temporarily hide row geometry lines
  return;

  const { rows, seats, sections } = state.scene;
  Object.values(rows).forEach((row) => {
    const rowSeats = Object.values(seats).filter(
      (seat) => seat.rowId === row.id,
    );
    const selectedSeatsInRow = rowSeats.filter((seat) =>
      state.selectedIds.includes(seat.id),
    );
    const isRowSelected = selectedSeatsInRow.length > 0;
    const isEntireRowSelected = selectedSeatsInRow.length === rowSeats.length;
    ctx.save();
    if (isEntireRowSelected) {
      ctx.strokeStyle = "#8d6fbf";
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
    } else if (isRowSelected) {
      ctx.strokeStyle = "#6c1c8c";
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
    } else {
      ctx.strokeStyle = "#999999";
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
    }
    const section = sections[row.sectionId];
    let geometry = row.geometry;
    if (section && section.transform) {
      const sectionX = section.transform.x || 0;
      const sectionY = section.transform.y || 0;
      const sectionRotation = section.transform.rotation || 0;
      if (geometry.kind === "line") {
        const cos = Math.cos(sectionRotation);
        const sin = Math.sin(sectionRotation);
        const p1RotatedX = geometry.p1.x * cos - geometry.p1.y * sin + sectionX;
        const p1RotatedY = geometry.p1.x * sin + geometry.p1.y * cos + sectionY;
        const p2RotatedX = geometry.p2.x * cos - geometry.p2.y * sin + sectionX;
        const p2RotatedY = geometry.p2.x * sin + geometry.p2.y * cos + sectionY;
        const p1 = worldToScreen(p1RotatedX, p1RotatedY);
        const p2 = worldToScreen(p2RotatedX, p2RotatedY);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      } else if (geometry.kind === "arc") {
        const centerRotatedX =
          geometry.center.x * Math.cos(sectionRotation) -
          geometry.center.y * Math.sin(sectionRotation) +
          sectionX;
        const centerRotatedY =
          geometry.center.x * Math.sin(sectionRotation) +
          geometry.center.y * Math.cos(sectionRotation) +
          sectionY;
        const center = worldToScreen(centerRotatedX, centerRotatedY);
        const radiusX = geometry.radiusX * state.scene.view.scale;
        const radiusY = geometry.radiusY * state.scene.view.scale;
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.rotate(sectionRotation);
        ctx.scale(radiusX / radiusY, 1);
        ctx.beginPath();
        ctx.arc(0, 0, radiusY, geometry.startAngle, geometry.endAngle);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      if (geometry.kind === "line") {
        const p1 = worldToScreen(geometry.p1.x, geometry.p1.y);
        const p2 = worldToScreen(geometry.p2.x, geometry.p2.y);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      } else if (geometry.kind === "arc") {
        const center = worldToScreen(geometry.center.x, geometry.center.y);
        const radiusX = geometry.radiusX * state.scene.view.scale;
        const radiusY = geometry.radiusY * state.scene.view.scale;
        ctx.save();
        ctx.translate(center.x, center.y);
        ctx.scale(radiusX / radiusY, 1);
        ctx.beginPath();
        ctx.arc(0, 0, radiusY, geometry.startAngle, geometry.endAngle);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  });
}

export function renderSelectionRect(ctx, selectionRect) {
  if (!selectionRect) return;
  ctx.save();
  ctx.strokeStyle = "#8d6fbf";
  ctx.fillStyle = "rgba(141, 111, 191, 0.1)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const width = selectionRect.endX - selectionRect.startX;
  const height = selectionRect.endY - selectionRect.startY;
  ctx.fillRect(selectionRect.startX, selectionRect.startY, width, height);
  ctx.strokeRect(selectionRect.startX, selectionRect.startY, width, height);
  ctx.restore();
}

export function renderDrawingPreview(
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
) {
  if (isDrawingElement && pathPoints.length > 0) {
    ctx.save();

    // Draw the path with bezier curves
    if (pathPoints.length > 1) {
      ctx.strokeStyle = "#6b7280";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.globalAlpha = 0.8;

      ctx.beginPath();
      const screenPoints = pathPoints.map((point) =>
        worldToScreen(point.x, point.y),
      );

      // Start from first point
      ctx.moveTo(screenPoints[0].x, screenPoints[0].y);

      // Draw bezier curves between points
      for (let i = 1; i < screenPoints.length; i++) {
        const segmentIndex = i - 1;
        const segmentHandles = curveHandles[segmentIndex];

        if (segmentHandles && segmentHandles.cp1 && segmentHandles.cp2) {
          // Use bezier curve with control points
          const cp1Screen = worldToScreen(
            segmentHandles.cp1.x,
            segmentHandles.cp1.y,
          );
          const cp2Screen = worldToScreen(
            segmentHandles.cp2.x,
            segmentHandles.cp2.y,
          );
          ctx.bezierCurveTo(
            cp1Screen.x,
            cp1Screen.y,
            cp2Screen.x,
            cp2Screen.y,
            screenPoints[i].x,
            screenPoints[i].y,
          );
        } else {
          // Fallback to straight line if no control points
          ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
        }
      }

      ctx.stroke();
    }

    // Draw curve handles and control lines
    Object.entries(curveHandles).forEach(([segmentIndex, handles]) => {
      const segmentIdx = parseInt(segmentIndex);

      if (handles.cp1) {
        const cp1Screen = worldToScreen(handles.cp1.x, handles.cp1.y);
        const startPointScreen = worldToScreen(
          pathPoints[segmentIdx].x,
          pathPoints[segmentIdx].y,
        );

        // Draw control line from point to handle
        ctx.strokeStyle = "#9ca3af";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(startPointScreen.x, startPointScreen.y);
        ctx.lineTo(cp1Screen.x, cp1Screen.y);
        ctx.stroke();

        // Draw handle
        ctx.fillStyle =
          isDraggingHandle &&
          draggedHandle?.segmentIndex === segmentIdx &&
          draggedHandle?.handleType === "cp1"
            ? "#ef4444"
            : "#6b7280";
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(cp1Screen.x, cp1Screen.y, 4, 0, 2 * Math.PI);
        ctx.fill();

        // Draw handle outline
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (handles.cp2) {
        const cp2Screen = worldToScreen(handles.cp2.x, handles.cp2.y);
        const endPointScreen = worldToScreen(
          pathPoints[segmentIdx + 1].x,
          pathPoints[segmentIdx + 1].y,
        );

        // Draw control line from handle to point
        ctx.strokeStyle = "#9ca3af";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(cp2Screen.x, cp2Screen.y);
        ctx.lineTo(endPointScreen.x, endPointScreen.y);
        ctx.stroke();

        // Draw handle
        ctx.fillStyle =
          isDraggingHandle &&
          draggedHandle?.segmentIndex === segmentIdx &&
          draggedHandle?.handleType === "cp2"
            ? "#ef4444"
            : "#6b7280";
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(cp2Screen.x, cp2Screen.y, 4, 0, 2 * Math.PI);
        ctx.fill();

        // Draw handle outline
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw path points
    ctx.globalAlpha = 1;
    pathPoints.forEach((point, index) => {
      const pointScreen = worldToScreen(point.x, point.y);
      const isFirstPoint = index === 0;

      // Highlight first point when path is closeable
      if (isFirstPoint && isPathCloseable && pathPoints.length >= 3) {
        // Draw larger glowing circle for first point when closeable
        ctx.fillStyle = "#10b981"; // Green color
        ctx.beginPath();
        ctx.arc(pointScreen.x, pointScreen.y, 8, 0, 2 * Math.PI);
        ctx.fill();

        // Add white outline
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Add pulsing effect with semi-transparent outer ring
        ctx.fillStyle = "rgba(16, 185, 129, 0.3)";
        ctx.beginPath();
        ctx.arc(pointScreen.x, pointScreen.y, 12, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        // Normal point rendering
        ctx.fillStyle = isFirstPoint ? "#3b82f6" : "#6b7280"; // Blue for first point, gray for others
        ctx.beginPath();
        ctx.arc(pointScreen.x, pointScreen.y, 4, 0, 2 * Math.PI);
        ctx.fill();

        // Add white outline for first point
        if (isFirstPoint) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    });

    // Draw preview line from last point to cursor (with snapping)
    if (pathPreviewPoint && !isDraggingHandle) {
      const lastPoint = pathPoints[pathPoints.length - 1];
      const lastPointScreen = worldToScreen(lastPoint.x, lastPoint.y);
      const previewPointScreen = worldToScreen(
        pathPreviewPoint.x,
        pathPreviewPoint.y,
      );

      const isSnapping = pathSnapType !== null;

      // If axis snapping, draw alignment guide lines
      if (
        pathSnapType === "x-axis" ||
        pathSnapType === "y-axis" ||
        pathSnapType === "xy-axis"
      ) {
        // Draw X-axis alignment guide (vertical line)
        if (
          (pathSnapType === "x-axis" || pathSnapType === "xy-axis") &&
          pathSnapPoints?.xSnapPoint
        ) {
          const xAlignedPointScreen = worldToScreen(
            pathSnapPoints.xSnapPoint.x,
            pathSnapPoints.xSnapPoint.y,
          );

          ctx.strokeStyle = "#3b82f6"; // Blue for axis alignment
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(xAlignedPointScreen.x, xAlignedPointScreen.y);
          ctx.lineTo(previewPointScreen.x, xAlignedPointScreen.y);
          ctx.lineTo(previewPointScreen.x, previewPointScreen.y);
          ctx.stroke();
        }

        // Draw Y-axis alignment guide (horizontal line)
        if (
          (pathSnapType === "y-axis" || pathSnapType === "xy-axis") &&
          pathSnapPoints?.ySnapPoint
        ) {
          const yAlignedPointScreen = worldToScreen(
            pathSnapPoints.ySnapPoint.x,
            pathSnapPoints.ySnapPoint.y,
          );

          ctx.strokeStyle = "#3b82f6"; // Blue for axis alignment
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(yAlignedPointScreen.x, yAlignedPointScreen.y);
          ctx.lineTo(yAlignedPointScreen.x, previewPointScreen.y);
          ctx.lineTo(previewPointScreen.x, previewPointScreen.y);
          ctx.stroke();
        }

        // For xy-axis, also highlight the intersection point if both snap to same point
        if (
          pathSnapType === "xy-axis" &&
          pathSnapPoints?.xSnapPoint &&
          pathSnapPoints?.ySnapPoint
        ) {
          // Check if both snap points are the same (perfect grid intersection)
          if (
            Math.abs(
              pathSnapPoints.xSnapPoint.x - pathSnapPoints.ySnapPoint.x,
            ) < 0.1 &&
            Math.abs(
              pathSnapPoints.xSnapPoint.y - pathSnapPoints.ySnapPoint.y,
            ) < 0.1
          ) {
            const gridPointScreen = worldToScreen(
              pathSnapPoints.xSnapPoint.x,
              pathSnapPoints.xSnapPoint.y,
            );

            // Draw a special marker at the grid intersection point
            ctx.fillStyle = "#3b82f6";
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.arc(gridPointScreen.x, gridPointScreen.y, 8, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }

      // Draw preview line
      ctx.strokeStyle = isSnapping ? "#10b981" : "#9ca3af"; // Green if snapped, gray otherwise
      ctx.lineWidth = isSnapping ? 2 : 1;
      ctx.setLineDash([5, 5]);
      ctx.globalAlpha = isSnapping ? 0.9 : 0.6;
      ctx.beginPath();
      ctx.moveTo(lastPointScreen.x, lastPointScreen.y);
      ctx.lineTo(previewPointScreen.x, previewPointScreen.y);
      ctx.stroke();

      // Draw preview point at cursor
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = isSnapping ? "#10b981" : "#9ca3af";
      ctx.beginPath();
      ctx.arc(previewPointScreen.x, previewPointScreen.y, 4, 0, 2 * Math.PI);
      ctx.fill();

      // Add white outline
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Show snap indicator with appropriate label
      if (isSnapping) {
        let labelText = "";
        if (pathSnapAngle !== null) {
          labelText = `${pathSnapAngle}°`;
        } else if (pathSnapType === "xy-axis") {
          labelText = "Grid Snap";
        } else if (pathSnapType === "x-axis") {
          labelText = "X-Aligned";
        } else if (pathSnapType === "y-axis") {
          labelText = "Y-Aligned";
        }

        if (labelText) {
          ctx.font = "12px monospace";
          ctx.fillStyle = pathSnapType === "angle" ? "#10b981" : "#3b82f6";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          const midX = (lastPointScreen.x + previewPointScreen.x) / 2;
          const midY = (lastPointScreen.y + previewPointScreen.y) / 2 - 10;

          // Draw background for text
          const textMetrics = ctx.measureText(labelText);
          const padding = 4;
          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.fillRect(
            midX - textMetrics.width / 2 - padding,
            midY - 14,
            textMetrics.width + padding * 2,
            18,
          );

          // Draw text
          ctx.fillStyle = pathSnapType === "angle" ? "#10b981" : "#3b82f6";
          ctx.fillText(labelText, midX, midY);
        }
      }
    }

    ctx.restore();
    return;
  }
  if (!isDrawingRow || !drawingStart || !drawingEnd) return;
  ctx.save();

  // Calculate dynamic seat count for preview during row drawing
  // Shows real-time preview of seats that will be created based on current drag distance
  const dx = drawingEnd.x - drawingStart.x;
  const dy = drawingEnd.y - drawingStart.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance > 5) {
    // Create temporary geometry for seat calculation
    let geometry;
    if (state.currentTool === "row-line") {
      geometry = createLineGeometry(
        drawingStart.x,
        drawingStart.y,
        drawingEnd.x,
        drawingEnd.y,
      );
    } else if (state.currentTool === "row-arc") {
      const centerX = (drawingStart.x + drawingEnd.x) / 2;
      const centerY = Math.min(drawingStart.y, drawingEnd.y) - 50;
      const width = Math.abs(drawingEnd.x - drawingStart.x);
      const height = Math.abs(drawingEnd.y - drawingStart.y) + 100;
      const radiusX = width / 2;
      const radiusY = Math.max(height / 8, 20);
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
      const seatSpacing =
        rowToolSettings.seatSpacing || state.globalSettings.seatSpacing;
      const seatWidth =
        rowToolSettings.seatWidth || state.globalSettings.seatWidth;
      const seatHeight =
        rowToolSettings.seatHeight || state.globalSettings.seatHeight;
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
            (testSeats - 1) * calculatedSeatSpacing + testSeats * seatWidth;
          if (totalSpaceNeeded <= effectiveDistance) {
            calculatedSeatCount = testSeats;
            break;
          }
        }
      } else {
        const availableSpace = effectiveDistance - seatWidth;
        const maxSeatsBySpace = Math.floor(availableSpace / seatSpacing) + 1;

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

      const tempRow = {
        id: "preview",
        sectionId: "preview",
        geometry,
        seatCount: calculatedSeatCount,
        spacing: calculatedSeatSpacing,
        categoryId: "default",
        transform: { x: 0, y: 0, rotation: 0 },
        seatWidth: seatWidth,
        seatHeight: seatHeight,
      };

      // Generate preview seats using the same logic as final row creation
      const previewSeats = generateSeatsForRow(tempRow);

      // Render seat previews as semi-transparent rectangles
      previewSeats.forEach((seat) => {
        const seatScreenPos = worldToScreen(seat.localX, seat.localY);
        const screenWidth = seat.width * state.scene.view.scale;
        const screenHeight = seat.height * state.scene.view.scale;

        if (screenWidth >= 1 && screenHeight >= 1) {
          // Render seat preview as semi-transparent circles
          ctx.save();
          ctx.globalAlpha = 0.6;
          ctx.fillStyle = "#8d6fbf";
          ctx.strokeStyle = "#8d6fbf";
          ctx.lineWidth = 1;

          const radius = Math.min(screenWidth / 2, screenHeight / 2);

          ctx.beginPath();
          ctx.roundRect(
            seatScreenPos.x - screenWidth / 2,
            seatScreenPos.y - screenHeight / 2,
            screenWidth,
            screenHeight,
            radius,
          );
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      });

      // Store calculated seat count for later rendering (will render on top)
      ctx.previewSeatCount = calculatedSeatCount;
    }
  }

  // Draw the row line/arc preview with snap feedback
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);

  // Change color when snapping is active
  if (isSnapped) {
    ctx.strokeStyle = snapType === "horizontal" ? "#22c55e" : "#3b82f6"; // Green for horizontal, blue for vertical
    ctx.lineWidth = 2; // Thicker line when snapped
  } else {
    ctx.strokeStyle = "#8d6fbf";
  }
  const startScreen = worldToScreen(drawingStart.x, drawingStart.y);
  const endScreen = worldToScreen(drawingEnd.x, drawingEnd.y);

  if (state.currentTool === "row-line") {
    ctx.beginPath();
    ctx.moveTo(startScreen.x, startScreen.y);
    ctx.lineTo(endScreen.x, endScreen.y);
    ctx.stroke();
  } else if (state.currentTool === "row-arc") {
    const centerX = (startScreen.x + endScreen.x) / 2;
    const centerY = Math.min(startScreen.y, endScreen.y) - 50;
    const width = Math.abs(endScreen.x - startScreen.x);
    const height = Math.abs(endScreen.y - startScreen.y) + 100;

    // Draw arc preview
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, width / 2, height / 8, 0, 0, Math.PI);
    ctx.stroke();
  }

  ctx.fillStyle = "#8d6fbf";
  ctx.beginPath();
  ctx.arc(startScreen.x, startScreen.y, 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(endScreen.x, endScreen.y, 4, 0, 2 * Math.PI);
  ctx.fill();

  // Draw seat count badge on top of everything else
  if (ctx.previewSeatCount !== undefined) {
    const midX = (startScreen.x + endScreen.x) / 2;
    const midY = (startScreen.y + endScreen.y) / 2;

    // Draw seat count badge
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]); // Reset line dash

    // Set font and measure text
    const countText = ctx.previewSeatCount.toString();
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const textMetrics = ctx.measureText(countText);
    const textWidth = textMetrics.width;
    const textHeight = 14; // Approximate height based on font size

    // Badge dimensions with padding
    const paddingX = 12;
    const paddingY = 8;
    const badgeWidth = textWidth + paddingX * 2;
    const badgeHeight = textHeight + paddingY * 2;
    const borderRadius = 6;

    // Position badge above the row (offset by 30 pixels upward)
    const badgeOffsetY = 30;

    // Draw badge background (black)
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.roundRect(
      midX - badgeWidth / 2,
      midY - badgeHeight / 2 - badgeOffsetY,
      badgeWidth,
      badgeHeight,
      borderRadius,
    );
    ctx.fill();

    // Draw text (white)
    ctx.fillStyle = "#ffffff";
    ctx.fillText(countText, midX, midY - badgeOffsetY);

    ctx.restore();
  }

  ctx.restore();
}

export function renderMeasurement(
  ctx,
  measurementStart,
  measurementEnd,
  worldToScreen,
  scale,
) {
  if (!measurementStart || !measurementEnd) return;

  ctx.save();

  const startScreen = worldToScreen(measurementStart.x, measurementStart.y);
  const endScreen = worldToScreen(measurementEnd.x, measurementEnd.y);

  const dx = measurementEnd.x - measurementStart.x;
  const dy = measurementEnd.y - measurementStart.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const distanceText = `${distance.toFixed(1)}px`;

  const midX = (startScreen.x + endScreen.x) / 2;
  const midY = (startScreen.y + endScreen.y) / 2;

  ctx.strokeStyle = "#3b82f6";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(startScreen.x, startScreen.y);
  ctx.lineTo(endScreen.x, endScreen.y);
  ctx.stroke();

  ctx.fillStyle = "#3b82f6";
  ctx.beginPath();
  ctx.arc(startScreen.x, startScreen.y, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(endScreen.x, endScreen.y, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "14px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const textMetrics = ctx.measureText(distanceText);
  const textWidth = textMetrics.width;
  const textHeight = 14;
  const paddingX = 12;
  const paddingY = 8;
  const badgeWidth = textWidth + paddingX * 2;
  const badgeHeight = textHeight + paddingY * 2;
  const borderRadius = 6;

  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.roundRect(
    midX - badgeWidth / 2,
    midY - badgeHeight / 2,
    badgeWidth,
    badgeHeight,
    borderRadius,
  );
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.fillText(distanceText, midX, midY);

  ctx.restore();
}
