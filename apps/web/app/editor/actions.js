import { useCallback } from "react";
import { generateId, createSection } from "./types.js";
import { generateSeatsForRow } from "./geometry.js";

// Action types
export const ACTIONS = {
  SET_TOOL: "SET_TOOL",
  SET_SELECTION: "SET_SELECTION",
  ADD_TO_SELECTION: "ADD_TO_SELECTION",
  CLEAR_SELECTION: "CLEAR_SELECTION",
  UPDATE_VIEW: "UPDATE_VIEW",
  ADD_ROW: "ADD_ROW",
  ADD_SEAT: "ADD_SEAT",
  UPDATE_ROW: "UPDATE_ROW",
  UPDATE_SEAT: "UPDATE_SEAT",
  UPDATE_SEATS: "UPDATE_SEATS",
  MOVE_SEATS: "MOVE_SEATS",
  ADJUST_SEAT_SPACING: "ADJUST_SEAT_SPACING",
  ROTATE_SELECTED_SEATS: "ROTATE_SELECTED_SEATS",
  ADD_ELEMENT: "ADD_ELEMENT",
  UPDATE_ELEMENT: "UPDATE_ELEMENT",
  MOVE_ELEMENTS: "MOVE_ELEMENTS",
  ADD_IMAGE: "ADD_IMAGE",
  UPDATE_IMAGE: "UPDATE_IMAGE",
  LOCK_IMAGE: "LOCK_IMAGE",
  UNLOCK_IMAGE: "UNLOCK_IMAGE",
  DELETE_ITEMS: "DELETE_ITEMS",
  TOGGLE_GRID: "TOGGLE_GRID",
  LOAD_SCENE: "LOAD_SCENE",
  UNDO: "UNDO",
  REDO: "REDO",
  SAVE_TO_HISTORY: "SAVE_TO_HISTORY",
  COMMIT_TO_HISTORY: "COMMIT_TO_HISTORY", // Save current scene state to history
  COPY_ROWS: "COPY_ROWS",
  PASTE_ROWS: "PASTE_ROWS",
  COMPLETE_PATH: "COMPLETE_PATH",
  UPDATE_GLOBAL_SETTINGS: "UPDATE_GLOBAL_SETTINGS",
  UPDATE_TOOL_SETTINGS: "UPDATE_TOOL_SETTINGS",
  ASSIGN_TABLE_LABELS: "ASSIGN_TABLE_LABELS",
  GROUP_ELEMENTS: "GROUP_ELEMENTS",
  UNGROUP_ELEMENTS: "UNGROUP_ELEMENTS",
  CANCEL_DRAWING: "CANCEL_DRAWING",
  ADD_TABLE_WITH_SEATS: "ADD_TABLE_WITH_SEATS",
  UPDATE_TABLE_GROUP: "UPDATE_TABLE_GROUP",
  EXTEND_PATH_SEGMENT: "EXTEND_PATH_SEGMENT",
};

export function useActionCreators(dispatch, state) {
  return {
    setTool: useCallback((tool) => {
      dispatch({ type: ACTIONS.SET_TOOL, payload: tool });
    }, []),

    setSelection: useCallback((ids) => {
      dispatch({ type: ACTIONS.SET_SELECTION, payload: ids });
    }, []),

    addToSelection: useCallback((id) => {
      dispatch({ type: ACTIONS.ADD_TO_SELECTION, payload: id });
    }, []),

    clearSelection: useCallback(() => {
      dispatch({ type: ACTIONS.CLEAR_SELECTION });
    }, []),

    updateView: useCallback((viewUpdates) => {
      dispatch({ type: ACTIONS.UPDATE_VIEW, payload: viewUpdates });
    }, []),

    // Zoom to fit all content in the viewport
    zoomToFit: useCallback((canvasWidth, canvasHeight, padding = 50) => {
      const { seats, rows, elements } = state.scene;
      
      // Calculate bounding box of all content
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let hasContent = false;

      // Include seats
      seats.forEach(seat => {
        hasContent = true;
        const halfWidth = (seat.width || 20) / 2;
        const halfHeight = (seat.height || 20) / 2;
        minX = Math.min(minX, seat.x - halfWidth);
        minY = Math.min(minY, seat.y - halfHeight);
        maxX = Math.max(maxX, seat.x + halfWidth);
        maxY = Math.max(maxY, seat.y + halfHeight);
      });

      // Include rows (their seats)
      rows.forEach(row => {
        if (row.seats) {
          row.seats.forEach(seat => {
            hasContent = true;
            const halfWidth = (seat.width || 20) / 2;
            const halfHeight = (seat.height || 20) / 2;
            minX = Math.min(minX, seat.x - halfWidth);
            minY = Math.min(minY, seat.y - halfHeight);
            maxX = Math.max(maxX, seat.x + halfWidth);
            maxY = Math.max(maxY, seat.y + halfHeight);
          });
        }
      });

      // Include elements
      elements.forEach(element => {
        hasContent = true;
        if (element.type === "rectangle" || element.type === "image" || element.type === "text") {
          const halfWidth = (element.width || 100) / 2;
          const halfHeight = (element.height || 100) / 2;
          minX = Math.min(minX, element.x - halfWidth);
          minY = Math.min(minY, element.y - halfHeight);
          maxX = Math.max(maxX, element.x + halfWidth);
          maxY = Math.max(maxY, element.y + halfHeight);
        } else if (element.type === "circle") {
          const radius = element.radius || 50;
          minX = Math.min(minX, element.x - radius);
          minY = Math.min(minY, element.y - radius);
          maxX = Math.max(maxX, element.x + radius);
          maxY = Math.max(maxY, element.y + radius);
        } else if (element.type === "polygon" && element.points) {
          element.points.forEach(pt => {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
          });
        }
      });

      // If no content, set default view
      if (!hasContent) {
        dispatch({ 
          type: ACTIONS.UPDATE_VIEW, 
          payload: { scale: 1, tx: canvasWidth / 2, ty: canvasHeight / 2 } 
        });
        return;
      }

      // Calculate content dimensions
      const contentWidth = maxX - minX;
      const contentHeight = maxY - minY;
      const contentCenterX = (minX + maxX) / 2;
      const contentCenterY = (minY + maxY) / 2;

      // Calculate scale to fit content with padding
      const availableWidth = canvasWidth - padding * 2;
      const availableHeight = canvasHeight - padding * 2;
      const scaleX = availableWidth / contentWidth;
      const scaleY = availableHeight / contentHeight;
      const scale = Math.min(scaleX, scaleY, 2); // Cap at 2x zoom

      // Calculate translation to center content
      const tx = canvasWidth / 2 - contentCenterX * scale;
      const ty = canvasHeight / 2 - contentCenterY * scale;

      dispatch({ 
        type: ACTIONS.UPDATE_VIEW, 
        payload: { scale, tx, ty } 
      });
    }, [state.scene.seats, state.scene.rows, state.scene.elements]),

    addRow: useCallback((row) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ADD_ROW, payload: row });
    }, []),

    addSeat: useCallback((seat) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ADD_SEAT, payload: seat });
    }, []),

    updateRow: useCallback((id, updates, saveHistory = true) => {
      if (saveHistory) {
        dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      }
      dispatch({ type: ACTIONS.UPDATE_ROW, payload: { id, updates } });
    }, []),

    deleteItems: useCallback((ids) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.DELETE_ITEMS, payload: ids });
    }, []),

    toggleGrid: useCallback(() => {
      dispatch({ type: ACTIONS.TOGGLE_GRID });
    }, []),

    undo: useCallback(() => {
      dispatch({ type: ACTIONS.UNDO });
    }, []),

    redo: useCallback(() => {
      dispatch({ type: ACTIONS.REDO });
    }, []),

    loadScene: useCallback((scene) => {
      dispatch({ type: ACTIONS.LOAD_SCENE, payload: scene });
    }, []),

    moveSeats: useCallback((seatIds, deltaX, deltaY) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.MOVE_SEATS,
        payload: { seatIds, deltaX, deltaY },
      });
    }, []),

    updateSeat: useCallback((seatId, updates, saveHistory = true) => {
      if (saveHistory) {
        dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      }
      dispatch({
        type: ACTIONS.UPDATE_SEAT,
        payload: { seatId, updates },
      });
    }, []),

    updateSeats: useCallback((seatIds, updates, saveHistory = true) => {
      if (saveHistory) {
        dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      }
      dispatch({
        type: ACTIONS.UPDATE_SEATS,
        payload: { seatIds, updates },
      });
    }, []),

    ensureSectionExists: useCallback(() => {
      // Check if any sections exist, create one if not
      const sections = Object.keys(state.scene.sections);
      if (sections.length === 0) {
        const defaultCategoryId =
          state.scene.venue.categories[0]?.id || "default";
        const defaultSection = createSection("w", defaultCategoryId);
        dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
        dispatch({
          type: ACTIONS.LOAD_SCENE,
          payload: {
            ...state.scene,
            sections: {
              [defaultSection.id]: defaultSection,
            },
            venue: {
              ...state.scene.venue,
              sections: [defaultSection.id],
            },
          },
        });
        return defaultSection.id;
      }
      return sections[0];
    }, [state.scene]),

    copyRows: useCallback(() => {
      if (state.selectedIds.length === 0) return;
      dispatch({ type: ACTIONS.COPY_ROWS });
    }, [state.selectedIds]),

    pasteRows: useCallback(
      (offset) => {
        if (state.clipboard.isEmpty) return;
        dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
        dispatch({ type: ACTIONS.PASTE_ROWS, payload: { offset } });
      },
      [state.clipboard],
    ),

    adjustSeatSpacing: useCallback((seatIds, spacingDelta) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.ADJUST_SEAT_SPACING,
        payload: { seatIds, spacingDelta },
      });
    }, []),

    rotateSelectedSeats: useCallback((angle) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.ROTATE_SELECTED_SEATS,
        payload: { angle },
      });
    }, []),

    addElement: useCallback((element) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ADD_ELEMENT, payload: element });
    }, []),

    updateElement: useCallback((id, updates, saveHistory = true) => {
      if (saveHistory) {
        dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      }
      dispatch({ type: ACTIONS.UPDATE_ELEMENT, payload: { id, updates } });
    }, []),

    moveElements: useCallback((elementIds, deltaX, deltaY) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.MOVE_ELEMENTS,
        payload: { elementIds, deltaX, deltaY },
      });
    }, []),

    addImage: useCallback((image) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ADD_IMAGE, payload: image });
    }, []),

    updateImage: useCallback((id, updates) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.UPDATE_IMAGE, payload: { id, updates } });
    }, []),

    lockImage: useCallback((id) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.LOCK_IMAGE, payload: { id } });
    }, []),

    unlockImage: useCallback((id) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.UNLOCK_IMAGE, payload: { id } });
    }, []),

    completePath: useCallback(() => {
      dispatch({ type: ACTIONS.COMPLETE_PATH });
    }, []),

    updateGlobalSettings: useCallback((settings) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.UPDATE_GLOBAL_SETTINGS, payload: settings });
    }, []),

    updateToolSettings: useCallback((toolType, settings) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.UPDATE_TOOL_SETTINGS,
        payload: { toolType, settings },
      });
    }, []),

    assignTableLabels: useCallback(() => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ASSIGN_TABLE_LABELS });
    }, []),

    groupElements: useCallback(() => {
      // Filter to only include actual elements (not seats or rows)
      const elementIds = state.selectedIds.filter(
        (id) =>
          state.scene.elements[id] &&
          !state.scene.seats[id] &&
          !state.scene.rows[id],
      );

      if (elementIds.length < 2) return; // Need at least 2 elements to group

      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.GROUP_ELEMENTS,
        payload: { elementIds },
      });
    }, [state.selectedIds, state.scene]),

    ungroupElements: useCallback((groupId) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.UNGROUP_ELEMENTS, payload: { groupId } });
    }, []),

    commitToHistory: useCallback(() => {
      dispatch({ type: ACTIONS.COMMIT_TO_HISTORY });
    }, []),

    cancelDrawing: useCallback(() => {
      dispatch({ type: ACTIONS.CANCEL_DRAWING });
    }, []),

    addTableWithSeats: useCallback((table, seats) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ADD_TABLE_WITH_SEATS, payload: { table, seats } });
    }, []),

    updateTableGroup: useCallback((table, oldSeats, config) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.UPDATE_TABLE_GROUP, payload: { table, oldSeats, config } });
    }, []),
  };
}
