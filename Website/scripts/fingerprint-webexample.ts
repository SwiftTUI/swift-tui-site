import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

function namedByContent(path: string, contents: Uint8Array | string) {
  const extension = path.lastIndexOf(".");
  const hash = createHash("sha256").update(contents).digest("hex");
  return `${path.slice(0, extension)}.${hash}${path.slice(extension)}`;
}

function replaceReference(contents: string, from: string, to: string) {
  if (!contents.includes(from)) {
    throw new Error(`Missing WebExample asset reference: ${from}`);
  }
  return contents.replaceAll(from, to);
}

/** Fingerprint the copied deployment graph without modifying tagged inputs. */
export async function fingerprintWebExample(site: string) {
  const demo = join(site, "webexample");
  const plan = await planWebExampleFingerprint(
    demo,
    await readFile(join(site, "_headers"), "utf8"),
  );
  for (const [path, contents] of plan.files)
    await writeFile(join(demo, path), contents);
  await writeFile(join(site, "_headers"), plan.headers);
}

/**
 * Reads every WebExample input under `demo` and computes the fingerprinted
 * files and the extended `headers`, writing nothing. Throws when an input, or
 * a reference the fingerprint rewrites, is missing, so a caller can validate
 * the inputs before it replaces anything.
 */
export async function planWebExampleFingerprint(
  demo: string,
  headers: string,
): Promise<{
  files: (readonly [string, Uint8Array | string])[];
  headers: string;
}> {
  const wasmPath = "TerminalApp/dist/assets/app.wasm";
  const workerPath = "wasm-scene-worker.js";
  const manifestPath = "TerminalApp/dist/scene-manifest.json";
  const wasm = await readFile(join(demo, wasmPath));
  const worker = await readFile(join(demo, workerPath));
  const manifest = await readFile(join(demo, manifestPath));
  const stylesheet = await readFile(join(demo, "index.css"));
  const wasmName = namedByContent(wasmPath, wasm);
  const workerName = namedByContent(workerPath, worker);
  const manifestName = namedByContent(manifestPath, manifest);
  let frontend = await readFile(join(demo, "index.js"), "utf8");
  frontend = replaceReference(frontend, `./${wasmPath}`, `./${wasmName}`);
  frontend = replaceReference(frontend, `./${workerPath}`, `./${workerName}`);
  frontend = replaceReference(
    frontend,
    `./${manifestPath}`,
    `./${manifestName}`,
  );
  const frontendName = namedByContent("index.js", frontend);
  const stylesheetName = namedByContent("index.css", stylesheet);
  const pages = await Promise.all(
    ["index.html", "dom.html"].map(async (path) => {
      let html = await readFile(join(demo, path), "utf8");
      html = replaceReference(
        html,
        'src="./index.js"',
        `src="./${frontendName}"`,
      );
      html = replaceReference(
        html,
        'href="./index.css"',
        `href="./${stylesheetName}"`,
      );
      return [path, html] as const;
    }),
  );
  const rules = [
    `/webexample/${wasmName}\n  Cache-Control: public, max-age=31536000, immutable, no-transform\n  Content-Type: application/wasm\n  Content-Encoding: br`,
    ...[workerName, manifestName, frontendName, stylesheetName].map(
      (path) =>
        `/webexample/${path}\n  Cache-Control: public, max-age=31536000, immutable`,
    ),
  ];
  // Retain stable aliases for direct consumers; HTML loads only hashed assets.
  return {
    files: [
      [wasmName, wasm],
      [workerName, worker],
      [manifestName, manifest],
      [frontendName, frontend],
      [stylesheetName, stylesheet],
      ...pages,
    ],
    headers: `${headers.trimEnd()}\n\n${rules.join("\n\n")}\n`,
  };
}
