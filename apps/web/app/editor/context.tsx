import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useMemo,
} from "react";
import type { ReactNode } from "react";
import { createDefaultEditorState } from "./types.ts";
import type { EditorState } from "./types.ts";
import { editorReducer } from "./reducer.ts";
import { useActionCreators } from "./actions.ts";

type EditorActions = ReturnType<typeof useActionCreators>;
type EditorContextValue = {
  state: EditorState;
  actions: EditorActions;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    editorReducer,
    createDefaultEditorState(),
  );

  const actions = useActionCreators(dispatch, state);

  // Dev-only test bridge: exposes editor state on window so browser
  // automation (Chrome DevTools MCP / E2E) can verify scene mutations that
  // happen behind the <canvas> (seats/rows/elements are not DOM nodes).
  // No-op in production builds.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "production") return;
    /** @type {any} */ (window).__EDITOR__ = {
      state,
      actions,
      summary: () => ({
        tool: state.currentTool,
        selected: state.selectedIds.length,
        rows: Object.keys(state.scene.rows || {}).length,
        seats: Object.keys(state.scene.seats || {}).length,
        elements: Object.keys(state.scene.elements || {}).length,
        sections: Object.keys(state.scene.sections || {}).length,
        gridVisible: state.isGridVisible,
        view: state.scene.view,
      }),
    };
  }, [state, actions]);

  // `actions` is now referentially stable (see useActionCreators), so the
  // context value only changes identity when `state` changes — not on every
  // render — and the stable `actions` reference flows to consumers so their
  // action-dependent memoized callbacks/effects stop tearing down each render.
  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return context;
}
