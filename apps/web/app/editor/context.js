import React, { createContext, useContext, useReducer } from "react";
import { createDefaultEditorState } from "./types.js";
import { editorReducer } from "./reducer.js";
import { useActionCreators } from "./actions.js";

const EditorContext = createContext(/** @type {any} */ (null));

export function EditorProvider({ children }) {
  const [state, dispatch] = useReducer(
    editorReducer,
    createDefaultEditorState(),
  );

  const actions = useActionCreators(dispatch, state);

  return (
    <EditorContext.Provider value={{ state, actions }}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return context;
}
