import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rejects } from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";
import { checkBudget, composeCloudflare, dataFetchRouter, dataProjects, deploymentOrigin, filesUnder, writeDataRedirects } from "./compose-cloudflare";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "compose-cloudflare-"));
  roots.push(root);
  const website = join(root, "website");
  const demo = join(root, "demo");
  const output = join(root, "output");
  const data = {
    "docs/data/documentation/swifttuiviews/palettestyle.json": '{"title":"PaletteStyle"}',
    "docs/data/documentation/swifttui.json": '{"title":"SwiftTUI"}',
    "docs/charts/data/documentation/swifttuicharts/chart.json": '{"title":"Chart"}',
  };
  const authored = {
    ...data, "index.html": "Site", "docs/index.html": "<html><head></head><body>DocC shell</body></html>",
    "docs/charts/index.html": "<html><head></head><body>Charts shell</body></html>", "docs/index/index.json": "Search index",
    "docs/documentation/swifttuiviews/palettestyle/index.html": "Duplicate shell",
    "docs/charts/documentation/swifttuicharts/chart/index.html": "Duplicate charts shell",
    "_redirects": "/docs/documentation/* /docs/ 200\n",
  };
  for (const [path, text] of Object.entries(authored)) {
    await mkdir(join(website, path, ".."), { recursive: true });
    await writeFile(join(website, path), text);
  }
  await mkdir(join(demo, "TerminalApp/dist/assets"), { recursive: true });
  await writeFile(join(demo, "TerminalApp/dist/assets/app.wasm"), "compressed wasm");
  return { root, website, demo, output, data };
}

test("preserves every DocC data byte and keeps shells, search, and demo on the main site", async () => {
  const f = await fixture();
  const counts = await composeCloudflare(f.website, f.demo, f.output, "release-sha");
  expect(counts).toEqual({ views: 3, other: 4, site: 7 });
  for (const [path, content] of Object.entries(f.data)) {
    const shard = path.includes("/swifttuiviews/") ? "views" : "other";
    expect(await readFile(join(f.output, shard, path), "utf8")).toBe(content);
    expect(await readFile(join(f.website, path), "utf8")).toBe(content);
  }
  const mainFiles = await filesUnder(join(f.output, "site"));
  expect(mainFiles.some(path => path.includes("/documentation/"))).toBe(false);
  expect(await readFile(join(f.output, "site/docs/index/index.json"), "utf8")).toBe("Search index");
  expect(await readFile(join(f.output, "site/docs/charts/index.html"), "utf8")).toContain('src="/docc-data-routing.js"');
  expect(await readFile(join(f.output, "site/webexample/TerminalApp/dist/assets/app.wasm"), "utf8")).toBe("compressed wasm");
  expect(await readFile(join(f.output, "views/_headers"), "utf8")).toContain("Access-Control-Allow-Origin: *");
});

test("uses immutable data URLs with the views rule ahead of the general data rule", async () => {
  const f = await fixture();
  await composeCloudflare(f.website, f.demo, f.output, "release-sha");
  const urls = { views: `https://1234abcd.${dataProjects.views}.pages.dev`, other: `https://abcd1234.${dataProjects.other}.pages.dev` };
  await writeDataRedirects(f.output, urls);
  const redirects = await readFile(join(f.output, "site/_redirects"), "utf8");
  expect(redirects.split("\n")[0]).toBe(`/docs/data/documentation/swifttuiviews/* ${urls.views}/docs/data/documentation/swifttuiviews/:splat 302`);
  expect(redirects).toContain(`/docs/charts/data/* ${urls.other}/docs/charts/data/:splat 302`);
  expect(redirects).toContain("/docs/documentation/* /docs/ 200");
  await writeDataRedirects(f.output, urls);
  expect(await readFile(join(f.output, "site/_redirects"), "utf8")).toBe(redirects);
  for (const url of [`https://${dataProjects.views}.pages.dev`, `https://main.${dataProjects.views}.pages.dev`, `${urls.views}/extra`, "https://1234abcd.other.pages.dev"]) {
    expect(() => deploymentOrigin(url, dataProjects.views)).toThrow("immutable deployment URL");
  }
});

test("new data deployments cannot reuse a cached routing script", async () => {
  const f = await fixture();
  await composeCloudflare(f.website, f.demo, f.output, "release-sha");
  const urls = { views: `https://1234abcd.${dataProjects.views}.pages.dev`, other: `https://abcd1234.${dataProjects.other}.pages.dev` };
  async function routerPath() {
    const html = await readFile(join(f.output, "site/docs/index.html"), "utf8");
    const path = html.match(/src="\/(docc-data-routing\.[a-f0-9]{64}\.js)"/)?.[1];
    expect(path).toBeDefined();
    expect(await readFile(join(f.output, "site/docs/charts/index.html"), "utf8")).toContain(`src="/${path}"`);
    const body = await readFile(join(f.output, "site", path!), "utf8");
    expect(path).toBe(`docc-data-routing.${createHash("sha256").update(body).digest("hex")}.js`);
    return path!;
  }
  await writeDataRedirects(f.output, urls);
  const first = await routerPath();
  await writeDataRedirects(f.output, urls);
  expect(await routerPath()).toBe(first);
  const replacement = { ...urls, views: `https://9876abcd.${dataProjects.views}.pages.dev` };
  await writeDataRedirects(f.output, replacement);
  const second = await routerPath();
  expect(second).not.toBe(first);
  expect(await readFile(join(f.output, "site", second), "utf8")).toContain(replacement.views);
  const scripts = (await filesUnder(join(f.output, "site"))).filter(path => path.includes("docc-data-routing"));
  expect(scripts).toEqual([join(f.output, "site", second)]);
});

test("rejects overlapping output before deleting any input", async () => {
  const f = await fixture();
  for (const output of [f.root, f.website, join(f.website, "nested")]) {
    await rejects(composeCloudflare(f.website, f.demo, output, "sha"), /must not overlap/);
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
    URL, Request, Headers,
    location: new URL("https://site.example/docs/documentation/example"),
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(new Request(input, init));
      options.push(init);
      return new Response('{"title":"DocC"}');
    },
  };
  runInNewContext(dataFetchRouter([["/docs/data/", "https://1234abcd.data.pages.dev"]]), context);
  const abort = new AbortController();
  await context.fetch(new Request("https://site.example/docs/data/type.json?language=swift", {
    headers: { Authorization: "private", Accept: "application/json" }, credentials: "include", signal: abort.signal,
  }));
  expect(seen[0]!.url).toBe("https://1234abcd.data.pages.dev/docs/data/type.json?language=swift");
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
