# Goal plan: seat-layout-v4 — WebGPU + WebAssembly seat map renderer

Status: **COMPLETE (2026-07-12).** All tasks T0–T10 delivered and verified; both independent reviews returned no blocking findings; all §4 budgets PASS on recorded baselines (see `app/docs/benchmarks/`). Residual non-blocking follow-ups for v4.1 are listed in §9.
Owner: Fable (planning and orchestration only, per `agent-responsibility-and-model-routing.md`).
Reference architecture: [Figma — Rendering powered by WebGPU](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/).

## 1. Objective

Build seat-layout-v4: an interactive venue seat-map renderer for the browser that renders very large seat maps (target 100k seats smooth, 250k functional) using WebGPU as the primary backend, a WebAssembly core for performance-critical data work, and a WebGL2 fallback — following the architecture lessons from Figma's WebGPU migration.

## 2. Architecture principles (derived from the reference article)

1. **Graphics interface abstraction with explicit draw state.** All rendering goes through an internal graphics API where every draw call receives its full state (`draw(vertexBuffer, target, textures, material, uniforms…)`). No implicit global bindings. This is what makes a WebGL2 fallback backend feasible behind one interface.
2. **Encode-then-submit uniform batching.** Draw calls are encoded with their uniform struct data; `submit()` uploads all uniform data as one GPU buffer and issues draws with offsets (WebGPU). The WebGL2 backend can fall back to per-draw uniform calls behind the same API.
3. **Single-source shaders.** Author shaders once; generate the second backend's variant mechanically (WGSL-first with translation, or a minimal shared shader set — Phase 0 ADR decides). Never hand-maintain two divergent shader trees.
4. **Dynamic fallback, not static capability gating.** Start sessions on WebGPU; run asynchronous compatibility self-tests after load; on failure or mid-session device error, transparently rebuild on WebGL2. Keep a blocklist hook for problem devices.
5. **Benchmark-driven acceptance.** Every rendering phase lands with recorded benchmark numbers; regressions block completion.

## 3. Product scope

- Load a seat map document: sections → rows → seats (position, rotation, radius/size, category, availability status, label).
- Render seat maps of 1k / 10k / 100k / 250k seats.
- Pan/zoom camera (pointer drag, wheel, pinch) with viewport culling and LOD (far: colored dots; near: seat glyphs + selection states; label rendering only at close zoom).
- Interaction: hover highlight, click select/deselect, and a typed event API (`seatHover`, `seatSelect`, `selectionChange`) for the host app.
- Availability/category color mapping supplied by config.
- Demo page + benchmark page in the same Vite app.

Out of scope for v4.0: seat-map editing/authoring, server rendering, mobile-native builds, accessibility tree for individual seats (tracked as v4.1 candidates).

## 4. Performance budgets (acceptance gates)

Measured on the primary dev machine (Apple Silicon, Chrome stable) via the Phase 8 harness; recorded in `docs/benchmarks/`:

| Metric | Budget |
| --- | --- |
| Sustained FPS during scripted pan/zoom, 100k seats | ≥ 55 fps (p95 frame ≤ 18 ms) |
| Sustained FPS, 250k seats | ≥ 30 fps |
| Initial load-to-first-render, 100k seats | ≤ 1000 ms |
| Hit-test (hover query), 100k seats | ≤ 2 ms p95 |
| WASM instance-buffer rebuild after selection change, 100k seats | ≤ 5 ms |
| WebGL2 fallback, 100k seats | ≥ 30 fps |

## 5. Technology decisions (defaults; Phase 0 may amend with evidence)

- App shell: Vite + TypeScript (strict), vitest for unit tests, Playwright for browser smoke tests.
- WASM core: **Rust + wasm-bindgen/wasm-pack** (spatial grid index, viewport culling, hit testing, instance-buffer generation written into shared `Float32Array`/`Uint32Array` memory views — zero-copy JS↔WASM). C++/Emscripten is the alternative Phase 0 must explicitly reject or adopt.
- Seat geometry: GPU-instanced quads with SDF circle/rounded-rect fragment shading (one pipeline, per-instance attributes: position, size, rotation, colorIndex, stateFlags).
- Picking: CPU-side via the WASM spatial index (deterministic, no GPU readback stalls). GPU picking is a future optimization only.
- Fallback: WebGL2 backend behind the graphics abstraction; Canvas2D is explicitly not a target.

## 6. Phases and delegation packets

Execution is strictly sequential unless noted. Every task is delegated to a Codex subagent per the routing doc; Fable verifies evidence before marking complete.

Model routing note (corrected by user 2026-07-12): the routing doc's contained-task tier is **Claude Opus 4.8**, not a Codex model — contained tasks are delegated to Claude Opus 4.8 subagents directly. Complex tasks go to Codex: this ChatGPT account rejects `gpt-5.6*` model IDs, so **"Codex 5.6 SOL" → the account's configured default `gpt-5.5` at xhigh reasoning effort** (leave `--model` unset). T1 was dispatched to Codex spark before this correction; from T2 onward, contained tasks route to Opus 4.8.

### T0 — Architecture ADR (Codex 5.6 SOL, read-only + docs write)
- **Scope:** Investigate and decide: (a) Rust/wasm-bindgen vs C++/Emscripten for the WASM core; (b) shader single-source strategy (WGSL-first + naga translation vs minimal dual shader set); (c) instance buffer memory layout and JS↔WASM sharing strategy; (d) repo layout (`app/` web app + `core/` wasm crate).
- **Output:** `app/docs/adr-001-architecture.md` with decisions, rejected alternatives, and rationale.
- **Acceptance:** ADR answers all four questions with concrete file/module layout; no application code written.
- **Evidence:** the ADR file itself.

### T1 — Project scaffolding (Codex 4.8)
- **Scope:** Vite + TS strict app under `app/`, eslint + prettier, vitest, Playwright configured for Chrome, npm scripts (`dev`, `build`, `test`, `test:e2e`, `lint`). A blank page with a full-viewport `<canvas>` and a build that passes.
- **Depends on:** T0 (repo layout).
- **Tests:** `npm run build`, `npm test`, `npm run lint` all pass; one Playwright smoke test loads the page and asserts the canvas exists.
- **Prohibited:** rendering code, WASM tooling.
- **Evidence:** command outputs, file tree.

### T2 — Seat map data model + fixture generator (Codex 4.8)
- **Scope:** JSON schema + TS types for the seat map document; deterministic (seeded) fixture generator producing grid/arena/stadium layouts at 1k/10k/100k/250k seats; fixtures generated on demand (not committed at 250k).
- **Depends on:** T1.
- **Tests:** vitest unit tests for generator determinism, counts, bounds.
- **Evidence:** passing test output, sample fixture stats.

### T3 — WASM core (Codex 5.6 SOL)
- **Scope:** Rust crate (per ADR) exposing: load seat data; uniform spatial grid index; `queryViewport(rect) -> visible instance ranges`; `hitTest(x, y, radius) -> seatId`; instance-buffer generation into wasm memory exposed as typed-array views; incremental state updates (selection/hover/status) without full rebuild. Vite integration of the wasm-pack build.
- **Depends on:** T2.
- **Tests:** Rust unit tests (index correctness, hit-test edge cases: rotated seats, overlapping, boundary); TS integration test loading 100k fixture and asserting query/hitTest results; micro-bench numbers for hitTest and rebuild recorded in the task report.
- **Prohibited:** rendering code.
- **Evidence:** test output, bench numbers, exported API listing.

### T4 — Graphics abstraction + WebGPU backend (Codex 5.6 SOL)
- **Scope:** Internal graphics interface with explicit per-draw state and encode/submit uniform batching (§2.1–2.2); WebGPU device/surface init with device-lost handling; instanced seat pipeline (WGSL, SDF quad); bind-group caching.
- **Depends on:** T1 (parallelizable with T2/T3).
- **Tests:** unit tests for the encode/submit offset math; Playwright test renders a static 10k-seat scene and asserts non-blank canvas pixels.
- **Evidence:** passing tests, screenshot.

### T5 — Seat renderer + camera (Codex 5.6 SOL)
- **Scope:** Pan/zoom camera (drag, wheel, pinch) with world↔screen transforms; per-frame viewport culling through the WASM core; LOD thresholds (dots ↔ glyphs ↔ labels); category/status color mapping via palette uniform.
- **Depends on:** T3 + T4.
- **Tests:** camera math unit tests; Playwright: scripted zoom-in/zoom-out sequence screenshots at each LOD.
- **Benchmarks:** first recorded pan/zoom FPS run at 10k/100k (informal, harness lands in T8).
- **Evidence:** tests, screenshots, FPS notes.

### T6 — Interaction layer (Codex 5.6 SOL)
- **Scope:** Hover + click picking through WASM `hitTest`; hover/selection visual state via incremental instance updates; typed public event API; demo page wires events to a sidebar (selected seat list).
- **Depends on:** T5.
- **Tests:** unit tests for the event API; Playwright: click a known seat at a known zoom → assert selection event + visual change; hover latency sampled.
- **Evidence:** tests, event log excerpt, screenshot.

### T7 — WebGL2 fallback + dynamic fallback manager (Codex 5.6 SOL)
- **Scope:** WebGL2 backend implementing the graphics interface (per-draw uniform path); shader variant per ADR strategy; fallback manager: async post-load self-test, mid-session error → transparent renderer rebuild on WebGL2; forced-backend query param (`?backend=webgl2`) for testing; blocklist hook (config stub).
- **Depends on:** T5 (interaction not required).
- **Tests:** Playwright runs the T4/T5 render tests under `?backend=webgl2`; a fault-injection test forces a WebGPU error and asserts recovery on WebGL2 with scene intact.
- **Evidence:** tests under both backends, fallback log excerpt.

### T8 — Benchmark harness + recorded baselines (Codex 4.8 for harness; Codex 5.6 SOL if harness design gets hairy)
- **Scope:** `/bench` page running scripted pan/zoom/selection scenarios per fixture size; measures FPS, p50/p95 frame time, load-to-first-render, hitTest p95, rebuild time; JSON + markdown output to `docs/benchmarks/`; npm script `bench` drives it via Playwright.
- **Depends on:** T6, T7.
- **Evidence:** committed baseline results for both backends at all fixture sizes.

### T9 — Performance pass to budget (Codex 5.6 SOL)
- **Scope:** Profile against §4 budgets; fix bottlenecks (batching, buffer strategies, culling granularity, GC pressure); iterate until budgets pass or a budget is proven infeasible with profiling evidence (then Fable amends the plan).
- **Depends on:** T8.
- **Evidence:** before/after benchmark tables, profiling notes.

### T10 — Docs, manual test instructions, browser compat notes (Codex 4.8)
- **Scope:** README (architecture overview, dev workflow), manual QA checklist, browser support matrix (WebGPU availability, fallback behavior per browser), public API docs for the renderer component.
- **Depends on:** T9.
- **Evidence:** the docs; Fable review for accuracy against the implemented code.

### Independent review (Codex 5.6 SOL, read-only)
After T7 and after T9, a separate Codex subagent independently reviews the high-risk surfaces (graphics abstraction, WASM memory sharing, fallback manager) per the routing doc's high-risk review provision.

## 7. Completion conditions

1. All tasks T0–T10 completed with verified evidence (not subagent self-report).
2. All §4 budgets met, or explicitly re-negotiated in this document with profiling evidence.
3. `npm run build && npm test && npm run test:e2e && npm run bench` all pass from a clean checkout.
4. Both independent reviews completed and their blocking findings resolved.
5. Final implementation summary produced by Fable from verified results.

## 8. Resolved blockers (execution log)

- Codex CLI token expired → user re-authenticated via `codex login`; a stale pre-login `codex app-server` also had to be killed once.
- Codex sandbox had no network → enabled `network_access = true` under `[sandbox_workspace_write]` in `~/.codex/config.toml` (backup: `config.toml.bak-20260712`).
- Codex sandbox blocked `.git` creation → granted the repo's `.git` path as an explicit `writable_roots` entry so Codex subagents could commit.
- `wasm32-unknown-unknown` unavailable in Homebrew Rust → provisioned rustup stable (rustc 1.97.0) + wasm-pack 0.15.0 (ADR §Context fallback path).
- Headless Chromium lacks WebGPU (and real WebGL2 in-sandbox) → all rendering evidence was verified by the orchestrator in real Chrome (Playwright `channel: 'chrome'`, headed); WebGPU e2e specs are env-gated behind `ENABLE_WEBGPU_E2E`.
- T4 initially shipped invalid WGSL (missing `@interpolate(flat)` on integral varyings) that only real-browser verification caught — fixed, plus GPU error surfacing and a static shader contract test.

## 9. Residual non-blocking follow-ups (v4.1 candidates)

From the second independent review (verdict: APPROVED):

1. `FallbackManager.ts:120-152, 197-204` — add disposal re-checks after awaits during *initial* backend creation (the fallback path already has them).
2. `scripts/bench.mjs:90-99` + `BenchApp.ts:190-196` — decide whether budget PASS should also gate on `panZoom.minFps`, not only average FPS.
3. `BenchApp.ts:141-218` — reset the camera to a deterministic pose before the hit-test phase.
4. `scripts/bench.mjs:225-274` — "Latest baseline" README line can go stale; regenerate it on every run.

Deferred product scope (§3): seat text labels (`TODO_SEAT_LABEL_MIN_SCREEN_PX`), seat-map editing, server rendering, per-seat accessibility tree.
