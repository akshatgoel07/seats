# Browser support

seat-layout-v4 runs on **WebGPU** where available and transparently falls back to
**WebGL2** everywhere else, behind a single graphics interface. There is no
Canvas2D path; a browser without WebGL2 is unsupported.

## Support matrix

State of the world as of mid-2026. Browser WebGPU availability moves quickly and
varies by OS and GPU, so treat "primary" below as "WebGPU when `navigator.gpu`
resolves a working device, WebGL2 otherwise" — the app decides per session, it
does not gate on the browser name.

| Environment | WebGPU | Effective backend |
| --- | --- | --- |
| Chrome / Edge (stable), desktop | Shipped and enabled by default | **WebGPU** primary; WebGL2 if a device can't be acquired. |
| Safari (recent, macOS/iOS) | WebGPU has shipped in current Safari, but availability still varies by version, OS, and hardware. | **WebGPU where `navigator.gpu` is present and yields a device; WebGL2 otherwise.** |
| Firefox (current) | WebGPU has begun shipping (initially Windows), with other platforms rolling out; not universally enabled. | **WebGPU where enabled; WebGL2 otherwise.** |
| Any browser without `navigator.gpu` | Absent | **WebGL2** fallback (fully supported path). |
| Headless / CI (Playwright, default) | Not used | **WebGL2 only.** WebGPU e2e is env-gated behind `ENABLE_WEBGPU_E2E=1`. |

Because the WebGL2 backend implements the same graphics contract and passes the
same render/interaction tests, browsers that land on the fallback get the full
feature set (render, pan/zoom/pinch, hover, selection) — only the rendering
backend differs.

### CI / e2e note

Playwright's WebGL2 suite runs unconditionally. The WebGPU e2e tests are
**skipped unless `ENABLE_WEBGPU_E2E=1`** is set (see
`app/playwright.config.ts` and `app/src/tests/e2e/webgpu-seat-render.spec.ts`),
because headless CI typically lacks a usable WebGPU adapter. When enabled, the
Chromium launch adds `--enable-unsafe-webgpu --enable-features=WebGPU
--disable-features=SkiaGraphite`.

## Fallback triggers

The `GraphicsFallbackManager`
(`app/src/renderer/graphics/FallbackManager.ts`) starts on WebGPU and switches
to WebGL2 on any of the following. In every case the switch is transparent: the
canvas is replaced, the renderer rebuilds on WebGL2, and the scene/selection are
preserved.

1. **WebGPU missing or unusable at startup.** `navigator.gpu` is unavailable,
   `requestAdapter()` returns `null`, or `requestDevice()` fails — detection
   selects WebGL2 as the initial backend.
2. **WebGPU blocklisted.** A rule in `WEBGPU_BLOCKLIST_RULES` matches (e.g. a
   problem device/user-agent). The hook exists and is evaluated at startup; the
   default rule list is empty.
3. **Post-load self-test failure.** After the first frame the manager renders
   once and checks for a WebGPU validation error after a short settle window; a
   captured error triggers fallback.
4. **WebGPU device lost.** A mid-session `device.lost` event rebuilds on WebGL2.
5. **Uncaptured WebGPU validation error.** A reported `uncapturederror` triggers
   fallback.
6. **Forced backend.** `?backend=webgl2` forces WebGL2 from the start (skips
   WebGPU detection entirely); `?backend=webgpu` forces WebGPU.
7. **Forced fault injection (testing).** `?failGpuAfterMs=<ms>` injects a WebGPU
   failure after the first frame to exercise triggers 3–5 on demand.

## Known limitations

- **Seat labels are not rendered yet.** The level-of-detail system has two
  levels only — far: colored dots, near: seat glyphs. Text labels at close zoom
  are deferred; the threshold is reserved as the constant
  `TODO_SEAT_LABEL_MIN_SCREEN_PX` in `app/src/renderer/SeatRenderer.ts` but no
  label rendering pass exists in v4.0.
- **Benchmark frame timing is vsync-capped.** The benchmark harness drives frames
  through `requestAnimationFrame`, which is throttled to the display refresh
  rate. Pan/zoom average frame time therefore floors near the refresh interval
  (~16.67 ms at 60 Hz) and reported FPS is capped at the monitor's refresh rate —
  the numbers show the renderer keeps up with vsync, not its theoretical
  headroom. HitTest and selection-toggle metrics are not vsync-bound and reflect
  real per-operation cost.
- **Per-seat accessibility tree and seat-map editing are out of scope** for v4.0
  (tracked as v4.1 candidates in the goal plan).
