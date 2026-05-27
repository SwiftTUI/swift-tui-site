import { cp, mkdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const webExampleDir = resolve(
  process.cwd(),
  process.env.WEBEXAMPLE_DIR ?? "../.build/public-inputs/swift-tui-examples/WebExample"
);
const websiteDist = resolve(
  process.cwd(),
  process.env.SWIFTTUI_WEBSITE_DIST_DIR ?? "dist"
);
const pagesDist = join(webExampleDir, "pages-dist");
const outputDir = join(websiteDist, "webexample");
const wasmPath = join(outputDir, "TerminalApp", "dist", "assets", "app.wasm");

await assertDirectory(pagesDist, "WebExample pages output");
await rm(outputDir, { recursive: true, force: true });
await mkdir(websiteDist, { recursive: true });
await cp(pagesDist, outputDir, { recursive: true });
await assertFile(wasmPath, "WebExample wasm");

console.log(`[compose-webexample] copied ${pagesDist} to ${outputDir}`);

async function assertDirectory(path: string, label: string): Promise<void> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isDirectory()) {
    throw new Error(`${label} not found at ${path}; run build:wasm first`);
  }
}

async function assertFile(path: string, label: string): Promise<void> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) {
    throw new Error(`${label} not found at ${path}; run build:wasm first`);
  }
}
