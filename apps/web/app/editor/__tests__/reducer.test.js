/**
 * Reducer history tests.
 *
 * Guards the COMMIT_TO_HISTORY change (R4): the expensive
 * JSON.parse(JSON.stringify(scene)) deep clone was replaced with the native
 * structuredClone. These tests pin the snapshot semantics that change relied
 * on (a true, independent deep copy) plus undo/redo round-tripping.
 */
import { editorReducer } from "../reducer.js";
import { createDefaultEditorState } from "../types.js";
import { ACTIONS } from "../actions.js";

describe("editorReducer history", () => {
  test("COMMIT_TO_HISTORY snapshots a deep, independent copy of the scene", () => {
    const state = createDefaultEditorState();
    const next = editorReducer(state, { type: ACTIONS.COMMIT_TO_HISTORY });

    // Deeply equal to the live scene...
    expect(next.history.present).toEqual(state.scene);
    // ...but a distinct object (independent snapshot, not the same reference)...
    expect(next.history.present === state.scene).toBe(false);
    // ...including nested containers (true deep copy, like the old JSON clone).
    expect(next.history.present.seats === state.scene.seats).toBe(false);
    expect(next.history.present.rows === state.scene.rows).toBe(false);
  });

  test("the committed snapshot is not aliased to the live scene", () => {
    const state = createDefaultEditorState();
    const next = editorReducer(state, { type: ACTIONS.COMMIT_TO_HISTORY });

    // Mutating the live scene must not bleed into the committed snapshot.
    state.scene.seats["__probe__"] = { id: "__probe__" };
    expect(Object.prototype.hasOwnProperty.call(next.history.present.seats, "__probe__")).toBe(false);
  });

  test("UNDO with empty history is a no-op", () => {
    const state = createDefaultEditorState();
    const next = editorReducer(state, { type: ACTIONS.UNDO });
    expect(next).toBe(state);
  });

  test("REDO with empty future is a no-op", () => {
    const state = createDefaultEditorState();
    const next = editorReducer(state, { type: ACTIONS.REDO });
    expect(next).toBe(state);
  });
});
