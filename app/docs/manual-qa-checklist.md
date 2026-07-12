# Manual QA checklist

A step-by-step script a human can run in about 10 minutes to sanity-check the
seat-map renderer before a release. Run it in **Chrome or Edge (stable)** on the
dev machine, where WebGPU is available.

## Conventions

- All commands run from `app/` with `export PATH="/opt/homebrew/bin:$PATH"` set.
- Open Chrome DevTools (Cmd+Opt+I). Most checks read two globals in the
  **Console**:
  - `__seatLayoutDemoStatus` — the demo's current render state (set by
    `DemoApp`). Look at `.state` (`initializing` → `rendered`), `.backend`
    (`webgpu` / `webgl2`), `.instanceCount`, and, after a fallback, `.fellBack`
    and `.reason`.
  - `__seatLayoutFrameStats` — per-frame stats (set by `SeatRenderer`):
    `avgFrameMs`, `p95FrameMs`, `lastVisibleInstanceCount`, `lastDrawRangeCount`,
    `lastLodLevel` (0 = dots, 1 = full glyph).
  - Helpers: `__seatLayoutInteractionLog` (last 100 hover/select/change events)
    and `__seatLayoutPickAt(clientX, clientY)`.

## 0. Start the dev server (~30s)

```sh
cd app
npm run build:wasm   # only needed if the WASM core changed or was never built
npm run dev
```

Open the printed URL (e.g. `http://localhost:5173/`).

## 1. WebGPU render check (~1 min)

1. Load `/` with no params (defaults: `stadium`, 10,000 seats).
2. Expect a seat map to appear centered and fit to the viewport, seats colored by
   category, on a white background.
3. In the Console: `__seatLayoutDemoStatus` → `state: "rendered"`, `backend:
   "webgpu"`, `instanceCount: 10000`, and **no** `fellBack` field.
4. `__seatLayoutFrameStats` → non-zero `frameCount`, `avgFrameMs` roughly at the
   display refresh interval (~16.7 ms at 60 Hz), `lastVisibleInstanceCount` > 0.

## 2. Zoom / pan / pinch (~1.5 min)

1. **Wheel zoom**: scroll up over the map — it zooms toward the cursor. Zoom in
   far and confirm `__seatLayoutFrameStats.lastLodLevel` becomes `1` (glyphs);
   zoom back out and confirm it returns to `0` (dots).
2. **Drag pan**: press and drag with the mouse — the map follows the pointer and
   stays clamped to content bounds (you cannot fling it off into empty space).
3. **Pinch** (trackpad or touch): two-pointer pinch zooms about the midpoint.
   `lastVisibleInstanceCount` should drop as you zoom in (viewport culling
   working) and rise as you zoom out.

## 3. Hover cursor + highlight (~1 min)

1. Move the pointer over a seat. The cursor changes to a pointer/hand over a
   seat and back to default over empty space.
2. The hovered seat shows a hover highlight.
3. Console: `__seatLayoutInteractionLog` ends with a `seatHover` entry carrying
   the seat's `sectionName` / `rowLabel` / `seatLabel`; moving off all seats
   pushes a `seatHover` entry with `payload: null`.

## 4. Select / deselect + sidebar (~1.5 min)

1. Click a seat. It shows the selected state, and the top-right **selection
   panel** updates its "N selected" count and lists
   `Section / Row X / Seat Y`.
2. Click the same seat again to deselect — it leaves the list and the count
   drops.
3. Select a few seats, then click **Clear** — selection empties, count returns to
   `0 selected`, the button disables.
4. Console: `__seatLayoutInteractionLog` shows `seatSelect` (with `selected:
   true/false`) and `selectionChange` (with the current `selectedIndices`).

## 5. WebGL2 parity pass (~1.5 min)

1. Load `/?backend=webgl2` (keep the same layout/seats).
2. `__seatLayoutDemoStatus.backend` → `"webgl2"` (this path is forced, so it does
   **not** try WebGPU first, and `fellBack` is absent).
3. Repeat spot checks from steps 1–4: render appears, zoom/pan work, hover
   highlights, click selects and updates the sidebar. Visual output should match
   the WebGPU pass.

## 6. Fault-injection fallback check (~1.5 min)

1. Load `/?backend=webgpu&failGpuAfterMs=500`.
2. The map first renders on WebGPU, then ~500 ms later a forced WebGPU failure is
   injected and the renderer transparently rebuilds on WebGL2.
3. `__seatLayoutDemoStatus` → `state: "rendered"`, `backend: "webgl2"`,
   `fellBack: true`, and a `reason` mentioning the forced failure.
4. Confirm interaction still works after the fallback: hover highlights and
   clicking a seat still selects it and updates the sidebar (selection survives
   the backend rebuild).

## 7. 250k load sanity (~1 min)

1. Load `/?seats=250000` (optionally `&layout=arena`).
2. The map renders without errors; `__seatLayoutDemoStatus.instanceCount` is
   `250000`.
3. Zoom/pan stays interactive. `__seatLayoutFrameStats.p95FrameMs` stays within a
   smooth range (per the goal-plan §4 budget, 250k targets ≥ 30 fps ≈ ≤ ~33 ms).
4. No console errors; `lastVisibleInstanceCount` is far below 250k when zoomed in
   (culling keeps per-frame work bounded).

## Pass criteria

All seven sections complete with the expected `__seatLayoutDemoStatus` and no
uncaught console errors. Any `state: "error"` / `state: "lost"` /
`state: "unsupported"` observed outside the intentional step 6 injection is a
failure.
