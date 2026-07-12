# seat-layout-v4 benchmarks

Recorded baselines for the seat-map renderer, produced by `npm run bench`
(`scripts/bench.mjs`). The runner drives the `/bench` page (`app/bench.html`)
in real Google Chrome via Playwright and measures four scripted scenarios per
fixture: load-to-first-render, a 5s pan/zoom loop, 200 hit-tests, and 500
selection toggles. Raw JSON baselines live in `baselines/`.

The **Budget** column marks each row PASS/FAIL against the goal-plan §4
performance budgets:

- PanZoom fps: ≥ 55 fps (WebGPU ≤ 100k) / ≥ 30 fps (250k or WebGL2), with p95
  frame ≤ 18 ms (WebGPU ≤ 100k) else ≤ 1000/fps ms.
- Load→first-render: ≤ 1000 ms (gated at ≤ 100k seats; 250k reported only).
- HitTest p95: ≤ 2 ms.
- Selection toggle p95: ≤ 5 ms (WASM state write + dirty-range GPU upload,
  measured zoomed-in so the metric isolates the rebuild cost, not a full redraw).

Numbers are machine-specific (Apple Silicon, Chrome stable). Regenerate on the
target machine before treating any row as authoritative.

The table below is regenerated between the markers on every `npm run bench`.

<!-- BENCH_TABLE_START -->
| Layout | Seats | Backend | Load→1st (ms) | PanZoom avg (ms) | PanZoom p95 (ms) | Min FPS | HitTest p50/p95 (ms) | Sel avg/p95 (ms) | Budget |
| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | :---: |
| stadium | 1,000 | webgpu | 661 | 16.67 | 17.40 | 47.4 | 0.00 / 0.10 | 0.09 / 0.30 | PASS |
| stadium | 1,000 | webgl2 | 48 | 16.66 | 17.50 | 54.9 | 0.00 / 0.10 | 0.04 / 0.10 | PASS |
| stadium | 10,000 | webgpu | 53 | 16.67 | 17.10 | 42.6 | 0.00 / 0.10 | 0.09 / 0.20 | PASS |
| stadium | 10,000 | webgl2 | 41 | 16.67 | 17.30 | 43.1 | 0.00 / 0.10 | 0.04 / 0.10 | PASS |
| stadium | 100,000 | webgpu | 81 | 16.67 | 17.50 | 52.9 | 0.00 / 0.10 | 0.28 / 0.40 | PASS |
| stadium | 100,000 | webgl2 | 78 | 16.67 | 17.40 | 30.8 | 0.00 / 0.10 | 0.26 / 0.40 | PASS |
| stadium | 250,000 | webgpu | 181 | 16.67 | 17.20 | 51.8 | 0.00 / 0.10 | 0.57 / 0.70 | PASS |
| stadium | 250,000 | webgl2 | 161 | 16.66 | 17.10 | 55.9 | 0.00 / 0.10 | 0.54 / 0.60 | PASS |
| grid | 100,000 | webgpu | 79 | 16.67 | 17.20 | 56.2 | 0.00 / 0.10 | 0.30 / 0.40 | PASS |
| grid | 100,000 | webgl2 | 81 | 16.67 | 17.50 | 56.2 | 0.00 / 0.10 | 0.23 / 0.30 | PASS |
<!-- BENCH_TABLE_END -->
