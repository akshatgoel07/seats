# ADR-001: Architecture for seat-layout-v4

Status: Accepted

Date: 2026-07-12

## Context

seat-layout-v4 is a greenfield browser renderer for large venue seat maps. The approved plan requires a Vite + TypeScript app, a WebAssembly core for performance-critical data work, WebGPU as the primary renderer, and WebGL2 as the fallback renderer.

This ADR decides the four Phase 0 architecture questions so later tasks can implement without re-opening the same tradeoffs.

Toolchain checks were run on this machine from `/Users/ak07/enpointe/seat-layout-ui/seat-layout-v4`.

| Check | Result |
| --- | --- |
| `rustc --version` | `zsh:1: command not found: rustc` in the current PATH. Verified installed at `/opt/homebrew/bin/rustc`: `rustc 1.87.0 (17067e9ac 2025-05-09) (Homebrew)`. |
| `cargo --version` | `zsh:1: command not found: cargo` in the current PATH. Verified installed at `/opt/homebrew/bin/cargo`: `cargo 1.87.0 (Homebrew)`. |
| `wasm-pack --version` | `zsh:1: command not found: wasm-pack`; also missing with `/opt/homebrew/bin` added to PATH. Must be installed. |
| `emcc --version` | `zsh:1: command not found: emcc`; also missing with `/opt/homebrew/bin` added to PATH. Not required by this ADR's chosen path. |
| `node --version` | `zsh:1: command not found: node` in the current PATH. Verified installed at `/opt/homebrew/bin/node`: `v24.2.0`. |
| `npm --version` | `zsh:1: command not found: npm` in the current PATH. Verified with `PATH=/opt/homebrew/bin:$PATH npm --version`: `11.3.0`. |
| `/opt/homebrew/bin/brew --version` | `Homebrew 6.0.6`. |

Required shell setup before T1/T3:

```sh
export PATH="/opt/homebrew/bin:$PATH"
```

Required install for the selected WASM path:

```sh
brew install wasm-pack
```

If the Homebrew Rust toolchain cannot compile `wasm32-unknown-unknown` during T3, install a rustup-managed toolchain and target explicitly:

```sh
brew install rustup-init
rustup-init -y --default-toolchain 1.87.0
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

Emscripten is not required. If a future ADR reverses the WASM language decision, install it with:

```sh
brew install emscripten
```

## Decision

### 1. WASM core language and toolchain

Use Rust with `wasm-bindgen` and `wasm-pack`.

The Rust compiler and Cargo are already installed on the machine under `/opt/homebrew/bin`, while Emscripten is not installed. `wasm-pack` is missing, but it is a smaller project dependency than adopting the Emscripten toolchain and C++ build pipeline.

Rust is the better fit for this project because:

- `wasm-bindgen` gives a direct, typed JS boundary for the core API while still allowing explicit pointer/length exports for zero-copy typed-array views over `WebAssembly.Memory`.
- The WASM core will own spatial indexes, hit testing, culling, and instance-buffer generation. Rust's ownership model reduces the risk of use-after-free and aliasing bugs in those long-lived buffers.
- `wasm-pack --target web` integrates cleanly with Vite by generating JS, TypeScript declarations, and `.wasm` artifacts that the app can import.
- Testing is stronger: Rust unit tests cover spatial/index logic natively, and `wasm-bindgen-test` can cover the exported browser-facing API.

T3 must expose low-level buffer accessors rather than copying render data into JS arrays. The JS app will create `Float32Array`, `Uint32Array`, and `Uint8Array` views over the exported WASM memory.

### 2. Shader source strategy for WebGPU and WebGL2

Use a small hand-maintained dual shader set: WGSL for WebGPU and GLSL ES 3.00 for WebGL2.

The project is expected to need only two to four shader programs: the instanced SDF seat shader, possibly a picking/debug shader, and small variants if labels or diagnostics require them. For that size, a WGSL-to-GLSL translation pipeline adds more complexity than it removes.

The shader contract is single-source at the interface level:

- one shared TypeScript definition for vertex attributes, bind groups/uniforms, palette formats, and shader program IDs;
- backend-specific shader files must implement that contract exactly;
- WebGPU and WebGL2 render smoke tests must cover the same fixtures and compare non-blank output and known visual state changes.

Shader files must be short, backend-specific, and reviewed together. If the shader count grows beyond six programs or the same logic starts being changed repeatedly in both languages, introduce a later ADR to reconsider mechanical generation.

### 3. Instance buffer memory layout and JS/WASM sharing

Use one interleaved, WASM-owned instance buffer with a 24-byte stride. The buffer is shared with JS through typed-array views over `WebAssembly.Memory`; GPU upload still copies into backend GPU buffers through WebGPU/WebGL APIs.

Rust layout:

```rust
#[repr(C)]
pub struct SeatInstance {
    pub x: f32,
    pub y: f32,
    pub size: f32,
    pub rotation: f32,
    pub color_index: u32,
    pub state_flags: u32,
}
```

The struct size must be asserted in Rust tests as exactly 24 bytes with 4-byte alignment.

Instance attribute layout:

| Byte offset | Field | Type | GPU attribute | Meaning |
| ---: | --- | --- | --- | --- |
| 0 | `x` | `f32` | `@location(0).x` / `a_position.x` | Seat center X in world units. |
| 4 | `y` | `f32` | `@location(0).y` / `a_position.y` | Seat center Y in world units. |
| 8 | `size` | `f32` | `@location(1).x` / `a_size_rotation.x` | Seat diameter in world units. The shader uses `size * 0.5` as the SDF radius. |
| 12 | `rotation` | `f32` | `@location(1).y` / `a_size_rotation.y` | Seat rotation in radians, counter-clockwise. |
| 16 | `colorIndex` | `u32` | `@location(2)` / `a_color_index` | Palette index. Valid range for v4.0 is `0..65535`; upper bits are reserved and must be zero. |
| 20 | `stateFlags` | `u32` | `@location(3)` / `a_state_flags` | Packed render/interaction flags. |
| 24 | next instance | n/a | n/a | Stride is 24 bytes. |

Alignment:

- every field is 4-byte aligned;
- the record stride is 24 bytes, which is valid for WebGPU vertex buffers and WebGL2 vertex attributes;
- JS views address the buffer as six 32-bit words per instance.

JS typed-array mapping:

```ts
const wordsPerInstance = 6;
const f32 = new Float32Array(memory.buffer, ptr, instanceCount * wordsPerInstance);
const u32 = new Uint32Array(memory.buffer, ptr, instanceCount * wordsPerInstance);

// instance i
f32[i * 6 + 0] // x
f32[i * 6 + 1] // y
f32[i * 6 + 2] // size
f32[i * 6 + 3] // rotation
u32[i * 6 + 4] // colorIndex
u32[i * 6 + 5] // stateFlags
```

`stateFlags` packing:

| Bits | Name | Meaning |
| --- | --- | --- |
| 0 | `SELECTED` | Seat is selected. |
| 1 | `HOVERED` | Seat is currently hovered. |
| 2 | `UNAVAILABLE` | Seat is unavailable/sold/blocked for interaction. |
| 3 | `DISABLED` | Seat is suppressed or disabled by a host-side filter. |
| 4 | `HIGHLIGHTED` | Seat is highlighted by search or programmatic focus. |
| 5 | `FOCUSED` | Seat has keyboard or explicit focus. |
| 6-7 | reserved | Must be written as zero in v4.0. |
| 8-15 | `statusCode` | Optional compact status code for shader/debug use; `0` means normal/default. |
| 16-31 | reserved | Must be written as zero in v4.0. |

Memory sharing and invalidation rules:

- The Rust core owns the instance buffer allocation and exports `instance_buffer_ptr()`, `instance_count()`, and `instance_stride_bytes()`.
- JS must recreate all typed-array views whenever `wasm.memory.buffer` identity changes. Every WASM call that can allocate or load a new map is treated as a possible memory-growth point.
- Per-frame culling and interaction updates must not allocate after the seat map has been loaded and buffers have been reserved.
- The first build of a seat map marks the full instance range dirty.
- Incremental hover, selection, status, and color changes mark record-aligned dirty ranges. A dirty range is `{ startInstance: u32, instanceCount: u32 }`, relative to the start of the instance buffer.
- JS coalesces adjacent dirty ranges before upload. If dirty bytes exceed one third of the live instance buffer, JS uploads the whole buffer for that frame.
- Do not double-buffer the WASM instance buffer in v4.0. WASM writes happen synchronously before JS uploads to GPU buffers, so double-buffering would double linear-memory use without solving a current concurrency problem.

WebGPU vertex layout:

- buffer `arrayStride`: `24`;
- `stepMode`: `instance`;
- location 0: `float32x2`, offset `0`;
- location 1: `float32x2`, offset `8`;
- location 2: `uint32`, offset `16`;
- location 3: `uint32`, offset `20`.

WebGL2 vertex layout:

- one `ARRAY_BUFFER` with stride `24`;
- `a_position`: `gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 24, 0)`;
- `a_size_rotation`: `gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 24, 8)`;
- `a_color_index`: `gl.vertexAttribIPointer(location, 1, gl.UNSIGNED_INT, 24, 16)`;
- `a_state_flags`: `gl.vertexAttribIPointer(location, 1, gl.UNSIGNED_INT, 24, 20)`;
- all four attributes use `gl.vertexAttribDivisor(location, 1)`.

### 4. Repository layout

Use a two-part repository: `app/` for the Vite browser app and docs, and `core/` for the Rust WASM crate.

Exact target tree:

```text
seat-layout-v4/
  app/
    docs/
      agent-responsibility-and-model-routing.md
      goal-plan.md
      adr-001-architecture.md
      benchmarks/
        README.md
        baselines/
    index.html
    package.json
    package-lock.json
    tsconfig.json
    vite.config.ts
    vitest.config.ts
    playwright.config.ts
    src/
      main.ts
      app/
        DemoApp.ts
        BenchApp.ts
      renderer/
        SeatRenderer.ts
        camera/
          Camera2D.ts
        graphics/
          GraphicsDevice.ts
          RenderTypes.ts
          webgpu/
            WebGpuDevice.ts
            WebGpuSeatPipeline.ts
          webgl2/
            WebGl2Device.ts
            WebGl2SeatPipeline.ts
          shaders/
            shader-contract.ts
            wgsl/
              seat-instance.wgsl
              debug-picking.wgsl
            glsl/
              seat-instance.vert.glsl
              seat-instance.frag.glsl
              debug-picking.vert.glsl
              debug-picking.frag.glsl
        wasm/
          SeatLayoutCore.ts
      shared/
        instance-layout.ts
        seat-map.ts
        events.ts
      generated/
        wasm/
          seat_layout_core/
            seat_layout_core.js
            seat_layout_core_bg.wasm
            seat_layout_core.d.ts
            package.json
      tests/
        unit/
        e2e/
      fixtures/
        seeds/
        generated/
  core/
    Cargo.toml
    rust-toolchain.toml
    src/
      lib.rs
      instance.rs
      seat_map.rs
      spatial_index.rs
      culling.rs
      hit_test.rs
    tests/
      integration.rs
    benches/
      core_bench.rs
  scripts/
    build-wasm.mjs
```

Generated WASM artifacts land in `app/src/generated/wasm/seat_layout_core/` via:

```sh
wasm-pack build ../core --target web --out-dir ../app/src/generated/wasm/seat_layout_core --out-name seat_layout_core
```

The command is run from `app/` by an npm script such as `npm run build:wasm`. Generated WASM artifacts and large fixture outputs are build artifacts and should be gitignored unless a later task needs a small checked-in fixture for tests.

Shared contracts live in two places and must be kept byte-for-byte consistent by tests:

- `app/src/shared/instance-layout.ts` defines JS constants for stride, offsets, attribute locations, and `stateFlags` bits.
- `core/src/instance.rs` defines the Rust `SeatInstance` layout and exports the same constants to JS.

## Rejected Alternatives

### C++ with Emscripten for the WASM core

Rejected. `emcc` is not installed, while Rust and Cargo are already present. Emscripten would add a larger toolchain and more build flags, and its JS glue model is heavier than the `wasm-bindgen` API needed here. C++ can share memory through `HEAPF32`/`HEAPU32`, but this project benefits more from Rust's safer ownership model around long-lived buffers and spatial indexes.

### WGSL-first shader translation with naga or another CLI

Rejected for v4.0. Mechanical translation is attractive when shader volume is high, but this project has a very small shader set. Adding a translation binary, generated source review, source maps, CI validation, and WebGL2 compatibility debugging would cost more than maintaining a tiny WGSL/GLSL pair behind a strict shared contract.

### Encoding `colorIndex` and `stateFlags` as floats

Rejected. Both WebGPU and WebGL2 support integer vertex attributes, and flags should stay as integer bits. Float packing would invite precision and casting mistakes and make the shared Rust/JS layout less explicit.

### 32-byte padded instance records

Rejected for v4.0. A 32-byte stride gives 16-byte record alignment and future padding, but it increases upload volume by 33% over the 24-byte layout with no current shader requirement. The compact record is valid for both target APIs and keeps 250k-seat buffers smaller.

### Double-buffering the WASM instance buffer

Rejected for v4.0. The core writes synchronously, then JS uploads dirty ranges to GPU buffers. There is no concurrent WASM writer or worker pipeline yet, so double-buffering would mainly increase memory use and complexity. Reconsider only if worker-based generation or async streaming is introduced.

### Importing WASM directly from `core/pkg`

Rejected. Keeping generated browser artifacts under `app/src/generated/wasm/` keeps Vite imports inside the app tree and makes the app build independent of Rust crate internals. `core/` remains the source crate; `app/src/generated/wasm/` is the app-facing generated package.

## Consequences

- T1 must add `/opt/homebrew/bin` to documented local setup or npm scripts must run in an environment where Homebrew tools are visible.
- T3 must install `wasm-pack` before integrating the Rust core with Vite.
- T3 must include tests that assert the Rust instance struct size, stride, offsets, and exported constants match `app/src/shared/instance-layout.ts`.
- T4 and T7 must bind the same vertex attribute contract in WebGPU and WebGL2.
- Shader changes must update WGSL and GLSL together and pass render smoke tests under both backends.
- The compact 24-byte instance layout prioritizes bandwidth and simplicity. Future fields such as per-seat IDs should be added through a separate buffer or a later ADR, not by silently changing this stride.
