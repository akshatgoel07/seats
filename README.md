# seat-layout-v4

An interactive browser renderer for very large venue seat maps. It draws seat
maps up to 250,000 seats using **WebGPU** as the primary backend, a **Rust +
WebAssembly** core for the performance-critical data work (spatial index, hit
testing, viewport culling, instance-buffer generation), and a **WebGL2**
fallback behind the same graphics interface. The architecture follows the
lessons of Figma's WebGPU migration: all rendering goes through an internal
graphics API with explicit per-draw state and encode-then-submit uniform
batching, shaders are authored once per backend behind a shared TypeScript
contract, and the backend is chosen dynamically — sessions start on WebGPU and
transparently rebuild on WebGL2 on failure rather than statically gating on
capabilities. Reference: [Figma — Rendering powered by
WebGPU](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/).

## Quickstart

### Prerequisites

Node and the Rust/WASM toolchain live under Homebrew on the dev machine, and are
not on the default `PATH`. Prefix commands (or export it in your shell) so the
tools resolve:

```sh
export PATH="/opt/homebrew/bin:$PATH"
```

Verified toolchain on the dev machine:

- Node `v24.2.0`, npm `11.3.0` (`/opt/homebrew/bin`)
- Rust / Cargo `1.87.0` (`/opt/homebrew/bin`)
- `wasm-pack` — install once: `brew install wasm-pack`

If the Homebrew Rust toolchain cannot compile the `wasm32-unknown-unknown`
target when building the WASM core, install a rustup-managed toolchain instead:

```sh
brew install rustup-init
rustup-init -y --default-toolchain 1.87.0
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

### Install, build, run

All npm scripts run from `app/`:

```sh
cd app
npm install
npm run build:wasm   # compiles core/ (Rust) into app/src/generated/wasm/ via wasm-pack
npm run dev          # Vite dev server — open the printed URL, demo at /, benchmark at /bench.html
```

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (demo page `/`, benchmark page `/bench.html`). |
| `npm run build:wasm` | Build the Rust WASM core into `app/src/generated/wasm/`. |
| `npm run build` | Production build (`vite build`). |
| `npm run preview` | Serve the production build. |
| `npm test` | Unit tests (`vitest run`). |
| `npm run test:e2e` | Playwright browser tests (WebGL2 by default; see below). |
| `npm run bench` | Scripted benchmark runner (`scripts/bench.mjs`) over real Chrome. |
| `npm run lint` | ESLint. |
| `npm run format` | Prettier write. |

WebGPU Playwright tests are env-gated and skipped unless `ENABLE_WEBGPU_E2E=1`
is set (headless CI runs WebGL2 only). See
[docs/browser-support.md](app/docs/browser-support.md).

## Architecture overview

```text
                       index.html (/)                 bench.html (/bench.html)
                            │                                   │
                     src/main.ts                          src/bench-main.ts
                            │                                   │
                   ┌────────▼────────┐                 ┌────────▼────────┐
                   │     DemoApp     │                 │     BenchApp    │
                   │ (sidebar, URL   │                 │ (scripted       │
                   │  params, events)│                 │  scenarios)     │
                   └────────┬────────┘                 └────────┬────────┘
                            │                                   │
                            └───────────────┬───────────────────┘
                                            │
                            ┌───────────────▼────────────────┐
                            │     GraphicsFallbackManager     │
                            │  pick backend (forced / detect  │
                            │  / blocklist); post-load self-   │
                            │  test; device-lost & validation  │
                            │  errors → rebuild on WebGL2      │
                            └───────────────┬────────────────┘
                                            │ device + pipeline
                            ┌───────────────▼────────────────┐
                            │      SeatRenderer + Camera2D    │
                            │  pan / wheel-zoom / pinch; per-  │
                            │  frame viewport cull; LOD (dots  │
                            │  ↔ glyphs); hover + click pick   │
                            └───────┬────────────────┬────────┘
                                    │                │
             GraphicsDevice (interface, explicit     │  queryViewport / hitTest
             per-draw state, encode→submit uniforms) │  setStateFlags
                     ┌──────────────┴──────┐         │
                     ▼                     ▼         ▼
             ┌──────────────┐     ┌──────────────┐  ┌───────────────────────────┐
             │  WebGpuDevice│     │  WebGl2Device│  │  SeatLayoutCore (WASM/Rust)│
             │  + WGSL seat │     │  + GLSL seat │  │  spatial grid index,       │
             │  pipeline    │     │  pipeline    │  │  hit test, culling,        │
             └──────────────┘     └──────────────┘  │  instance-buffer generation│
                     ▲                     ▲         └─────────────┬─────────────┘
                     │  GPU upload of dirty instance ranges        │
                     └──────────────────────┬──────────────────────┘
                                            │ zero-copy typed-array views
                                            │ over WebAssembly.Memory
                                            ▼
                         24-byte interleaved instance buffer
                    (x, y, size, rotation, colorIndex, stateFlags)

  Shared contracts (src/shared/): instance-layout.ts (stride/offsets/flag bits,
  kept byte-for-byte consistent with core/src/instance.rs), seat-map.ts, events.ts
```

**Data flow.** A seat map document (sections → rows → seats) is flattened and
loaded into the Rust WASM core, which owns one interleaved 24-byte-stride
instance buffer in linear memory. JS reads that buffer through zero-copy
`Float32Array`/`Uint32Array` views over `WebAssembly.Memory`. Each frame the
renderer asks the core to cull the viewport (`queryViewport`) and draws only the
visible instance ranges; hover and selection call `setStateFlags`, which marks
record-aligned dirty ranges that JS coalesces and uploads to the GPU buffer.
Picking is CPU-side via the WASM spatial index (`hitTest`) — no GPU readback.

## Documentation

- [app/docs/adr-001-architecture.md](app/docs/adr-001-architecture.md) —
  architecture decisions (Rust WASM core, dual shader set, 24-byte instance
  layout, repo layout).
- [app/docs/goal-plan.md](app/docs/goal-plan.md) — objective, scope, performance
  budgets, and phased execution plan.
- [app/docs/manual-qa-checklist.md](app/docs/manual-qa-checklist.md) — ~10-minute
  human QA script.
- [app/docs/browser-support.md](app/docs/browser-support.md) — support matrix,
  fallback triggers, known limitations.
- [app/docs/benchmarks/README.md](app/docs/benchmarks/README.md) — recorded
  baseline benchmark table and how to regenerate it.

## URL parameters

Both the demo (`/`) and benchmark (`/bench.html`) pages read query parameters:

| Param | Values | Default | Effect |
| --- | --- | --- | --- |
| `layout` | `grid`, `arena`, `stadium` | `stadium` | Fixture layout generated for the demo. |
| `seats` | `1000`, `10000`, `100000`, `250000` | `10000` | Seat count (clamped up to the nearest supported size). |
| `backend` | `webgpu`, `webgl2` | auto | Force a renderer backend (skips WebGPU detection when `webgl2`). |
| `failGpuAfterMs` | integer ≥ 0 (ms) | off | After the first frame, inject a forced WebGPU failure to exercise the WebGL2 fallback. |

Example: `/?layout=grid&seats=100000&backend=webgpu&failGpuAfterMs=500`.

`bench.html` is the standalone benchmark page driven by `npm run bench`; it reads
the same `layout`/`seats`/`backend` params per scenario.

## Public event API

The renderer exposes a typed event emitter (`app/src/shared/events.ts`).
Subscribe with `renderer.on(name, listener)` (returns an unsubscribe function);
`off`, `addEventListener`, and `removeEventListener` are also available.

| Event | Payload | Fires when |
| --- | --- | --- |
| `seatHover` | `SeatLayoutSeatInfo \| null` | Pointer moves onto a seat (`null` when leaving all seats). |
| `seatSelect` | `SeatLayoutSeatSelectPayload` (`SeatLayoutSeatInfo` + `selected: boolean`) | A seat is clicked/toggled. |
| `selectionChange` | `SeatLayoutSelectionChangePayload` (`selectedIndices: readonly number[]`) | The set of selected seats changes. |

`SeatLayoutSeatInfo` carries `seatIndex`, `seatId`, `sectionId`, `sectionName`,
`rowId`, `rowLabel`, and `seatLabel`.

## Benchmarks

Recorded baseline numbers for both backends at 1k / 10k / 100k / 250k seats live
in [app/docs/benchmarks/README.md](app/docs/benchmarks/README.md) (regenerated by
`npm run bench`). They are machine-specific (Apple Silicon, Chrome stable);
regenerate on the target machine before treating any row as authoritative.
