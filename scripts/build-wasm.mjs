import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outDir = path.join(repoRoot, "app/src/generated/wasm/seat_layout_core");
const realHome = process.env.HOME;
const toolPath = [
  realHome ? `${realHome}/.cargo/bin` : "",
  "/opt/homebrew/opt/rustup/bin",
  "/opt/homebrew/bin",
  process.env.PATH ?? "",
].join(path.delimiter);
const cargoHome = process.env.CARGO_HOME ?? "/private/tmp/seat-layout-v4-cargo";
const writableHome =
  process.env.WASM_PACK_HOME ?? "/private/tmp/seat-layout-v4-home";
const rustupHome =
  process.env.RUSTUP_HOME ?? (realHome ? `${realHome}/.rustup` : undefined);

await rm(outDir, { recursive: true, force: true });

const child = spawn(
  "wasm-pack",
  [
    "build",
    "core",
    "--target",
    "web",
    "--out-dir",
    "../app/src/generated/wasm/seat_layout_core",
    "--out-name",
    "seat_layout_core",
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      HOME: writableHome,
      PATH: toolPath,
      CARGO_HOME: cargoHome,
      ...(rustupHome ? { RUSTUP_HOME: rustupHome } : {}),
    },
    stdio: "inherit",
  },
);

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});

if (exitCode !== 0) {
  process.exit(exitCode);
}
