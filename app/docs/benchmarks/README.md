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
| stadium | 1,000 | webgpu | 76 | 16.67 | 17.00 | 55.9 | 0.00 / 0.10 | 0.07 / 0.20 | PASS |
| stadium | 1,000 | webgl2 | 49 | 16.67 | 17.10 | 56.5 | 0.00 / 0.10 | 0.03 / 0.10 | PASS |
| stadium | 10,000 | webgpu | 38 | 16.67 | 16.90 | 56.8 | 0.00 / 0.00 | 0.08 / 0.20 | PASS |
| stadium | 10,000 | webgl2 | 34 | 16.67 | 16.90 | 56.5 | 0.00 / 0.10 | 0.05 / 0.10 | PASS |
| stadium | 100,000 | webgpu | 92 | 16.67 | 16.90 | 56.8 | 0.00 / 0.10 | 0.29 / 0.40 | PASS |
| stadium | 100,000 | webgl2 | 77 | 16.67 | 17.00 | 56.5 | 0.00 / 0.10 | 0.23 / 0.30 | PASS |
| stadium | 250,000 | webgpu | 190 | 16.67 | 16.80 | 56.5 | 0.00 / 0.10 | 0.59 / 0.70 | PASS |
| stadium | 250,000 | webgl2 | 887 | 16.67 | 16.80 | 56.5 | 0.00 / 0.10 | 0.59 / 0.70 | PASS |
| grid | 100,000 | webgpu | 99 | 16.66 | 17.00 | 56.2 | 0.00 / 0.10 | 0.29 / 0.40 | PASS |
| grid | 100,000 | webgl2 | 69 | 16.67 | 17.10 | 56.5 | 0.00 / 0.10 | 0.23 / 0.30 | PASS |
<!-- BENCH_TABLE_END -->
