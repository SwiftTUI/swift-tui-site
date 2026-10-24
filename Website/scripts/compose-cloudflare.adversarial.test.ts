// D1 adversarial corpus, compose-cloudflare.ts (d1s012-d1s013): missing
// inputs and non-regular files. The fixture mirrors compose-cloudflare.test.ts.
import { afterEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { composeCloudflare, filesUnder } from "./compose-cloudflare";
import { d1KnownIssue } from "./d1-known-issue";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "d1-compose-cloudflare-"));
  roots.push(root);
  const website = join(root, "website");
  const demo = join(root, "demo");
  const output = join(root, "output");
  const authored = {
    "docs/data/documentation/swifttuiviews/palettestyle.json":
      '{"title":"PaletteStyle"}',
    "docs/data/documentation/swifttui.json": '{"title":"SwiftTUI"}',
    "docs/charts/data/documentation/swifttuicharts/chart.json":
      '{"title":"Chart"}',
    "docs/terminal-view/data/documentation/swifttuiterminalview/terminalview.json":
      '{"title":"TerminalView"}',
    "index.html": "Site",
    "docs/index.html": "<html><head></head><body>DocC shell</body></html>",
    "docs/charts/index.html":
      "<html><head></head><body>Charts shell</body></html>",
    "docs/index/index.json": "Search index",
    "docs/terminal-view/index.html":
      "<html><head></head><body>Terminal view shell</body></html>",
    _redirects: "/docs/documentation/* /docs/ 200\n",
    _headers: "/*\n  X-Content-Type-Options: nosniff\n",
  };
  for (const [path, text] of Object.entries(authored)) {
    await mkdir(join(website, path, ".."), { recursive: true });
    await writeFile(join(website, path), text);
  }
  await mkdir(join(demo, "TerminalApp/dist/assets"), { recursive: true });
  await writeFile(
    join(demo, "TerminalApp/dist/assets/app.wasm"),
    "compressed wasm",
  );
  for (const [path, text] of Object.entries({
    "index.js":
      'const wasm = "./TerminalApp/dist/assets/app.wasm"; const worker = "./wasm-scene-worker.js"; const manifest = "./TerminalApp/dist/scene-manifest.json";',
    "TerminalApp/dist/scene-manifest.json": "scene manifest",
    "wasm-scene-worker.js": "worker code",
    "index.css": "body { margin: 0 }",
    "index.html":
      '<script type="module" src="./index.js"></script><link rel="stylesheet" href="./index.css">',
    "dom.html":
      '<script type="module" src="./index.js"></script><link rel="stylesheet" href="./index.css">',
  }))
    await writeFile(join(demo, path), text);
  return { root, website, demo, output };
}

test("d1s012 a missing _headers, _redirects, DocC shell or demo dom.html fails only after the previous deployment tree was deleted", async () => {
  // Contract: compose-cloudflare.ts:74, "Validate required inputs before
  // replacing the generated deployment tree."
  const missing: [where: "website" | "demo", path: string][] = [
    ["website", "_headers"],
    ["website", "_redirects"],
    ["website", "docs/charts/index.html"],
    ["demo", "dom.html"],
  ];
  for (const [where, path] of missing) {
    const f = await fixture();
    await rm(join(where === "website" ? f.website : f.demo, path));
    const marker = join(f.output, "previous-deployment.marker");
    await mkdir(f.output, { recursive: true });
    await writeFile(marker, "previous deployment");
    // Precondition: the compose refuses the incomplete input.
    await rejects(composeCloudflare(f.website, f.demo, f.output, "sha"));
    const survived = await stat(marker).then(
      () => true,
      () => false,
    );
    d1KnownIssue(
      "d1s012",
      `STUI-1203: missing ${where}/${path} is detected after rm(output) at compose-cloudflare.ts:78 (only five inputs are stat'ed at :75-77; the read fails at fingerprint-webexample.ts:57 / compose-cloudflare.ts:127,143); contract: compose-cloudflare.ts:74; adjacent none`,
      () => {
        expect(survived).toBe(true);
      },
    );
  }
});

test("d1s013 a symlink inside websiteDist is refused as a deployment input", async () => {
  // Contract: compose-cloudflare.ts:31-34, inputs are regular files or
  // directories. Bun's fs.cp must preserve the link for the guard to see it.
  const f = await fixture();
  await symlink("index.html", join(f.website, "docs/alias.html"));
  expect(
    (await lstat(join(f.website, "docs/alias.html"))).isSymbolicLink(),
  ).toBe(true);
  await rejects(filesUnder(f.website), /not a regular file or directory/);
  await rejects(
    composeCloudflare(f.website, f.demo, f.output, "sha"),
    /not a regular file or directory/,
  );
  // The input archive is untouched by the refusal.
  expect(await readFile(join(f.website, "index.html"), "utf8")).toBe("Site");
});
