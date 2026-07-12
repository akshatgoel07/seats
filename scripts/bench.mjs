#!/usr/bin/env node
// @ts-check
/**
 * seat-layout-v4 benchmark runner (T8).
 *
 * Drives the /bench page (bench.html) in REAL Google Chrome via Playwright
 * (channel: 'chrome', headless: false) across the fixture x backend matrix,
 * collects `window.__seatLayoutBenchResults` per run, writes a timestamped JSON
 * baseline plus a human-readable markdown summary table (regenerated between
 * markers), and marks each row PASS/FAIL against the goal-plan §4 budgets.
 *
 * The bundled headless Chromium in the sandbox has no real WebGPU/WebGL2, so
 * meaningful numbers require real Chrome. If Chrome cannot launch, the runner
 * prints the required environment and exits without writing a baseline.
 *
 * Usage:  npm run bench            (from app/)  ->  node ../scripts/bench.mjs
 * Flags:  --strict                 exit non-zero if any budget row FAILs
 *         --headed / --no-headed   (default headed; --no-headed for debugging)
 */

import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const APP_DIR = resolve(REPO_ROOT, 'app');
const BASELINE_DIR = resolve(APP_DIR, 'docs/benchmarks/baselines');
const README_PATH = resolve(APP_DIR, 'docs/benchmarks/README.md');

const TABLE_START = '<!-- BENCH_TABLE_START -->';
const TABLE_END = '<!-- BENCH_TABLE_END -->';

const RUN_TIMEOUT_MS = 180_000;

const STRICT = process.argv.includes('--strict');
const HEADED = !process.argv.includes('--no-headed');

/**
 * Benchmark matrix: stadium at every fixture size, plus grid at 100k, each on
 * both backends.
 * @type {{ layout: string, seats: number }[]}
 */
const SCENARIOS = [
  { layout: 'stadium', seats: 1_000 },
  { layout: 'stadium', seats: 10_000 },
  { layout: 'stadium', seats: 100_000 },
  { layout: 'stadium', seats: 250_000 },
  { layout: 'grid', seats: 100_000 },
];
const BACKENDS = /** @type {const} */ (['webgpu', 'webgl2']);

// ---------------------------------------------------------------------------
// Budget evaluation (goal-plan §4).
// ---------------------------------------------------------------------------

/**
 * Resolve the per-row budget thresholds for a backend + fixture size.
 * @param {string} backend
 * @param {number} seats
 */
function budgetFor(backend, seats) {
  const fpsFloor = backend === 'webgl2' ? 30 : seats >= 250_000 ? 30 : 55;
  const p95FrameCeil = backend === 'webgpu' && seats <= 100_000 ? 18 : 1000 / fpsFloor;
  return {
    fpsFloor,
    p95FrameCeil,
    // Load-to-first-render is a §4 gate at 100k; smaller sizes should also pass.
    // 250k is not a formal §4 load gate, so it is reported but not gated.
    loadCeilMs: seats <= 100_000 ? 1000 : null,
    hitTestP95CeilMs: 2,
    selectionP95CeilMs: 5,
  };
}

/**
 * @param {any} r bench results
 * @param {string} backend
 * @param {number} seats
 */
function evaluateBudgets(r, backend, seats) {
  const b = budgetFor(backend, seats);
  /** @type {{ label: string, pass: boolean, detail: string }[]} */
  const checks = [];

  const avgFps = r.panZoom.avgFrameMs > 0 ? 1000 / r.panZoom.avgFrameMs : 0;
  checks.push({
    label: 'panZoom fps',
    pass: avgFps >= b.fpsFloor,
    detail: `${avgFps.toFixed(1)}fps ≥ ${b.fpsFloor}`,
  });
  checks.push({
    label: 'panZoom p95 frame',
    pass: r.panZoom.p95FrameMs <= b.p95FrameCeil,
    detail: `${r.panZoom.p95FrameMs.toFixed(1)}ms ≤ ${b.p95FrameCeil.toFixed(1)}`,
  });
  if (b.loadCeilMs !== null) {
    checks.push({
      label: 'load',
      pass: r.loadToFirstRenderMs <= b.loadCeilMs,
      detail: `${r.loadToFirstRenderMs.toFixed(0)}ms ≤ ${b.loadCeilMs}`,
    });
  }
  checks.push({
    label: 'hitTest p95',
    pass: r.hitTest.p95Ms <= b.hitTestP95CeilMs,
    detail: `${r.hitTest.p95Ms.toFixed(2)}ms ≤ ${b.hitTestP95CeilMs}`,
  });
  checks.push({
    label: 'selection p95',
    pass: r.selectionToggle.p95Ms <= b.selectionP95CeilMs,
    detail: `${r.selectionToggle.p95Ms.toFixed(2)}ms ≤ ${b.selectionP95CeilMs}`,
  });

  const pass = checks.every((c) => c.pass);
  return { pass, checks };
}

// ---------------------------------------------------------------------------
// Minimal structural validation (mirrors src/app/bench/scenario.ts).
// ---------------------------------------------------------------------------

/** @param {any} value */
function looksLikeBenchResults(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.loadToFirstRenderMs === 'number' &&
    value.panZoom &&
    typeof value.panZoom.avgFrameMs === 'number' &&
    typeof value.panZoom.p95FrameMs === 'number' &&
    typeof value.panZoom.minFps === 'number' &&
    value.hitTest &&
    typeof value.hitTest.p50Ms === 'number' &&
    typeof value.hitTest.p95Ms === 'number' &&
    value.selectionToggle &&
    typeof value.selectionToggle.avgMs === 'number' &&
    typeof value.selectionToggle.p95Ms === 'number' &&
    value.meta &&
    typeof value.meta.backend === 'string'
  );
}

// ---------------------------------------------------------------------------
// Server + Chrome plumbing.
// ---------------------------------------------------------------------------

function getFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

/** @param {string} url */
async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(250);
  }
  return false;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function gitShortHash() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return 'nogit';
  }
}

function compactTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

// ---------------------------------------------------------------------------
// Markdown rendering.
// ---------------------------------------------------------------------------

/**
 * @param {{ scenario: { layout: string, seats: number }, backend: string, results: any, status: string, verdict: ({ pass: boolean, checks: any[] } | null) }[]} rows
 */
function renderTable(rows) {
  const header = [
    '| Layout | Seats | Backend | Load→1st (ms) | PanZoom avg (ms) | PanZoom p95 (ms) | Min FPS | HitTest p50/p95 (ms) | Sel avg/p95 (ms) | Budget |',
    '| --- | ---: | --- | ---: | ---: | ---: | ---: | --- | --- | :---: |',
  ];
  const body = rows.map((row) => {
    if (row.status !== 'done' || !row.results) {
      const note = row.status === 'unsupported' ? 'unsupported' : row.status;
      return `| ${row.scenario.layout} | ${row.scenario.seats.toLocaleString('en-US')} | ${row.backend} | — | — | — | — | — | — | ${note} |`;
    }
    const r = row.results;
    const verdict = row.verdict ? (row.verdict.pass ? 'PASS' : 'FAIL') : '—';
    return `| ${row.scenario.layout} | ${row.scenario.seats.toLocaleString('en-US')} | ${row.backend} | ${r.loadToFirstRenderMs.toFixed(0)} | ${r.panZoom.avgFrameMs.toFixed(2)} | ${r.panZoom.p95FrameMs.toFixed(2)} | ${r.panZoom.minFps.toFixed(1)} | ${r.hitTest.p50Ms.toFixed(2)} / ${r.hitTest.p95Ms.toFixed(2)} | ${r.selectionToggle.avgMs.toFixed(2)} / ${r.selectionToggle.p95Ms.toFixed(2)} | ${verdict} |`;
  });
  return [...header, ...body].join('\n');
}

/**
 * @param {string} table
 * @param {string} baselineFile
 * @param {string} userAgent
 */
function renderReadme(table, baselineFile, userAgent) {
  const preamble = `# seat-layout-v4 benchmarks

Recorded baselines for the seat-map renderer, produced by \`npm run bench\`
(\`scripts/bench.mjs\`). The runner drives the \`/bench\` page (\`app/bench.html\`)
in real Google Chrome via Playwright and measures four scripted scenarios per
fixture: load-to-first-render, a 5s pan/zoom loop, 200 hit-tests, and 500
selection toggles. Raw JSON baselines live in \`baselines/\`.

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

The table below is regenerated between the markers on every \`npm run bench\`.
Latest baseline: \`baselines/${baselineFile}\`${userAgent ? ` — ${userAgent}` : ''}.

${TABLE_START}
${table}
${TABLE_END}
`;
  return preamble;
}

/**
 * @param {string} table
 * @param {string} baselineFile
 * @param {string} userAgent
 */
function writeReadme(table, baselineFile, userAgent) {
  if (existsSync(README_PATH)) {
    const existing = readFileSync(README_PATH, 'utf8');
    const startIndex = existing.indexOf(TABLE_START);
    const endIndex = existing.indexOf(TABLE_END);
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const before = existing.slice(0, startIndex + TABLE_START.length);
      const after = existing.slice(endIndex);
      writeFileSync(README_PATH, `${before}\n${table}\n${after}`);
      return;
    }
  }
  writeFileSync(README_PATH, renderReadme(table, baselineFile, userAgent));
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(BASELINE_DIR, { recursive: true });

  let playwright;
  try {
    playwright = await import(resolve(APP_DIR, 'node_modules/playwright/index.mjs'));
  } catch (error) {
    console.error('Could not load Playwright from app/node_modules/playwright.');
    console.error(String(error));
    process.exit(1);
    return;
  }
  const { chromium } = playwright;

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`[bench] starting Vite dev server on ${baseUrl} ...`);
  const server = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: APP_DIR, stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
  );
  server.stdout.on('data', () => {});
  server.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));

  const cleanupServer = () => {
    try {
      server.kill('SIGTERM');
    } catch {
      // ignore
    }
  };
  process.on('exit', cleanupServer);

  const serverUp = await waitForServer(`${baseUrl}/bench.html`);
  if (!serverUp) {
    console.error('[bench] dev server did not become ready in time.');
    cleanupServer();
    process.exit(1);
    return;
  }

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: !HEADED,
      args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
    });
  } catch (error) {
    console.error('\n[bench] Could not launch real Google Chrome (channel: "chrome").');
    console.error('[bench] Real WebGPU/WebGL2 numbers require Chrome; the sandbox Chromium cannot');
    console.error('[bench] produce them. Run locally with Chrome installed:');
    console.error('[bench]   cd app && npm run bench');
    console.error('[bench] Requires: Google Chrome (stable) on PATH / installed in the OS,');
    console.error('[bench] a display (headed) or Xvfb, and app/node_modules/playwright present.');
    console.error(`[bench] Underlying error: ${error instanceof Error ? error.message : String(error)}`);
    cleanupServer();
    process.exit(1);
    return;
  }

  /** @type {{ scenario: { layout: string, seats: number }, backend: string, results: any, status: string, verdict: any }[]} */
  const rows = [];
  let userAgent = '';

  try {
    for (const scenario of SCENARIOS) {
      for (const backend of BACKENDS) {
        const url = `${baseUrl}/bench.html?layout=${scenario.layout}&seats=${scenario.seats}&backend=${backend}`;
        process.stdout.write(`[bench] ${scenario.layout} ${scenario.seats} ${backend} ... `);
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        let status = 'error';
        let results = null;
        try {
          await page.goto(url, { waitUntil: 'load' });
          await page.waitForFunction(() => (globalThis).benchDone === true, undefined, {
            timeout: RUN_TIMEOUT_MS,
          });
          const payload = await page.evaluate(() => ({
            status: (globalThis).__seatLayoutBenchStatus,
            results: (globalThis).__seatLayoutBenchResults,
          }));
          status = payload.status?.state ?? 'error';
          if (status === 'done' && looksLikeBenchResults(payload.results)) {
            results = payload.results;
            userAgent = results.meta.userAgent || userAgent;
          }
        } catch (error) {
          status = 'timeout';
          console.log(`\n[bench]   error: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          await page.close();
        }

        const verdict = results ? evaluateBudgets(results, backend, scenario.seats) : null;
        rows.push({ scenario, backend, results, status, verdict });
        if (results) {
          console.log(
            `${verdict && verdict.pass ? 'PASS' : 'FAIL'} ` +
              `(load ${results.loadToFirstRenderMs.toFixed(0)}ms, avg ${results.panZoom.avgFrameMs.toFixed(2)}ms, ` +
              `minFps ${results.panZoom.minFps.toFixed(1)}, hit p95 ${results.hitTest.p95Ms.toFixed(2)}ms, ` +
              `sel p95 ${results.selectionToggle.p95Ms.toFixed(2)}ms)`,
          );
        } else {
          console.log(status);
        }
      }
    }
  } finally {
    await browser.close();
    cleanupServer();
  }

  const timestamp = compactTimestamp();
  const shortHash = gitShortHash();
  const baselineFile = `${timestamp}-${shortHash}.json`;
  const baselinePath = resolve(BASELINE_DIR, baselineFile);

  const baseline = {
    generatedAt: new Date().toISOString(),
    gitShortHash: shortHash,
    userAgent,
    budgets: 'goal-plan §4',
    runs: rows.map((row) => ({
      layout: row.scenario.layout,
      seats: row.scenario.seats,
      backend: row.backend,
      status: row.status,
      results: row.results,
      budget: row.verdict ? { pass: row.verdict.pass, checks: row.verdict.checks } : null,
    })),
  };
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`\n[bench] baseline written: ${baselinePath}`);

  const table = renderTable(rows);
  writeReadme(table, baselineFile, userAgent);
  console.log(`[bench] markdown summary written: ${README_PATH}`);
  console.log(`\n${table}\n`);

  const produced = rows.filter((row) => row.results).length;
  const failed = rows.filter((row) => row.verdict && !row.verdict.pass).length;
  console.log(`[bench] ${produced}/${rows.length} runs produced results; ${failed} budget FAIL(s).`);

  if (produced === 0) {
    console.error('[bench] No runs produced results.');
    process.exit(1);
  }
  if (STRICT && failed > 0) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
