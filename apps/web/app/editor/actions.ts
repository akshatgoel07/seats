import { useMemo, useRef } from "react";
import { generateId, createSection } from "./types.ts";
import type {
  EditorElement,
  EditorRow,
  EditorScene,
  EditorSeat,
  EditorState,
  Point,
} from "./types.ts";
import { generateSeatsForRow } from "./geometry.ts";
import type { Dispatch } from "react";

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

type EditorAction = { type: string; payload?: unknown };
type ViewUpdates = Partial<EditorScene["view"]>;
type Settings = Record<string, unknown>;

export function useActionCreators(
  dispatch: Dispatch<EditorAction>,
  state: EditorState,
) {
  // Keep a ref to the latest committed state so the few action creators that
  // need to read current state can stay referentially stable instead of being
  // rebuilt every render.
  const stateRef = useRef(state);
  stateRef.current = state;

  // `dispatch` from useReducer is referentially stable, so this object is built
  // once and keeps a stable identity across renders. That stable identity is the
  // firewall that lets memoized consumers (Toolbar/PropertiesPanel/CanvasStage)
  // actually skip re-rendering when only unrelated state changes (R2).
  return useMemo(() => {
    return {
      setTool: (tool: string) => {
      dispatch({ type: ACTIONS.SET_TOOL, payload: tool });
    },

      setSelection: (ids: string[]) => {
      dispatch({ type: ACTIONS.SET_SELECTION, payload: ids });
    },

      addToSelection: (id: string) => {
      dispatch({ type: ACTIONS.ADD_TO_SELECTION, payload: id });
    },

    clearSelection: () => {
      dispatch({ type: ACTIONS.CLEAR_SELECTION });
    },

      updateView: (viewUpdates: ViewUpdates) => {
      dispatch({ type: ACTIONS.UPDATE_VIEW, payload: viewUpdates });
    },

    // Zoom to fit all content in the viewport
      zoomToFit: (canvasWidth: number, canvasHeight: number, padding = 50) => {
      const { seats, elements } = stateRef.current.scene;

      // Calculate bounding box of all content
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let hasContent = false;

      // Include seats. NOTE: scene.seats is a map keyed by id (not an array),
      // and seat positions are localX/localY — the previous code iterated it as
      // an array and read seat.x/seat.y, so it threw and zoom-to-fit silently
      // never worked.
      Object.values(seats).forEach((seat) => {
        hasContent = true;
        const halfWidth = (seat.width || 20) / 2;
        const halfHeight = (seat.height || 20) / 2;
        minX = Math.min(minX, seat.localX - halfWidth);
        minY = Math.min(minY, seat.localY - halfHeight);
        maxX = Math.max(maxX, seat.localX + halfWidth);
        maxY = Math.max(maxY, seat.localY + halfHeight);
      });

      // Include elements (also a map keyed by id)
      Object.values(elements).forEach((element) => {
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
          element.points.forEach((pt: Point) => {
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
    },

      addRow: (row: EditorRow) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ADD_ROW, payload: row });
    },

      addSeat: (seat: EditorSeat) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ADD_SEAT, payload: seat });
    },

      updateRow: (id: string, updates: Partial<EditorRow>, saveHistory = true) => {
      if (saveHistory) {
        dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      }
      dispatch({ type: ACTIONS.UPDATE_ROW, payload: { id, updates } });
    },

      deleteItems: (ids: string[]) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.DELETE_ITEMS, payload: ids });
    },

    toggleGrid: () => {
      dispatch({ type: ACTIONS.TOGGLE_GRID });
    },

    undo: () => {
      dispatch({ type: ACTIONS.UNDO });
    },

    redo: () => {
      dispatch({ type: ACTIONS.REDO });
    },

      loadScene: (scene: EditorScene) => {
      dispatch({ type: ACTIONS.LOAD_SCENE, payload: scene });
    },

      moveSeats: (seatIds: string[], deltaX: number, deltaY: number) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.MOVE_SEATS,
        payload: { seatIds, deltaX, deltaY },
      });
    },

      updateSeat: (
        seatId: string,
        updates: Partial<EditorSeat>,
        saveHistory = true,
      ) => {
      if (saveHistory) {
        dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      }
      dispatch({
        type: ACTIONS.UPDATE_SEAT,
        payload: { seatId, updates },
      });
    },

      updateSeats: (
        seatIds: string[],
        updates: Partial<EditorSeat>,
        saveHistory = true,
      ) => {
      if (saveHistory) {
        dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      }
      dispatch({
        type: ACTIONS.UPDATE_SEATS,
        payload: { seatIds, updates },
      });
    },

    ensureSectionExists: () => {
      // Check if any sections exist, create one if not
      const sections = Object.keys(stateRef.current.scene.sections);
      if (sections.length === 0) {
        const defaultCategoryId =
          stateRef.current.scene.venue.categories[0]?.id || "default";
        const defaultSection = createSection("w", defaultCategoryId);
        dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
        dispatch({
          type: ACTIONS.LOAD_SCENE,
          payload: {
            ...stateRef.current.scene,
            sections: {
              [defaultSection.id]: defaultSection,
            },
            venue: {
              ...stateRef.current.scene.venue,
              sections: [defaultSection.id],
            },
          },
        });
        return defaultSection.id;
      }
      return sections[0];
    },

    copyRows: () => {
      if (stateRef.current.selectedIds.length === 0) return;
      dispatch({ type: ACTIONS.COPY_ROWS });
    },

      pasteRows: (offset: Point) => {
      if (stateRef.current.clipboard.isEmpty) return;
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.PASTE_ROWS, payload: { offset } });
    },

      adjustSeatSpacing: (seatIds: string[], spacingDelta: number) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.ADJUST_SEAT_SPACING,
        payload: { seatIds, spacingDelta },
      });
    },

      rotateSelectedSeats: (angle: number) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.ROTATE_SELECTED_SEATS,
        payload: { angle },
      });
    },

      addElement: (element: EditorElement) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ADD_ELEMENT, payload: element });
    },

      updateElement: (
        id: string,
        updates: Partial<EditorElement>,
        saveHistory = true,
      ) => {
      if (saveHistory) {
        dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      }
      dispatch({ type: ACTIONS.UPDATE_ELEMENT, payload: { id, updates } });
    },

      moveElements: (elementIds: string[], deltaX: number, deltaY: number) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.MOVE_ELEMENTS,
        payload: { elementIds, deltaX, deltaY },
      });
    },

      addImage: (image: EditorElement) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ADD_IMAGE, payload: image });
    },

      updateImage: (id: string, updates: Partial<EditorElement>) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.UPDATE_IMAGE, payload: { id, updates } });
    },

      lockImage: (id: string) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.LOCK_IMAGE, payload: { id } });
    },

      unlockImage: (id: string) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.UNLOCK_IMAGE, payload: { id } });
    },

    completePath: () => {
      dispatch({ type: ACTIONS.COMPLETE_PATH });
    },

      updateGlobalSettings: (settings: Settings) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.UPDATE_GLOBAL_SETTINGS, payload: settings });
    },

      updateToolSettings: (toolType: string, settings: Settings) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.UPDATE_TOOL_SETTINGS,
        payload: { toolType, settings },
      });
    },

    assignTableLabels: () => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ASSIGN_TABLE_LABELS });
    },

    groupElements: () => {
      // Filter to only include actual elements (not seats or rows)
      const elementIds = stateRef.current.selectedIds.filter(
        (id) =>
          stateRef.current.scene.elements[id] &&
          !stateRef.current.scene.seats[id] &&
          !stateRef.current.scene.rows[id],
      );

      if (elementIds.length < 2) return; // Need at least 2 elements to group

      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({
        type: ACTIONS.GROUP_ELEMENTS,
        payload: { elementIds },
      });
    },

      ungroupElements: (groupId: string) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.UNGROUP_ELEMENTS, payload: { groupId } });
    },

    commitToHistory: () => {
      dispatch({ type: ACTIONS.COMMIT_TO_HISTORY });
    },

    cancelDrawing: () => {
      dispatch({ type: ACTIONS.CANCEL_DRAWING });
    },

      addTableWithSeats: (table: EditorElement, seats: EditorSeat[]) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.ADD_TABLE_WITH_SEATS, payload: { table, seats } });
    },

      updateTableGroup: (
        table: EditorElement,
        oldSeats: EditorSeat[],
        config: Settings,
      ) => {
      dispatch({ type: ACTIONS.SAVE_TO_HISTORY });
      dispatch({ type: ACTIONS.UPDATE_TABLE_GROUP, payload: { table, oldSeats, config } });
    },
    };
  }, [dispatch]);
}
