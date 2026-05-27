import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("copies WebExample pages output into the website dist route", async () => {
  const root = await mkdtemp(join(tmpdir(), "compose-webexample-"));
  tempRoots.push(root);

  const webExampleDir = join(root, "WebExample");
  const pagesDist = join(webExampleDir, "pages-dist");
  const wasmDir = join(pagesDist, "TerminalApp", "dist", "assets");
  const websiteDist = join(root, "dist");

  await mkdir(wasmDir, { recursive: true });
  await mkdir(websiteDist, { recursive: true });
  await writeFile(join(pagesDist, "index.html"), "<!doctype html><title>WebExample</title>");
  await writeFile(join(wasmDir, "app.wasm"), "fake wasm");

  const result = Bun.spawnSync({
    cmd: [process.execPath, "run", "scripts/compose-webexample.ts"],
    cwd: join(import.meta.dir, ".."),
    env: {
      WEBEXAMPLE_DIR: webExampleDir,
      SWIFTTUI_WEBSITE_DIST_DIR: websiteDist,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.exitCode).toBe(0);
  await expect(readFile(join(websiteDist, "webexample", "index.html"), "utf8")).resolves.toContain("WebExample");
  await expect(readFile(join(websiteDist, "webexample", "TerminalApp", "dist", "assets", "app.wasm"), "utf8")).resolves.toBe("fake wasm");
});
