// @ts-nocheck
import { useCallback } from "react";
import {
  createSeat,
  createElement,
  ELEMENT_TYPES,
  createLineGeometry,
  createRow,
} from "../types.ts";

/**
 * Custom hook for handling mouse down events on the canvas
 * Extracted from CanvasStage to improve code organization and maintainability
 */
export function useMouseDown({
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
}) {
  return useCallback(
    (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (
        state.currentTool === "pan" ||
        e.button === 1 ||
        (e.button === 0 && e.metaKey)
      ) {
        setIsDragging(true);
        setDragStart({ x, y });
        setLastPanPoint({ x: state.scene.view.tx, y: state.scene.view.ty });
        e.preventDefault();
      } else if (state.currentTool === "select" && e.button === 2) {
        // Handle right-click for path extension
        const worldPos = screenToWorld(x, y);
        console.log("[PathExtension] Right-click detected in select tool", {
          worldPos,
          x,
          y,
        });

        // Check for path elements first
        const hitBoundary = hitTestBoundary(
          worldPos.x,
          worldPos.y,
          state,
          ELEMENT_TYPES,
        );
        const hitElement =
          hitBoundary || hitTestElement(worldPos.x, worldPos.y);

        if (hitElement) {
          const element = state.scene.elements[hitElement.id];
          console.log("[PathExtension] Element hit:", {
            elementId: hitElement.id,
            elementType: element?.type,
          });

          if (element && element.type === "path") {
            const segmentHit = hitTestPathSegment(
              worldPos.x,
              worldPos.y,
              element,
            );

            console.log("[PathExtension] Right-click on path element:", {
              elementId: hitElement.id,
              segmentHit,
              worldPos,
            });

            if (segmentHit) {
              console.log("[PathExtension] Segment hit detected:", {
                segmentIndex: segmentHit.segmentIndex,
                endpoint: segmentHit.endpoint,
                pointIndex: segmentHit.pointIndex,
              });

              // Select the element if not already selected
              if (!state.selectedIds.includes(hitElement.id)) {
                console.log(
                  "[PathExtension] Selecting element:",
                  hitElement.id,
                );
                actions.setSelection([hitElement.id]);
              }

              // Enter extension mode (edit mode) - don't start dragging yet
              console.log("[PathExtension] Entering extension/edit mode");
              const initialPoint = element.points[segmentHit.pointIndex];
              setExtendingPathSegment({
                elementId: hitElement.id,
                segmentIndex: segmentHit.segmentIndex,
                endpoint: segmentHit.endpoint,
                pointIndex: segmentHit.pointIndex,
                initialPoint: { ...initialPoint }, // Store initial point position
              });
              e.preventDefault();
              e.stopPropagation();
              return;
            } else {
              console.log("[PathExtension] No segment hit detected");
            }
          }
        }
        e.preventDefault();
      } else if (state.currentTool === "select" && e.button === 0) {
        const worldPos = screenToWorld(x, y);

        // Check for rectangle handles FIRST (before hit testing elements)
        // This allows handles to be clicked even when they overlap the element
        const selectedRectangles = state.selectedIds
          .map((id) => state.scene.elements[id])
          .filter((el) => el && el.type === ELEMENT_TYPES.RECTANGLE);

        for (const element of selectedRectangles) {
          const rectHandle = getRectangleHandle(x, y, element);
          if (rectHandle) {
            console.log("[HandleClick] Rectangle handle clicked:", rectHandle);
            setIsDraggingHandle(true);
            setDraggedHandle({
              handleType: rectHandle.type,
              elementId: rectHandle.elementId,
            });
            e.preventDefault();
            return;
          }
        }

        // Check for circle handles
        const selectedCircles = state.selectedIds
          .map((id) => state.scene.elements[id])
          .filter((el) => el && el.type === ELEMENT_TYPES.CIRCLE);

        for (const element of selectedCircles) {
          const circleHandle = getCircleHandle(x, y, element);
          if (circleHandle) {
            console.log("[HandleClick] Circle handle clicked:", circleHandle);
            setIsDraggingHandle(true);
            setDraggedHandle({
              handleType: circleHandle.type,
              elementId: circleHandle.elementId,
            });
            e.preventDefault();
            return;
          }
        }

        // Check for image handles
        const selectedImages = state.selectedIds
          .map((id) => state.scene.elements[id])
          .filter((el) => el && el.type === ELEMENT_TYPES.IMAGE && !el.locked);

        for (const element of selectedImages) {
          const imageHandle = getImageHandle(x, y, element);
          if (imageHandle) {
            console.log("[HandleClick] Image handle clicked:", imageHandle);
            setIsDraggingHandle(true);
            setDraggedHandle({
              handleType: imageHandle.type,
              elementId: imageHandle.elementId,
            });
            e.preventDefault();
            return;
          }
        }

        // Check for curve handles on selected path elements
        // This must be checked before hitTestElement since handles are positioned away from the path
        const selectedPaths = state.selectedIds
          .map((id) => state.scene.elements[id])
          .filter((el) => el && el.type === "path" && el.curveHandles);

        for (const element of selectedPaths) {
          for (let i = 0; i < element.points.length - 1; i++) {
            const segmentHandles = element.curveHandles[i] || {};

            // Check control point 1
            if (segmentHandles.cp1 && isNearHandle(x, y, segmentHandles.cp1)) {
              console.log("[HandleClick] Path curve handle cp1 clicked");
              setIsDraggingHandle(true);
              setDraggedHandle({
                segmentIndex: i,
                handleType: "cp1",
                elementId: element.id,
              });
              e.preventDefault();
              return;
            }

            // Check control point 2
            if (segmentHandles.cp2 && isNearHandle(x, y, segmentHandles.cp2)) {
              console.log("[HandleClick] Path curve handle cp2 clicked");
              setIsDraggingHandle(true);
              setDraggedHandle({
                segmentIndex: i,
                handleType: "cp2",
                elementId: element.id,
              });
              e.preventDefault();
              return;
            }
          }
        }

        // Check for multi-selection rotation handle first
        if (getMultiSelectionHandle) {
          const multiSelectionHandle = getMultiSelectionHandle(x, y);
          if (multiSelectionHandle) {
            setIsDraggingHandle(true);
            setDraggedHandle(multiSelectionHandle);
            e.preventDefault();
            return;
          }
        }

        // Check for row rotation handles
        const selectedRowIds = new Set();
        state.selectedIds.forEach((id) => {
          const seat = state.scene.seats[id];
          if (seat && seat.rowId) {
            selectedRowIds.add(seat.rowId);
          }
        });

        for (const rowId of selectedRowIds) {
          const row = state.scene.rows[rowId];
          if (!row) continue;

          const rowSeats = Object.values(state.scene.seats).filter(
            (s) => s.rowId === rowId,
          );

          // Only check for handle if all seats in row are selected
          const allSeatsSelected = rowSeats.every((s) =>
            state.selectedIds.includes(s.id),
          );
          if (!allSeatsSelected) continue;

          const rowHandle = getRowHandle(x, y, row, rowSeats);
          if (rowHandle) {
            console.log(
              "[HandleClick] Row rotation handle clicked:",
              rowHandle,
            );
            setIsDraggingHandle(true);
            setDraggedHandle(rowHandle);
            e.preventDefault();
            return;
          }
        }

        // Check for path elements (boundaries) first for easier selection
        const hitBoundary = hitTestBoundary(
          worldPos.x,
          worldPos.y,
          state,
          ELEMENT_TYPES,
        );
        const hitElement =
          hitBoundary || hitTestElement(worldPos.x, worldPos.y);
        const hitSeat = hitTestSeat(worldPos.x, worldPos.y);
        const hitRow = hitTestRow(worldPos.x, worldPos.y);

        // Check if we hit a seating section - it should take priority over seats behind it
        const hitSeatingSection =
          hitElement &&
          state.scene.elements[hitElement.id]?.type ===
            ELEMENT_TYPES.SEATING_SECTION;

        // Check if toggle is enabled - if so, allow seat interaction through seating sections
        const showStrokeOnly =
          state.globalSettings?.showSeatingSectionStroke === true;

        if (hitSeatingSection && !showStrokeOnly) {
          // Handle seating section selection (takes priority over seats)
          const element = state.scene.elements[hitElement.id];

          // Check if clicking on a curve handle of an existing path element
          if (element && element.type === "path" && element.curveHandles) {
            // Check for curve handle clicks on existing path elements
            for (let i = 0; i < element.points.length - 1; i++) {
              const segmentHandles = element.curveHandles[i] || {};

              // Check control point 1 (from previous point)
              if (
                segmentHandles.cp1 &&
                isNearHandle(x, y, segmentHandles.cp1)
              ) {
                setIsDraggingHandle(true);
                setDraggedHandle({
                  elementId: hitElement.id,
                  segmentIndex: i,
                  handleType: "cp1",
                });
                return;
              }

              // Check control point 2 (to next point)
              if (
                segmentHandles.cp2 &&
                isNearHandle(x, y, segmentHandles.cp2)
              ) {
                setIsDraggingHandle(true);
                setDraggedHandle({
                  elementId: hitElement.id,
                  segmentIndex: i,
                  handleType: "cp2",
                });
                return;
              }
            }
          }

          const isAlreadySelected = state.selectedIds.includes(hitElement.id);

          // Check for double-click on text element
          const now = Date.now();
          const isDoubleClick =
            now - lastClickTime < 300 && lastClickedElement === hitElement.id;

          if (isDoubleClick && element?.type === ELEMENT_TYPES.TEXT) {
            // Start editing text on double-click
            setEditingTextId(hitElement.id);
            setEditingTextValue(element.text || "Text");
            e.preventDefault();
            return;
          }

          setLastClickTime(now);
          setLastClickedElement(hitElement.id);

          if (e.shiftKey) {
            if (isAlreadySelected) {
              actions.setSelection(
                state.selectedIds.filter((id) => id !== hitElement.id),
              );
            } else {
              actions.addToSelection(hitElement.id);
            }
          } else if (!isAlreadySelected) {
            actions.setSelection([hitElement.id]);
          }

          // Start dragging if not locked
          if (!element?.locked) {
            setIsDraggingSeats(true);
            setDragStart({ x, y });
            setDragOffset({ x: 0, y: 0 });
          }
        } else if (hitSeat) {
          // If Alt/Option key is held, select the entire row
          if (e.altKey) {
            const rowSeats = Object.values(state.scene.seats)
              .filter((seat) => seat.rowId === hitSeat.rowId)
              .map((seat) => seat.id);

            if (e.shiftKey) {
              // Add row seats to selection
              rowSeats.forEach((seatId) => {
                if (!state.selectedIds.includes(seatId)) {
                  actions.addToSelection(seatId);
                }
              });
            } else {
              // Replace selection with row seats
              actions.setSelection(rowSeats);
            }
          } else {
            // Check if clicked seat is already selected
            const isAlreadySelected = state.selectedIds.includes(hitSeat.id);

            if (e.shiftKey) {
              // Shift+click: toggle selection
              if (isAlreadySelected) {
                actions.setSelection(
                  state.selectedIds.filter((id) => id !== hitSeat.id),
                );
              } else {
                actions.addToSelection(hitSeat.id);
              }
            } else if (!isAlreadySelected) {
              // Click on unselected seat: select only this seat
              actions.setSelection([hitSeat.id]);
            }
            // If seat is already selected and no shift key, keep selection and allow drag
          }

          // Start dragging seats if any are selected
          if (state.selectedIds.length > 0 || !e.shiftKey) {
            console.log(
              "[SeatDrag] Starting seat drag operation (tool:",
              state.currentTool,
              ")",
            );
            setIsDraggingSeats(true);
            setDragStart({ x, y });
            setDragOffset({ x: 0, y: 0 });
          }
        } else if (hitRow) {
          // Direct row selection by clicking on the guide line
          const rowSeats = Object.values(state.scene.seats)
            .filter((seat) => seat.rowId === hitRow.id)
            .map((seat) => seat.id);

          if (e.shiftKey) {
            // Add row seats to selection
            rowSeats.forEach((seatId) => {
              if (!state.selectedIds.includes(seatId)) {
                actions.addToSelection(seatId);
              }
            });
          } else {
            // Replace selection with row seats
            actions.setSelection(rowSeats);
          }

          // Start dragging seats
          console.log(
            "[SeatDrag] Starting seat drag from row selection (tool:",
            state.currentTool,
            ")",
          );
          setIsDraggingSeats(true);
          setDragStart({ x, y });
          setDragOffset({ x: 0, y: 0 });
        } else if (hitElement) {
          // Handle element selection or lock icon clicks
          if (hitElement.type === "lockIcon") {
            // Clicking on lock icon: unlock the image
            actions.unlockImage(hitElement.id);
          } else {
            const element = state.scene.elements[hitElement.id];

            // Check if clicking on a curve handle of an existing path element
            if (element && element.type === "path" && element.curveHandles) {
              // Check for curve handle clicks on existing path elements
              for (let i = 0; i < element.points.length - 1; i++) {
                const segmentHandles = element.curveHandles[i] || {};

                // Check control point 1 (from previous point)
                if (
                  segmentHandles.cp1 &&
                  isNearHandle(x, y, segmentHandles.cp1)
                ) {
                  setIsDraggingHandle(true);
                  setDraggedHandle({
                    segmentIndex: i,
                    handleType: "cp1",
                    elementId: hitElement.id,
                  });
                  e.preventDefault();
                  return;
                }

                // Check control point 2 (to next point)
                if (
                  segmentHandles.cp2 &&
                  isNearHandle(x, y, segmentHandles.cp2)
                ) {
                  setIsDraggingHandle(true);
                  setDraggedHandle({
                    segmentIndex: i,
                    handleType: "cp2",
                    elementId: hitElement.id,
                  });
                  e.preventDefault();
                  return;
                }
              }
            }

            // Check if we're in extension mode for this element
            if (
              extendingPathSegment &&
              extendingPathSegment.elementId === hitElement.id &&
              element &&
              element.type === "path"
            ) {
              // We're in extension mode for this path - start extension dragging
              console.log(
                "[PathExtension] Starting extension drag for element:",
                hitElement.id,
              );
              setIsDraggingSeats(true);
              setDragStart({ x, y });
              setDragOffset({ x: 0, y: 0 });
              e.preventDefault();
              return;
            }

            // Handle regular element selection
            const isAlreadySelected = state.selectedIds.includes(hitElement.id);

            if (e.shiftKey) {
              // Shift+click: toggle selection
              if (isAlreadySelected) {
                actions.setSelection(
                  state.selectedIds.filter((id) => id !== hitElement.id),
                );
              } else {
                actions.addToSelection(hitElement.id);
              }
            } else if (!isAlreadySelected) {
              // Click on unselected element: select only this element
              actions.setSelection([hitElement.id]);
              // Clear extension mode if selecting a different element
              if (
                extendingPathSegment &&
                extendingPathSegment.elementId !== hitElement.id
              ) {
                console.log(
                  "[PathExtension] Clearing extension mode - different element selected",
                );
                setExtendingPathSegment(null);
              }
            }

            // Start dragging elements if any are selected
            // But if we're in extension mode for this element, don't start normal drag
            // (extension drag was already started above)
            if (
              !(
                extendingPathSegment &&
                extendingPathSegment.elementId === hitElement.id
              )
            ) {
              if (state.selectedIds.length > 0 || !e.shiftKey) {
                setIsDraggingSeats(true); // Reuse the same dragging logic
                setDragStart({ x, y });
                setDragOffset({ x: 0, y: 0 });
              }
            }
          }
        } else {
          // Clicked on empty space - start selection rectangle or clear selection
          if (!e.shiftKey) {
            actions.clearSelection();
            // Clear extension mode when clicking on empty space
            if (extendingPathSegment) {
              console.log("[PathExtension] Clearing extension mode");
              setExtendingPathSegment(null);
            }
          }

          // Start selection rectangle drag
          setIsSelectionDrag(true);
          setDragStart({ x, y });
          setSelectionRect({
            startX: x,
            startY: y,
            endX: x,
            endY: y,
          });
        }
        e.preventDefault();
      } else if (
        (state.currentTool === "row-line" || state.currentTool === "row-arc") &&
        e.button === 0
      ) {
        // Start drawing a row
        const worldPos = screenToWorld(x, y);

        // Apply row snapping only if Alt is pressed (bidirectional)
        let snappedStartPos = worldPos;
        if (e.altKey) {
          const seatSpacing = state.globalSettings.seatSpacing || 7.0;
          const seatHeight = state.globalSettings.seatHeight || 20;
          // Increased Y distance: seat spacing + seat height for better visual separation
          const rowVerticalSpacing = seatSpacing + seatHeight;

          // Find nearby row info (bidirectional - above or below cursor)
          const nearbyRowInfo = findNearbyRowInfo(worldPos.y, worldPos.x);

          if (nearbyRowInfo.hasRow) {
            // Calculate Y position: offset from detected row (above or below)
            const direction = worldPos.y < nearbyRowInfo.rowY ? -1 : 1;
            const targetY = nearbyRowInfo.rowY + direction * rowVerticalSpacing;

            // Start with first column or last created row X
            let targetX =
              lastCreatedRowStart?.x || nearbyRowInfo.columns[0] || worldPos.x;

            // Column alignment: Check if cursor is near any seat column from nearby row
            const columnSnapTolerance = 25; // pixels for column alignment

            if (nearbyRowInfo.columns.length > 0) {
              // Find nearest column to cursor X position
              let nearestColumn = null;
              let nearestDistance = columnSnapTolerance;

              nearbyRowInfo.columns.forEach((columnX) => {
                const distance = Math.abs(worldPos.x - columnX);
                if (distance < nearestDistance) {
                  nearestDistance = distance;
                  nearestColumn = columnX;
                }
              });

              // If we found a nearby column, snap to it
              if (nearestColumn !== null) {
                targetX = nearestColumn;
                console.log(
                  "[RowDraw] Column alignment detected! Snapping to column X:",
                  nearestColumn,
                  "from row at Y:",
                  nearbyRowInfo.rowY,
                );
              }
            }

            // Define snap tolerance (how close you need to be to trigger snap)
            const snapTolerance = 30; // pixels in world coordinates

            // Calculate distance from ideal position
            const distanceX = Math.abs(worldPos.x - targetX);
            const distanceY = Math.abs(worldPos.y - targetY);

            // Snap only if within tolerance on both axes (magnetic snap)
            if (distanceX < snapTolerance && distanceY < snapTolerance) {
              snappedStartPos = { x: targetX, y: targetY };
              console.log(
                "[RowDraw] Snapping row start to X:",
                targetX,
                "Y:",
                targetY,
                "Direction:",
                direction > 0 ? "below" : "above",
                "nearest row at Y:",
                nearbyRowInfo.rowY,
                "with vertical spacing:",
                rowVerticalSpacing,
              );
            } else {
              console.log(
                "[RowDraw] Not snapping - distance too large. X distance:",
                distanceX,
                "Y distance:",
                distanceY,
                "tolerance:",
                snapTolerance,
              );
            }
          }
        }

        console.log(
          "[RowDraw] Starting row drawing:",
          state.currentTool,
          "at world pos:",
          snappedStartPos,
        );
        setIsDrawingRow(true);
        setDrawingStart(snappedStartPos);
        setDrawingEnd(snappedStartPos);
        setDragStart({ x, y });
        setIsAltPressed(e.altKey); // Track Alt key state
        e.preventDefault();
      } else if (state.currentTool === "seat" && e.button === 0) {
        // Create individual seat
        const worldPos = screenToWorld(x, y);
        const sectionId = actions.ensureSectionExists();

        // Create a temporary row for the seat (or find an existing one)
        // For now, we'll create a seat without a row (standalone seat)
        const toolSettings = state.toolSettings[state.currentTool] || {};
        const seatCategoryId =
          toolSettings.categoryId ||
          state.scene.venue.categories[0]?.id ||
          "default";
        const seatWidth = toolSettings.width || 20;
        const seatHeight = toolSettings.height || 20;

        // Apply snapping logic during seat creation (only when Alt is pressed)
        let finalX = worldPos.x;
        let finalY = worldPos.y;

        if (e.altKey) {
          const columnTolerance = 15; // X-axis tolerance for column detection
          const snapDetectionThreshold = 10; // pixels tolerance to detect proximity to snap point

          // Find the nearest seat in the column by Y-distance
          let nearestSeat = /** @type {any} */ (null);
          let nearestSeatDistance = Infinity;

          Object.values(state.scene.seats).forEach((otherSeat) => {
            // Check if the other seat is in approximately the same column
            const xDistance = Math.abs(otherSeat.localX - worldPos.x);

            if (xDistance < columnTolerance) {
              // Calculate Y distance to this seat's center
              const yDistance = Math.abs(otherSeat.localY - worldPos.y);

              if (yDistance < nearestSeatDistance) {
                nearestSeatDistance = yDistance;
                nearestSeat = otherSeat;
              }
            }
          });

          // If we found a nearest seat, check if we're close to one of its two snap points
          if (nearestSeat) {
            const otherSeatHeight = nearestSeat.height || 10;

            // Calculate the two specific snap points for the nearest seat only
            // Point 1: Directly below the nearest seat
            const snapPointBelow =
              nearestSeat.localY + otherSeatHeight / 2 + seatHeight / 2;
            // Point 2: Directly above the nearest seat
            const snapPointAbove =
              nearestSeat.localY - otherSeatHeight / 2 - seatHeight / 2;

            // Check distance to snap point below
            const distanceToBelow = Math.abs(worldPos.y - snapPointBelow);
            // Check distance to snap point above
            const distanceToAbove = Math.abs(worldPos.y - snapPointAbove);

            // Snap to whichever point is closest, if within threshold
            if (
              distanceToBelow < snapDetectionThreshold &&
              distanceToBelow <= distanceToAbove
            ) {
              finalY = snapPointBelow;
            } else if (distanceToAbove < snapDetectionThreshold) {
              finalY = snapPointAbove;
            }
          }
        }

        const seat = createSeat(
          null, // No row ID for standalone seats
          finalX,
          finalY,
          "",
          seatCategoryId,
          seatWidth,
          seatHeight,
        );

        actions.addSeat(seat);
        actions.setSelection([seat.id]);
        // Only reset to select for non-seat tools (element tools should reset)
        if (state.currentTool !== "seat") {
          actions.setTool("select");
        }
        e.preventDefault();
      } else if (state.currentTool === "multi-row" && e.button === 0) {
        // Multi-row tool: progressive creation
        const worldPos = screenToWorld(x, y);

        if (multiRowState.phase === "initial") {
          // First click: drop the first seat as a reference point
          console.log("[MultiRow] Phase 1: First click at", worldPos);
          setMultiRowState({
            phase: "first-click",
            firstPoint: worldPos,
            secondPoint: null,
            rowDirection: null,
            createdRows: [],
          });
        } else if (multiRowState.phase === "first-click") {
          // Second click: create the first row
          // Use the snapped preview point if available, otherwise use raw position
          const finalPos = multiRowState.previewPoint || worldPos;

          const dx = Math.abs(finalPos.x - multiRowState.firstPoint.x);
          const dy = Math.abs(finalPos.y - multiRowState.firstPoint.y);

          // Determine if row is horizontal or vertical based on larger delta
          const rowDirection = dx > dy ? "horizontal" : "vertical";

          console.log(
            "[MultiRow] Phase 2: Second click at",
            finalPos,
            "Direction:",
            rowDirection,
          );

          // Create the first row
          const sectionId = actions.ensureSectionExists();
          const toolSettings = state.toolSettings[state.currentTool] || {};
          const seatWidth =
            toolSettings.seatWidth || state.globalSettings.seatWidth || 20;
          const seatHeight =
            toolSettings.seatHeight || state.globalSettings.seatHeight || 20;
          const seatSpacing =
            toolSettings.seatSpacing || state.globalSettings.seatSpacing || 7.0;
          const categoryId =
            toolSettings.categoryId ||
            state.scene.venue.categories[0]?.id ||
            "default";

          // Create line geometry for the first row using snapped position
          const geometry = createLineGeometry(
            multiRowState.firstPoint.x,
            multiRowState.firstPoint.y,
            finalPos.x,
            finalPos.y,
          );

          // Calculate seat count based on distance (use snapped position)
          const distance = Math.sqrt(
            Math.pow(finalPos.x - multiRowState.firstPoint.x, 2) +
              Math.pow(finalPos.y - multiRowState.firstPoint.y, 2),
          );

          const seatCount = Math.max(
            1,
            Math.floor((distance - seatWidth) / (seatWidth + seatSpacing)) + 1,
          );

          const row = createRow(
            sectionId,
            geometry,
            seatCount,
            seatSpacing,
            categoryId,
            0,
          );

          actions.addRow(row);

          setMultiRowState({
            phase: "second-click",
            firstPoint: multiRowState.firstPoint,
            secondPoint: finalPos,
            rowDirection: rowDirection,
            createdRows: [row.id],
          });
        } else if (
          multiRowState.phase === "second-click" &&
          multiRowState.previewRowCount > 0
        ) {
          // Third click: finalize and create the additional rows
          console.log(
            "[MultiRow] Phase 3: Finalizing with",
            multiRowState.previewRowCount,
            "additional rows",
          );

          const sectionId = actions.ensureSectionExists();
          const toolSettings = state.toolSettings[state.currentTool] || {};
          const seatWidth =
            toolSettings.seatWidth || state.globalSettings.seatWidth || 20;
          const seatHeight =
            toolSettings.seatHeight || state.globalSettings.seatHeight || 20;
          const seatSpacing =
            toolSettings.seatSpacing || state.globalSettings.seatSpacing || 7.0;
          const rowSpacing = toolSettings.rowSpacing || 30;
          const categoryId =
            toolSettings.categoryId ||
            state.scene.venue.categories[0]?.id ||
            "default";

          const newRows = [];

          // Calculate seat count from the first row
          const distance = Math.sqrt(
            Math.pow(
              multiRowState.secondPoint.x - multiRowState.firstPoint.x,
              2,
            ) +
              Math.pow(
                multiRowState.secondPoint.y - multiRowState.firstPoint.y,
                2,
              ),
          );
          const seatCount = Math.max(
            1,
            Math.floor((distance - seatWidth) / (seatWidth + seatSpacing)) + 1,
          );

          // Create additional rows below the first row
          for (let i = 1; i <= multiRowState.previewRowCount; i++) {
            const yOffset = i * rowSpacing;
            const p1 = {
              x: multiRowState.firstPoint.x,
              y: multiRowState.firstPoint.y + yOffset,
            };
            const p2 = {
              x: multiRowState.secondPoint.x,
              y: multiRowState.secondPoint.y + yOffset,
            };

            const geometry = createLineGeometry(p1.x, p1.y, p2.x, p2.y);

            const row = createRow(
              sectionId,
              geometry,
              seatCount,
              seatSpacing,
              categoryId,
              0,
            );

            newRows.push(row);
            actions.addRow(row);
          }

          console.log("[MultiRow] Created", newRows.length, "additional rows");

          // Reset tool state
          setMultiRowState({
            phase: "initial",
            firstPoint: null,
            secondPoint: null,
            rowDirection: null,
            createdRows: [],
          });

          // Switch back to select tool
          actions.setTool("select");
        }

        e.preventDefault();
      } else if (
        (state.currentTool === "element-circle" ||
          state.currentTool === "element-table" ||
          state.currentTool === "element-rectangle" ||
          state.currentTool === "element-text" ||
          state.currentTool === "standing-section") &&
        e.button === 0
      ) {
        // Create circle, table, rectangle, text, or standing section element
        const worldPos = screenToWorld(x, y);

        let element = /** @type {any} */ (undefined);
        if (state.currentTool === "element-circle") {
          actions.setTool("select");
          const toolSettings = state.toolSettings[state.currentTool] || {};
          const radius = toolSettings.radius || 40; // Default 80px diameter = 40px radius
          element = createElement(
            ELEMENT_TYPES.CIRCLE,
            worldPos.x,
            worldPos.y,
            radius * 2,
            radius * 2,
            {
              fillColor: toolSettings.fillColor || "#e8f4ff",
              strokeColor: toolSettings.strokeColor || "#2563eb",
              strokeWidth: toolSettings.strokeWidth || 2,
              label: "",
            },
          );
        } else if (state.currentTool === "element-table") {
          // Create table with seats
          const sectionId = actions.ensureSectionExists();
          const toolSettings = state.toolSettings[state.currentTool] || {};
          const tableRadius = toolSettings.tableRadius || 30; // Table radius (60px diameter)
          const seatRadius = toolSettings.seatRadius || 39; // Distance from center to seat center (closer to table)
          const seatCount = toolSettings.seatCount || 10; // Number of seats around table
          const seatCategoryId =
            toolSettings.categoryId || categories[0]?.id || "default";
          const fillColor = toolSettings.fillColor || "#f0f0f0"; // Table fill color
          const strokeColor = toolSettings.strokeColor || "#333333"; // Table stroke color
          const strokeWidth = toolSettings.strokeWidth || 2; // Table stroke width

          // Table snapping: Find nearby tables and snap to X or Y axis
          const snapTolerance = toolSettings.snapTolerance || 25; // pixels
          let snappedX = worldPos.x;
          let snappedY = worldPos.y;
          let xSnapped = false;
          let ySnapped = false;

          // Check all existing tables (circle elements with "Table" label pattern)
          Object.values(state.scene.elements).forEach((existingElement) => {
            if (
              existingElement.type === ELEMENT_TYPES.CIRCLE &&
              (existingElement.label === "Table" ||
                existingElement.label?.startsWith("T") ||
                existingElement.label?.includes("Table"))
            ) {
              // Check X-axis alignment (snap to same X coordinate)
              if (!xSnapped) {
                const xDistance = Math.abs(worldPos.x - existingElement.x);
                if (xDistance < snapTolerance) {
                  snappedX = existingElement.x;
                  xSnapped = true;
                }
              }

              // Check Y-axis alignment (snap to same Y coordinate)
              if (!ySnapped) {
                const yDistance = Math.abs(worldPos.y - existingElement.y);
                if (yDistance < snapTolerance) {
                  snappedY = existingElement.y;
                  ySnapped = true;
                }
              }
            }
          });

          // Create the table (circle element) with snapped position
          element = createElement(
            ELEMENT_TYPES.CIRCLE,
            snappedX,
            snappedY,
            tableRadius * 2,
            tableRadius * 2,
            {
              fillColor: fillColor,
              strokeColor: strokeColor,
              strokeWidth: strokeWidth,
              label: "Table", // Default label, will be updated by auto-assign
            },
          );

          // Create seats around the table using snapped position
          const seats = [];
          const seatSpacing = (2 * Math.PI) / seatCount; // Seats equally spaced around circle

          for (let i = 0; i < seatCount; i++) {
            const angle = i * seatSpacing;
            const seatX = snappedX + seatRadius * Math.cos(angle);
            const seatY = snappedY + seatRadius * Math.sin(angle);

            const seat = createSeat(
              null, // No rowId for table seats
              seatX,
              seatY,
              `Seat ${i + 1}`, // Default label, will be updated by auto-assign
              seatCategoryId, // Use tool settings category
              12,
              12,
            );
            seats.push(seat);
          }

          // Add the table and all seats as a single operation (single undo entry)
          actions.addTableWithSeats(element, seats);

          // Select the table and seats
          actions.setSelection([element.id, ...seats.map((s) => s.id)]);
        } else if (state.currentTool === "element-rectangle") {
          actions.setTool("select");
          const toolSettings = state.toolSettings[state.currentTool] || {};
          element = createElement(
            ELEMENT_TYPES.RECTANGLE,
            worldPos.x,
            worldPos.y,
            toolSettings.width || 100,
            toolSettings.height || 60,
            {
              fillColor: toolSettings.fillColor || "#f0f9ff",
              strokeColor: toolSettings.strokeColor || "#0ea5e9",
              strokeWidth: toolSettings.strokeWidth || 2,
              rotation: toolSettings.rotation || 0,
              borderRadius: toolSettings.borderRadius || 8,
              label: "",
            },
          );
        } else if (state.currentTool === "element-text") {
          actions.setTool("select");
          const toolSettings = state.toolSettings[state.currentTool] || {};
          element = createElement(
            ELEMENT_TYPES.TEXT,
            worldPos.x,
            worldPos.y,
            100,
            30,
            {
              text: toolSettings.text || "Text",
              fontSize: toolSettings.fontSize || 16,
              fontFamily: toolSettings.fontFamily || "Arial",
              fontWeight: toolSettings.fontWeight || "normal",
              textAlign: toolSettings.textAlign || "center",
              fillColor: toolSettings.fillColor || "#000000",
            },
          );
        } else if (state.currentTool === "standing-section") {
          actions.setTool("select");
          const toolSettings = state.toolSettings[state.currentTool] || {};
          element = createElement(
            ELEMENT_TYPES.STANDING_SECTION,
            worldPos.x,
            worldPos.y,
            toolSettings.width || 150,
            toolSettings.height || 100,
            {
              standingCapacity: toolSettings.standingCapacity || 50,
              sectionType: toolSettings.sectionType || "general",
              fillColor: toolSettings.fillColor || "#e5e7eb",
              strokeColor: toolSettings.strokeColor || "transparent",
              strokeWidth: toolSettings.strokeWidth || 0,
              opacity: toolSettings.opacity || 1.0,
              label: toolSettings.label || "Standing Section",
            },
          );
        }

        actions.addElement(element);
        actions.setSelection([element.id]);
        e.preventDefault();
      } else if (state.currentTool === "measure" && e.button === 0) {
        const worldPos = screenToWorld(x, y);
        const snappedPoint = findSnapPoint(worldPos.x, worldPos.y);

        if (!measurementStart) {
          setMeasurementStart(snappedPoint);
          setIsMeasuring(true);
          setMeasurementEnd(snappedPoint);
        } else if (isMeasuring) {
          setMeasurementEnd(snappedPoint);
          setIsMeasuring(false);
        } else {
          setMeasurementStart(snappedPoint);
          setMeasurementEnd(snappedPoint);
          setIsMeasuring(true);
        }
        e.preventDefault();
      } else if (state.currentTool === "element-path" && e.button === 0) {
        const worldPos = screenToWorld(x, y);

        // Check if clicking on a curve handle for editing
        if (isDrawingElement && pathPoints.length > 1) {
          let handleFound = false;

          // Check each segment for handles
          for (let i = 0; i < pathPoints.length - 1; i++) {
            const segmentHandles = curveHandles[i] || {};

            // Check control point 1 (from previous point)
            if (segmentHandles.cp1 && isNearHandle(x, y, segmentHandles.cp1)) {
              setIsDraggingHandle(true);
              setDraggedHandle({ segmentIndex: i, handleType: "cp1" });
              handleFound = true;
              break;
            }

            // Check control point 2 (to next point)
            if (segmentHandles.cp2 && isNearHandle(x, y, segmentHandles.cp2)) {
              setIsDraggingHandle(true);
              setDraggedHandle({ segmentIndex: i, handleType: "cp2" });
              handleFound = true;
              break;
            }
          }

          if (handleFound) {
            e.preventDefault();
            return;
          }
        }

        if (!isDrawingElement) {
          // Start new path
          setIsDrawingElement(true);
          setPathPoints([worldPos]);
          setCurveHandles({});
        } else {
          // Check if clicking near first point to auto-close the path
          if (pathPoints.length >= 3 && isNearFirstPoint(x, y)) {
            // Auto-close the path by creating a closed polygon (Standing Section)
            // Create curve handle for closing segment (last point to first point)
            const closingSegmentIndex = pathPoints.length - 1;
            const lastPoint = pathPoints[pathPoints.length - 1];
            const firstPoint = pathPoints[0];

            // Create control points for the closing segment
            const closingCp1 = {
              x: lastPoint.x + (firstPoint.x - lastPoint.x) / 3,
              y: lastPoint.y + (firstPoint.y - lastPoint.y) / 3,
            };
            const closingCp2 = {
              x: firstPoint.x - (firstPoint.x - lastPoint.x) / 3,
              y: firstPoint.y - (firstPoint.y - lastPoint.y) / 3,
            };

            const finalCurveHandles = {
              ...curveHandles,
              [closingSegmentIndex]: { cp1: closingCp1, cp2: closingCp2 },
            };

            // Create a closed path element (can be converted to Standing Section)
            const closedPathElement = createElement(
              ELEMENT_TYPES.PATH,
              0,
              0,
              0,
              0,
              {
                points: pathPoints,
                curveHandles: finalCurveHandles,
                strokeColor: "rgba(0, 0, 0, 0.9)",
                strokeWidth: 2,
                fillColor: "rgba(100, 100, 200, 0.1)", // Light fill to show it's closed
                label: "Closed Boundary",
                opacity: 0.8,
                isClosed: true, // Mark as closed for potential conversion
              },
            );

            actions.addElement(closedPathElement);
            actions.setSelection([closedPathElement.id]);

            // Reset path drawing state
            setIsDrawingElement(false);
            setPathPoints([]);
            setCurveHandles({});
            setIsPathCloseable(false);
          } else {
            // Add point to existing path - use snapped position if available
            const lastPoint = pathPoints[pathPoints.length - 1];
            const { point: snappedPoint } = calculatePathSnapPosition(
              worldPos,
              lastPoint,
              pathPoints,
            );
            const pointToAdd = snappedPoint;

            const newPathPoints = [...pathPoints, pointToAdd];
            setPathPoints(newPathPoints);

            // Create default curve handles for the new segment
            const segmentIndex = newPathPoints.length - 2;
            if (segmentIndex >= 0) {
              const prevPoint = newPathPoints[segmentIndex];
              const currentPoint = newPathPoints[segmentIndex + 1];

              // Create control points at 1/3 and 2/3 between points (Figma-style default)
              const cp1 = {
                x: prevPoint.x + (currentPoint.x - prevPoint.x) / 3,
                y: prevPoint.y + (currentPoint.y - prevPoint.y) / 3,
              };
              const cp2 = {
                x: currentPoint.x - (currentPoint.x - prevPoint.x) / 3,
                y: currentPoint.y - (currentPoint.y - prevPoint.y) / 3,
              };

              setCurveHandles((prev) => ({
                ...prev,
                [segmentIndex]: { cp1, cp2 },
              }));
            }
          }
        }
        e.preventDefault();
      }
    },
    [
      state.currentTool,
      state.scene.view,
      state.scene.seats,
      state.scene.sections,
      state.scene.elements,
      state.selectedIds,
      isDrawingElement,
      curveHandles,
      pathPoints,
      screenToWorld,
      isNearHandle,
      isNearFirstPoint,
      getRectangleHandle,
      hitTestElement,
      hitTestSeat,
      hitTestRow,
      actions,
      lastCreatedRowStart,
      state.globalSettings,
      findNearbyRowInfo,
      calculatePathSnapPosition,
      lastClickTime,
      lastClickedElement,
      multiRowState,
      setMultiRowState,
      createLineGeometry,
      createRow,
      findSnapPoint,
      measurementStart,
      measurementEnd,
      isMeasuring,
      setMeasurementStart,
      setMeasurementEnd,
      setIsMeasuring,
      setExtendingPathSegment,
      hitTestPathSegment,
      extendingPathSegment,
    ],
  );
}
