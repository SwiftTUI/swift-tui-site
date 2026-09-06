import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";

export const dataProjects = {
  views: "swift-tui-docc-views",
  other: "swift-tui-docc-data",
} as const;

const viewsPath = "docs/data/documentation/swifttuiviews";
const dataPaths = ["docs/data", "docs/charts/data"];
const fileLimit = 20_000;
const sizeLimit = 25 * 1024 * 1024;

export async function filesUnder(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Deployment input is not a regular file or directory: ${path}`);
  }
  return files;
}

export async function checkBudget(root: string, maximumFiles = fileLimit): Promise<number> {
  const files = await filesUnder(root);
  if (files.length > maximumFiles) throw new Error(`${root}: ${files.length} files exceeds ${maximumFiles}`);
  for (const file of files) {
    if ((await stat(file)).size >= sizeLimit) throw new Error(`${file} exceeds the 25 MiB asset limit`);
  }
  return files.length;
}

export async function composeCloudflare(
  websiteDist: string, webExampleDist: string, outputRoot: string, revision: string,
): Promise<Record<string, number>> {
  const output = resolve(outputRoot);
  for (const input of [websiteDist, webExampleDist]) {
    for (const [parent, child] of [[resolve(input), output], [output, resolve(input)]] as const) {
      const path = relative(parent, child);
      if (!path || (path !== ".." && !path.startsWith(`..${sep}`))) {
        throw new Error("Deployment output and input directories must not overlap");
      }
    }
  }
  // Validate required inputs before replacing the generated deployment tree.
  await stat(join(websiteDist, viewsPath));
  for (const path of dataPaths) await stat(join(websiteDist, path));
  await stat(join(webExampleDist, "TerminalApp/dist/assets/app.wasm"));
  await rm(output, { recursive: true, force: true });
  const site = join(output, "site");
  await cp(websiteDist, site, { recursive: true });
  await rm(join(site, "webexample"), { recursive: true, force: true });
  await cp(webExampleDist, join(site, "webexample"), { recursive: true });
  await rm(join(site, "docs/documentation"), { recursive: true, force: true });
  await rm(join(site, "docs/charts/documentation"), { recursive: true, force: true });

  const counts: Record<string, number> = {};
  for (const key of ["views", "other"] as const) {
    const destination = join(output, key);
    for (const path of key === "views" ? [viewsPath] : dataPaths) {
      await mkdir(join(destination, path, ".."), { recursive: true });
      await rename(join(site, path), join(destination, path));
    }
    await writeFile(join(destination, "_headers"), "/*\n  Access-Control-Allow-Origin: *\n  X-Robots-Tag: noindex\n");
    await writeFile(join(destination, "_publication.json"), JSON.stringify({ revision, project: dataProjects[key] }));
    counts[key] = await checkBudget(destination);
  }
  // DocC treats HTTP data redirects as renamed pages. Its scoped loader must
  // request the data origin directly; public JSON URLs still have redirects.
  for (const path of ["docs/index.html", "docs/charts/index.html"]) {
    const shell = await readFile(join(site, path), "utf8");
    if (!shell.includes("</head>")) throw new Error(`Missing DocC HTML head: ${path}`);
    await writeFile(join(site, path), shell.replace("</head>", '<script src="/docc-data-routing.js"></script></head>'));
  }
  await writeFile(join(site, "docc-data-routing.js"), "// Finalized after both data deployments are verified.\n");
  // Keep an unmodified source so finalization is idempotent on retries.
  await cp(join(site, "_redirects"), join(output, "site-redirects.txt"));
  counts.site = await checkBudget(site);
  return counts;
}

export function deploymentOrigin(url: string, project: string): string {
  const parsed = new URL(url);
  const suffix = `.${project}.pages.dev`;
  const hash = parsed.hostname.slice(0, -suffix.length);
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(suffix)
    || !/^[a-f0-9]{8}$/.test(hash) || parsed.port || parsed.username || parsed.password
    || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`Expected an immutable deployment URL for ${project}`);
  }
  return parsed.origin;
}

export async function writeDataRedirects(outputRoot: string, urls: Record<keyof typeof dataProjects, string>) {
  const views = deploymentOrigin(urls.views, dataProjects.views);
  const other = deploymentOrigin(urls.other, dataProjects.other);
  const redirects = [
    `/${viewsPath}/* ${views}/${viewsPath}/:splat 302`,
    ...dataPaths.map(path => `/${path}/* ${other}/${path}/:splat 302`),
  ];
  const original = await readFile(join(outputRoot, "site-redirects.txt"), "utf8");
  await writeFile(join(outputRoot, "site/_redirects"), `${redirects.join("\n")}\n\n${original}`);
  const router = dataFetchRouter([
    [`/${viewsPath}/`, views], ...dataPaths.map(path => [`/${path}/`, other] as [string, string]),
  ]);
  // Custom domains can impose a browser cache lifetime on JavaScript. Tie the
  // URL to its contents so a new deployment cannot reuse stale data routes.
  const name = `docc-data-routing.${createHash("sha256").update(router).digest("hex")}.js`;
  const site = join(outputRoot, "site");
  const scriptPattern = /<script src="\/docc-data-routing(?:\.[a-f0-9]{64})?\.js"><\/script>/g;
  const shells = await Promise.all(["docs/index.html", "docs/charts/index.html"].map(async path => {
    const html = await readFile(join(site, path), "utf8");
    if ([...html.matchAll(scriptPattern)].length !== 1) throw new Error(`Expected one DocC data router: ${path}`);
    return [path, html.replace(scriptPattern, `<script src="/${name}"></script>`)] as const;
  }));
  await writeFile(join(site, name), router);
  for (const [path, html] of shells) await writeFile(join(site, path), html);
  for (const entry of await readdir(site)) {
    if (entry !== name && /^docc-data-routing(?:\.[a-f0-9]{64})?\.js$/.test(entry)) await rm(join(site, entry));
  }
  await checkBudget(site);
}

export function dataFetchRouter(routes: [string, string][]): string {
  return `(() => {
  const routes = ${JSON.stringify(routes)};
  const fetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) => {
    let url;
    try { url = new URL(input instanceof Request ? input.url : input, location.href); }
    catch { return fetch(input, init); }
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const route = routes.find(([prefix]) => url.pathname.startsWith(prefix));
    if (url.origin !== location.origin || method.toUpperCase() !== "GET" || !route) {
      return fetch(input, init);
    }
    const request = new Request(input instanceof Request ? input : url, init);
    const headers = new Headers(request.headers);
    headers.delete("authorization");
    headers.delete("proxy-authorization");
    const destination = new URL(url.pathname + url.search, route[1]);
    return fetch(destination, {
      method: "GET", mode: "cors", credentials: "omit", headers,
      cache: request.cache, integrity: request.integrity, keepalive: request.keepalive,
      redirect: request.redirect, referrer: request.referrer,
      referrerPolicy: request.referrerPolicy, signal: request.signal,
    });
  };
})();\n`;
}

if (import.meta.main) {
  const siteRoot = resolve(import.meta.dir, "../..");
  const demo = process.env.WEBEXAMPLE_DIR
    ? resolve(siteRoot, "Website", process.env.WEBEXAMPLE_DIR)
    : join(siteRoot, ".build/public-inputs/swift-tui-counter-demo/WebExample");
  const counts = await composeCloudflare(
    join(siteRoot, "Website/dist"),
    join(demo, "pages-dist"),
    join(siteRoot, "_cf-pages-artifact"),
    process.env.CF_COMMIT_SHA ?? Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: siteRoot }).stdout.toString().trim(),
  );
  console.log(`[compose-cloudflare] file counts: ${JSON.stringify(counts)}`);
}
