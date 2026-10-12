import { afterEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import {
  checkBudget,
  composeCloudflare,
  dataFetchRouter,
  dataProjects,
  deploymentOrigin,
  filesUnder,
  writeDataRedirects,
} from "./compose-cloudflare";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "compose-cloudflare-"));
  roots.push(root);
  const website = join(root, "website");
  const demo = join(root, "demo");
  const output = join(root, "output");
  const data = {
    "docs/data/documentation/swifttuiviews/palettestyle.json":
      '{"title":"PaletteStyle"}',
    "docs/data/documentation/swifttui.json": '{"title":"SwiftTUI"}',
    "docs/charts/data/documentation/swifttuicharts/chart.json":
      '{"title":"Chart"}',
    "docs/terminal-view/data/documentation/swifttuiterminalview/terminalview.json":
      '{"title":"TerminalView"}',
  };
  const authored = {
    ...data,
    "index.html": "Site",
    "docs/index.html": "<html><head></head><body>DocC shell</body></html>",
    "docs/charts/index.html":
      "<html><head></head><body>Charts shell</body></html>",
    "docs/index/index.json": "Search index",
    "docs/terminal-view/index.html":
      "<html><head></head><body>Terminal view shell</body></html>",
    "docs/documentation/swifttuiviews/palettestyle/index.html":
      "Duplicate shell",
    "docs/charts/documentation/swifttuicharts/chart/index.html":
      "Duplicate charts shell",
    "docs/terminal-view/documentation/swifttuiterminalview/terminalview/index.html":
      "Duplicate terminal view shell",
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
  return { root, website, demo, output, data };
}

test("preserves every DocC data byte and keeps shells, search, and demo on the main site", async () => {
  const f = await fixture();
  const counts = await composeCloudflare(
    f.website,
    f.demo,
    f.output,
    "release-sha",
  );
  expect(counts).toEqual({ views: 3, other: 5, site: 20 });
  for (const [path, content] of Object.entries(f.data)) {
    const shard = path.includes("/swifttuiviews/") ? "views" : "other";
    expect(await readFile(join(f.output, shard, path), "utf8")).toBe(content);
    expect(await readFile(join(f.website, path), "utf8")).toBe(content);
  }
  const mainFiles = await filesUnder(join(f.output, "site"));
  expect(mainFiles.some((path) => path.includes("/documentation/"))).toBe(
    false,
  );
  expect(
    await readFile(join(f.output, "site/docs/index/index.json"), "utf8"),
  ).toBe("Search index");
  expect(
    await readFile(join(f.output, "site/docs/charts/index.html"), "utf8"),
  ).toContain('src="/docc-data-routing.js"');
  expect(
    await readFile(
      join(f.output, "site/docs/terminal-view/index.html"),
      "utf8",
    ),
  ).toContain('src="/docc-data-routing.js"');
  expect(
    await readFile(
      join(f.output, "site/webexample/TerminalApp/dist/assets/app.wasm"),
      "utf8",
    ),
  ).toBe("compressed wasm");
  expect(await readFile(join(f.output, "views/_headers"), "utf8")).toContain(
    "Access-Control-Allow-Origin: *",
  );
});

test("excludes oversized compiler linking digests without changing the input archives", async () => {
  const f = await fixture();
  const paths = ["docs", "docs/charts", "docs/terminal-view"].map((path) =>
    join(path, "linkable-entities.json"),
  );
  for (const path of paths) {
    await writeFile(join(f.website, path), "compiler digest");
    await truncate(join(f.website, path), 25 * 1024 * 1024);
  }
  expect(await composeCloudflare(f.website, f.demo, f.output, "sha")).toEqual({
    views: 3,
    other: 5,
    site: 20,
  });
  for (const path of paths) {
    await rejects(stat(join(f.output, "site", path)), { code: "ENOENT" });
    expect((await stat(join(f.website, path))).size).toBe(25 * 1024 * 1024);
    expect(
      (await readFile(join(f.website, path))).subarray(0, 15).toString(),
    ).toBe("compiler digest");
  }
  // Oversized browser assets must still fail deployment validation.
  await truncate(join(f.website, "docs/index/index.json"), 25 * 1024 * 1024);
  await rejects(
    composeCloudflare(f.website, f.demo, f.output, "sha"),
    /25 MiB asset limit/,
  );
});

test("uses immutable data URLs with the views rule ahead of the general data rule", async () => {
  const f = await fixture();
  await composeCloudflare(f.website, f.demo, f.output, "release-sha");
  const urls = {
    views: `https://1234abcd.${dataProjects.views}.pages.dev`,
    other: `https://abcd1234.${dataProjects.other}.pages.dev`,
  };
  await writeDataRedirects(f.output, urls);
  const redirects = await readFile(join(f.output, "site/_redirects"), "utf8");
  expect(redirects.split("\n")[0]).toBe(
    `/docs/data/documentation/swifttuiviews/* ${urls.views}/docs/data/documentation/swifttuiviews/:splat 302`,
  );
  expect(redirects).toContain(
    `/docs/charts/data/* ${urls.other}/docs/charts/data/:splat 302`,
  );
  expect(redirects).toContain(
    `/docs/terminal-view/data/* ${urls.other}/docs/terminal-view/data/:splat 302`,
  );
  expect(redirects).toContain("/docs/documentation/* /docs/ 200");
  await writeDataRedirects(f.output, urls);
  expect(await readFile(join(f.output, "site/_redirects"), "utf8")).toBe(
    redirects,
  );
  for (const url of [
    `https://${dataProjects.views}.pages.dev`,
    `https://main.${dataProjects.views}.pages.dev`,
    `${urls.views}/extra`,
    "https://1234abcd.other.pages.dev",
  ]) {
    expect(() => deploymentOrigin(url, dataProjects.views)).toThrow(
      "immutable deployment URL",
    );
  }
});

test("moves overflowing Views directories into spare data capacity and routes every byte", async () => {
  const f = await fixture();
  for (const [name, count] of [
    ["large", 15],
    ["small", 14],
  ] as const) {
    const directory = `docs/data/documentation/swifttuiviews/${name}`;
    await mkdir(join(f.website, directory), { recursive: true });
    for (let index = 0; index < count; index++) {
      await writeFile(
        join(f.website, directory, `${index}.json`),
        `${name}-${index}`,
      );
    }
  }
  expect(
    await composeCloudflare(f.website, f.demo, f.output, "sha", 20),
  ).toEqual({ views: 17, other: 20, site: 20 });
  for (const [name, count, shard] of [
    ["large", 15, "other"],
    ["small", 14, "views"],
  ] as const) {
    for (let index = 0; index < count; index++) {
      const path = `docs/data/documentation/swifttuiviews/${name}/${index}.json`;
      expect(await readFile(join(f.output, shard, path), "utf8")).toBe(
        `${name}-${index}`,
      );
      expect(await readFile(join(f.website, path), "utf8")).toBe(
        `${name}-${index}`,
      );
    }
  }
  const urls = {
    views: `https://1234abcd.${dataProjects.views}.pages.dev`,
    other: `https://abcd1234.${dataProjects.other}.pages.dev`,
  };
  await writeDataRedirects(f.output, urls);
  const redirects = await readFile(join(f.output, "site/_redirects"), "utf8");
  expect(redirects.split("\n")[0]).toBe(
    `/docs/data/documentation/swifttuiviews/large/* ${urls.other}/docs/data/documentation/swifttuiviews/large/:splat 302`,
  );
  const script = (await filesUnder(join(f.output, "site"))).find((path) =>
    /docc-data-routing\.[a-f0-9]+\.js$/.test(path),
  );
  if (!script) throw new Error("Missing generated DocC data router");
  const seen: string[] = [];
  const context = {
    URL,
    Request,
    Headers,
    location: new URL("https://site.example/docs/"),
    fetch: async (input: RequestInfo | URL) => {
      seen.push(String(input));
      return new Response("{}");
    },
  };
  runInNewContext(await readFile(script, "utf8"), context);
  for (const [name, origin] of [
    ["large", urls.other],
    ["small", urls.views],
  ] as const) {
    const path = `/docs/data/documentation/swifttuiviews/${name}/0.json`;
    await context.fetch(`https://site.example${path}`);
    expect(seen.at(-1)).toBe(`${origin}${path}`);
  }
  await writeDataRedirects(f.output, urls);
  expect(await readFile(join(f.output, "site/_redirects"), "utf8")).toBe(
    redirects,
  );
  await rejects(
    composeCloudflare(f.website, f.demo, f.output, "sha", 18),
    /combined.*file budget/,
  );
});

test("a new WASM deployment loads fresh bytes through a returning browser's cached entry assets", async () => {
  const f = await fixture();
  const cache = new Map<string, string>();
  async function cached(path: string) {
    const previous = cache.get(path);
    if (previous !== undefined) return previous;
    const contents = await readFile(
      join(f.output, "site/webexample", path),
      "utf8",
    );
    cache.set(path, contents);
    return contents;
  }
  function reference(contents: string, pattern: RegExp) {
    const path = contents.match(pattern)?.[1];
    if (!path) throw new Error(`Missing asset reference matching ${pattern}`);
    return path;
  }
  async function load() {
    const html = await readFile(
      join(f.output, "site/webexample/index.html"),
      "utf8",
    );
    const entry = reference(html, /src="\.\/([^"]+\.js)"/);
    const script = await cached(entry);
    const wasm = reference(
      script,
      /\.\/(TerminalApp\/dist\/assets\/app(?:\.[a-f0-9]+)?\.wasm)/,
    );
    const worker = reference(
      script,
      /\.\/(wasm-scene-worker(?:\.[a-f0-9]+)?\.js)/,
    );
    const style = reference(html, /href="\.\/([^"]+\.css)"/);
    const manifest = reference(
      script,
      /\.\/(TerminalApp\/dist\/scene-manifest(?:\.[a-f0-9]+)?\.json)/,
    );
    expect(
      await readFile(join(f.output, "site/webexample/dom.html"), "utf8"),
    ).toContain(`src="./${entry}"`);
    return {
      entry,
      wasm,
      worker,
      style,
      bytes: await cached(wasm),
      workerCode: await cached(worker),
      css: await cached(style),
      manifest: await cached(manifest),
    };
  }
  await composeCloudflare(f.website, f.demo, f.output, "first");
  const first = await load();
  expect(first.bytes).toBe("compressed wasm");
  await writeFile(
    join(f.demo, "TerminalApp/dist/assets/app.wasm"),
    "next release wasm",
  );
  await composeCloudflare(f.website, f.demo, f.output, "second");
  const second = await load();
  expect(second.bytes).toBe("next release wasm");
  expect(second.wasm).not.toBe(first.wasm);
  expect(second.entry).not.toBe(first.entry);
  expect(second.worker).toBe(first.worker);
  expect(second.style).toBe(first.style);
  const headers = await readFile(join(f.output, "site/_headers"), "utf8");
  expect(headers).toContain(
    `/webexample/${second.wasm}\n  Cache-Control: public, max-age=31536000, immutable, no-transform\n  Content-Type: application/wasm\n  Content-Encoding: br`,
  );
  // Changing the remaining runtime assets must also bypass their old caches.
  await writeFile(join(f.demo, "wasm-scene-worker.js"), "new worker code");
  await writeFile(join(f.demo, "index.css"), "new styles");
  await writeFile(
    join(f.demo, "TerminalApp/dist/scene-manifest.json"),
    "new manifest",
  );
  await composeCloudflare(f.website, f.demo, f.output, "third");
  const third = await load();
  expect(third.workerCode).toBe("new worker code");
  expect(third.css).toBe("new styles");
  expect(third.manifest).toBe("new manifest");
  expect(third.entry).not.toBe(second.entry);
  expect(third.wasm).toBe(second.wasm);
  expect(cache.get(first.wasm)).toBe("compressed wasm");
  expect(await readFile(join(f.demo, "index.js"), "utf8")).toContain(
    '"./TerminalApp/dist/assets/app.wasm"',
  );
});

test("new data deployments cannot reuse a cached routing script", async () => {
  const f = await fixture();
  await composeCloudflare(f.website, f.demo, f.output, "release-sha");
  const urls = {
    views: `https://1234abcd.${dataProjects.views}.pages.dev`,
    other: `https://abcd1234.${dataProjects.other}.pages.dev`,
  };
  async function routerPath() {
    const html = await readFile(join(f.output, "site/docs/index.html"), "utf8");
    const path = html.match(
      /src="\/(docc-data-routing\.[a-f0-9]{64}\.js)"/,
    )?.[1];
    expect(path).toBeDefined();
    expect(
      await readFile(join(f.output, "site/docs/charts/index.html"), "utf8"),
    ).toContain(`src="/${path}"`);
    expect(
      await readFile(
        join(f.output, "site/docs/terminal-view/index.html"),
        "utf8",
      ),
    ).toContain(`src="/${path}"`);
    const body = await readFile(join(f.output, "site", path!), "utf8");
    expect(path).toBe(
      `docc-data-routing.${createHash("sha256").update(body).digest("hex")}.js`,
    );
    return path!;
  }
  await writeDataRedirects(f.output, urls);
  const first = await routerPath();
  await writeDataRedirects(f.output, urls);
  expect(await routerPath()).toBe(first);
  const replacement = {
    ...urls,
    views: `https://9876abcd.${dataProjects.views}.pages.dev`,
  };
  await writeDataRedirects(f.output, replacement);
  const second = await routerPath();
  expect(second).not.toBe(first);
  expect(await readFile(join(f.output, "site", second), "utf8")).toContain(
    replacement.views,
  );
  const scripts = (await filesUnder(join(f.output, "site"))).filter((path) =>
    path.includes("docc-data-routing"),
  );
  expect(scripts).toEqual([join(f.output, "site", second)]);
});

test("rejects overlapping output before deleting any input", async () => {
  const f = await fixture();
  for (const output of [f.root, f.website, join(f.website, "nested")]) {
    await rejects(
      composeCloudflare(f.website, f.demo, output, "sha"),
      /must not overlap/,
    );
    expect(await readFile(join(f.website, "index.html"), "utf8")).toBe("Site");
  }
});

test("enforces both file-count and individual-asset limits", async () => {
  const f = await fixture();
  await rejects(checkBudget(f.website, 1), /files exceeds 1/);
  const file = join(f.demo, "TerminalApp/dist/assets/app.wasm");
  await truncate(file, 25 * 1024 * 1024);
  await rejects(checkBudget(f.demo), /25 MiB asset limit/);
});

test("DocC fetches data directly without forwarding same-origin credentials or changing other requests", async () => {
  const seen: Request[] = [];
  const options: (RequestInit | undefined)[] = [];
  const context = {
    URL,
    Request,
    Headers,
    location: new URL("https://site.example/docs/documentation/example"),
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      options.push(init);
      return new Response('{"title":"DocC"}');
    },
  };
  runInNewContext(
    dataFetchRouter([["/docs/data/", "https://1234abcd.data.pages.dev"]]),
    context,
  );
  const abort = new AbortController();
  await context.fetch(
    new Request("https://site.example/docs/data/type.json?language=swift", {
      headers: { Authorization: "private", Accept: "application/json" },
      credentials: "include",
      signal: abort.signal,
    }),
  );
  expect(seen[0]!.url).toBe(
    "https://1234abcd.data.pages.dev/docs/data/type.json?language=swift",
  );
  // Bun 1.3.14's Request.credentials always reports include; inspect the
  // actual option handed to fetch.
  expect(options[0]!.credentials).toBe("omit");
  expect(seen[0]!.headers.has("authorization")).toBe(false);
  expect(seen[0]!.headers.get("accept")).toBe("application/json");
  abort.abort();
  expect(seen[0]!.signal.aborted).toBe(true);
  for (const [url, method] of [
    ["https://elsewhere.example/docs/data/type.json", "GET"],
    ["https://site.example/webexample/app.wasm", "GET"],
    ["https://site.example/docs/data/type.json", "POST"],
  ]) {
    await context.fetch(url!, { method });
    expect(seen.at(-1)!.url).toBe(url!);
    expect(seen.at(-1)!.method).toBe(method!);
  }
});
