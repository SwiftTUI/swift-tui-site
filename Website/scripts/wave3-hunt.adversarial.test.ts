// Wave-3 regression hunt, part CB (swift-tui-org campaign two, STUI-1167):
// neighbours of the aba2410 site-script repairs (STUI-1195 to STUI-1206). The
// coordination root's wave-3 hunt evidence owns the case descriptions
// (w3cb021 to w3cb030). Every shell case runs against a temporary site root
// assembled as shell-scripts.adversarial.test.ts assembles one; nothing
// touches the checkout.
import { afterEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { composeCloudflare } from "./compose-cloudflare";
import { parseTokens, resolveToken } from "./docc-theme";

const websiteRoot = resolve(import.meta.dir, "..");
const siteCheckout = resolve(websiteRoot, "..");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function tempRoot(prefix: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)));
  tempRoots.push(root);
  return root;
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

const readText = (path: string) => readFile(path, "utf8").catch(() => "");

async function plant(path: string, text: string): Promise<string> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
  return path;
}

/**
 * A reproduced finding asserts the observed value, requires the contract
 * expectation to fail, and logs a W3HUNT_KNOWN_ASSERTION line citing the
 * proposed issue. With SWIFTTUI_W3HUNT_UNMARKED=1 only the contract runs.
 */
function w3HuntKnownIssue(
  message: string,
  observed: () => void,
  contract: () => void,
): void {
  if (process.env.SWIFTTUI_W3HUNT_UNMARKED === "1") {
    contract();
    return;
  }
  observed();
  expect(contract).toThrow();
  console.log(`W3HUNT_KNOWN_ASSERTION ${message}`);
}

// ---------------------------------------------------------------------------
// Scripts/build_docc_site.sh and Scripts/apply_docc_theme.sh fixtures.

interface SiteRoot {
  root: string;
  siteRoot: string;
  dist: string;
  buildScript: string;
  themeScript: string;
}

async function makeSiteRoot(): Promise<SiteRoot> {
  const root = await tempRoot("w3hunt-site-scripts-");
  const siteRoot = join(root, "site");
  await mkdir(join(siteRoot, "Scripts"), { recursive: true });
  await mkdir(join(siteRoot, "docs"), { recursive: true });
  await mkdir(join(siteRoot, "Website/dist"), { recursive: true });
  await mkdir(join(siteRoot, "Website/docs-theme"), { recursive: true });
  for (const script of ["build_docc_site.sh", "apply_docc_theme.sh"]) {
    await copyFile(
      join(siteCheckout, "Scripts", script),
      join(siteRoot, "Scripts", script),
    );
    await chmod(join(siteRoot, "Scripts", script), 0o755);
  }
  await writeFile(
    join(siteRoot, "Website/docs-theme/theme-settings.json"),
    '{"theme":{}}\n',
  );
  await writeFile(
    join(siteRoot, "Website/docs-theme/docs-theme.css"),
    "/* fixture theme */\n",
  );
  return {
    root,
    siteRoot,
    dist: join(siteRoot, "Website/dist"),
    buildScript: join(siteRoot, "Scripts/build_docc_site.sh"),
    themeScript: join(siteRoot, "Scripts/apply_docc_theme.sh"),
  };
}

/**
 * A local checkout whose doccCommand writes `text`, followed by the arguments
 * it was run with, into .build-docs/index.html.
 */
async function checkoutStub(
  site: SiteRoot,
  name: string,
  text: string,
): Promise<string> {
  const dir = join(site.root, "checkouts", name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "make-docs.sh"),
    `#!/usr/bin/env bash
set -euo pipefail
mkdir -p .build-docs/documentation/fixture
printf '%s args=[%s]\\n' '${text}' "$*" > .build-docs/index.html
printf '<html><head><title>x</title></head><body>shell</body></html>\\n' > .build-docs/documentation/fixture/index.html
`,
  );
  await chmod(join(dir, "make-docs.sh"), 0o755);
  return dir;
}

function entry(
  name: string,
  mountPath: string,
  extra: Record<string, string> = {},
): string {
  const fields: Record<string, string> = {
    name,
    repository: `SwiftTUI/${name}`,
    ref: "fixture",
    doccCommand: "./make-docs.sh",
    outputPath: ".build-docs",
    mountPath,
    ...extra,
  };
  return `  - ${Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n    ")}\n`;
}

interface RunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function runBash(
  script: string,
  args: string[],
  env: Record<string, string | undefined>,
  cwd: string,
): RunResult {
  const cleanEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries({ ...process.env, ...env })) {
    if (value !== undefined) cleanEnv[key] = value;
  }
  // A caller-set DOCC_EXEC skips the toolchain docc probe; the fixture
  // doccCommand never runs docc.
  cleanEnv.DOCC_EXEC ??= "/usr/bin/true";
  const result = Bun.spawnSync({
    cmd: ["bash", script, ...args],
    cwd,
    env: cleanEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

type RepoName = "swift-tui" | "swift-tui-charts";
const checkoutVariable = (name: RepoName) =>
  name === "swift-tui" ? "SWIFTTUI_CHECKOUT" : "SWIFTTUI_CHARTS_CHECKOUT";

/** Local-checkout stubs for `names`, as environment for build_docc_site.sh. */
async function checkoutEnv(
  site: SiteRoot,
  names: RepoName[],
): Promise<Record<string, string>> {
  const env: Record<string, string> = {};
  for (const name of names)
    env[checkoutVariable(name)] = await checkoutStub(
      site,
      name,
      `${name} archive`,
    );
  return env;
}

async function buildManifest(
  site: SiteRoot,
  manifest: string,
  names: RepoName[],
): Promise<RunResult> {
  const env = await checkoutEnv(site, names);
  await writeFile(join(site.siteRoot, "docs/docc-repos.yml"), manifest);
  return runBash(site.buildScript, [], env, site.siteRoot);
}

/** Isolated local remotes behind url.insteadOf, as build_docc_site_test.sh builds them. */
async function makeRemotes(
  site: SiteRoot,
  tags: string[],
): Promise<Record<string, string | undefined>> {
  const remoteRoot = join(site.root, "remotes");
  await mkdir(remoteRoot, { recursive: true });
  const gitConfig = join(site.root, "gitconfig");
  const git = (...args: string[]) => {
    const result = Bun.spawnSync({
      cmd: ["git", ...args],
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: gitConfig,
        GIT_CONFIG_NOSYSTEM: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `git ${args.join(" ")} failed: ${new TextDecoder().decode(result.stderr)}`,
      );
    }
  };
  await writeFile(gitConfig, "");
  git(
    "config",
    "--file",
    gitConfig,
    `url.file://${remoteRoot}/.insteadOf`,
    "https://github.com/SwiftTUI/",
  );
  const remote = join(remoteRoot, "swift-tui");
  git("-c", "init.defaultBranch=main", "init", "-q", remote);
  await writeFile(
    join(remote, "make-docs.sh"),
    '#!/bin/sh\nmkdir -p .build-docs\nprintf "tagged swift-tui\\n" > .build-docs/index.html\n',
  );
  await chmod(join(remote, "make-docs.sh"), 0o755);
  git("-C", remote, "add", "make-docs.sh");
  git(
    "-C",
    remote,
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "-qm",
    "tagged",
  );
  for (const tag of tags)
    git("-C", remote, "-c", "tag.gpgsign=false", "tag", tag);
  return {
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    SWIFTTUI_CHECKOUT: undefined,
    SWIFTTUI_CHARTS_CHECKOUT: undefined,
    SWIFTTUI_TERMINAL_VIEW_CHECKOUT: undefined,
  };
}

const shell = "<html><head><title>x</title></head><body>shell</body></html>\n";

async function linkedHref(mountPath: string): Promise<string | undefined> {
  const site = await makeSiteRoot();
  const mount = join(site.dist, "docs");
  await plant(join(mount, "documentation/fixture/index.html"), shell);
  const result = runBash(
    site.themeScript,
    [mount, mountPath],
    {},
    site.siteRoot,
  );
  expect(result.exitCode, result.stderr).toBe(0);
  const linked = await readText(
    join(mount, "documentation/fixture/index.html"),
  );
  return linked.match(/href="([^"]*docs-theme\.css)"/)?.[1];
}

// ---------------------------------------------------------------------------
// Mounts (STUI-1199): build_docc_site.sh:26-29, README.md:79-81,
// build_docc_site_test.sh:87-89 (every archive survives composition).

/** Whether the temporary directory's volume treats names case-insensitively. */
async function caseInsensitiveVolume(): Promise<boolean> {
  const root = await tempRoot("w3hunt-case-");
  await writeFile(join(root, "probe"), "");
  return exists(join(root, "PROBE"));
}

test("w3cb021 a case-only duplicate mount replaces the earlier archive on a case-insensitive volume", async () => {
  const site = await makeSiteRoot();
  const previous = await plant(join(site.dist, "docs/old.txt"), "previous");
  const result = await buildManifest(
    site,
    `swiftRepos:\n${entry("swift-tui", "docs")}${entry("swift-tui-charts", "DOCS")}`,
    ["swift-tui", "swift-tui-charts"],
  );
  const refused =
    result.exitCode !== 0 &&
    result.stderr.includes("mountPath") &&
    (await exists(previous));
  const docs = await readText(join(site.dist, "docs/index.html"));
  const upper = await readText(join(site.dist, "DOCS/index.html"));
  const bothSurvive =
    result.exitCode === 0 &&
    docs.includes("swift-tui archive") &&
    upper.includes("swift-tui-charts archive");
  const outcome = refused
    ? "refused before any rm"
    : bothSurvive
      ? "both archives survive"
      : `exit ${result.exitCode}; docs/index.html: ${docs.trim()}; old.txt ${(await exists(previous)) ? "kept" : "deleted"}`;
  const contract = () =>
    expect(["refused before any rm", "both archives survive"]).toContain(
      outcome,
    );
  // On a case-sensitive volume the two mounts are distinct directories and
  // the contract holds; only a case-insensitive volume reproduces the finding.
  if (!(await caseInsensitiveVolume())) {
    contract();
    return;
  }
  w3HuntKnownIssue(
    "w3cb021 NEW-5: on a case-insensitive volume mounts docs and DOCS pass the duplicate check and the second archive deletes the first; mounts are compared as normalized strings, not as directories (build_docc_site.sh:195-205); contract: build_docc_site.sh:26-29, README.md:79-81, build_docc_site_test.sh:87-89; adjacent STUI-1199",
    () =>
      expect(outcome).toBe(
        "exit 0; docs/index.html: swift-tui-charts archive args=[]; old.txt deleted",
      ),
    contract,
  );
});

test("w3cb022 a nested mount reached through a symlink inside the dist is deleted by its containing mount", async () => {
  const site = await makeSiteRoot();
  await mkdir(join(site.dist, "docs"), { recursive: true });
  await symlink("docs", join(site.dist, "alias"));
  const result = await buildManifest(
    site,
    `swiftRepos:\n${entry("swift-tui-charts", "alias/charts")}${entry("swift-tui", "docs")}`,
    ["swift-tui", "swift-tui-charts"],
  );
  const refused = result.exitCode !== 0 && result.stderr.includes("mountPath");
  const charts = await readText(join(site.dist, "docs/charts/index.html"));
  const outcome = refused
    ? "refused before any rm"
    : result.exitCode === 0 && charts.includes("swift-tui-charts archive")
      ? "both archives survive"
      : `exit ${result.exitCode}; docs/charts/index.html ${charts ? charts.trim() : "missing"}`;
  w3HuntKnownIssue(
    "w3cb022 NEW-5: a nested mount reached through a symlinked directory inside the dist (alias/charts, alias -> docs) listed before docs is deleted by the docs entry; mounts are compared as normalized strings, and the real-path check covers only containment (build_docc_site.sh:199-204, :217-231); contract: build_docc_site.sh:26-29, README.md:79-81; adjacent STUI-1199, STUI-1197",
    () => expect(outcome).toBe("exit 0; docs/charts/index.html missing"),
    () =>
      expect(["refused before any rm", "both archives survive"]).toContain(
        outcome,
      ),
  );
});

// ---------------------------------------------------------------------------
// Theme href (STUI-1200): apply_docc_theme.sh:11-13; RFC 3986 §4.2.

test("w3cb023 a doubled slash in the mount path still links an absolute path", async () => {
  const hrefs = [await linkedHref("//docs"), await linkedHref("docs//")];
  w3HuntKnownIssue(
    "w3cb023 NEW-6: apply_docc_theme.sh links //docs/docs-theme.css (a network-path reference) for //docs and /docs//docs-theme.css for docs//; it strips one leading and one trailing slash (apply_docc_theme.sh:34-35, :59); contract: apply_docc_theme.sh:11-13, RFC 3986 §4.2; adjacent STUI-1200",
    () =>
      expect(hrefs).toEqual(["//docs/docs-theme.css", "/docs//docs-theme.css"]),
    () =>
      expect(hrefs).toEqual(["/docs/docs-theme.css", "/docs/docs-theme.css"]),
  );
});

// ---------------------------------------------------------------------------
// Manifest reader (STUI-1198): build_docc_site.sh:22-24 (a swiftRepos: block
// list of flat key: value mappings, unsupported forms refused); YAML 1.2
// §8.2.1 (block sequences), §7.3.3 (plain scalars fold across lines). Bun's
// YAML parser is the cross-implementation reading of each manifest.

test("w3cb024 entries of a sibling top-level list are not built as swiftRepos entries", async () => {
  const site = await makeSiteRoot();
  const manifest = `swiftRepos:\n${entry("swift-tui", "docs")}archivedRepos:\n${entry("swift-tui-charts", "docs-archived")}`;
  // Precondition: YAML reads one swiftRepos entry.
  const yaml = Bun.YAML.parse(manifest) as { swiftRepos: unknown[] };
  expect(yaml.swiftRepos).toHaveLength(1);
  const result = await buildManifest(site, manifest, [
    "swift-tui",
    "swift-tui-charts",
  ]);
  const archived = await exists(join(site.dist, "docs-archived/index.html"));
  const outcome =
    result.exitCode !== 0
      ? "refused as unsupported"
      : archived
        ? "archivedRepos entry built"
        : "only swiftRepos built";
  w3HuntKnownIssue(
    "w3cb024 NEW-7: an entry listed under a sibling top-level key (archivedRepos:) is built as a swiftRepos entry; the manifest reader is line-based, discards indentation and starts an entry at any '- ' line (build_docc_site.sh:167-185); contract: build_docc_site.sh:22-24, YAML 1.2 §8.2.1 (Bun.YAML reads one entry); adjacent STUI-1198",
    () => expect(outcome).toBe("archivedRepos entry built"),
    () =>
      expect(["refused as unsupported", "only swiftRepos built"]).toContain(
        outcome,
      ),
  );
});

test("w3cb025 a plain scalar folded onto a continuation line keeps the continuation", async () => {
  const site = await makeSiteRoot();
  const manifest = `swiftRepos:\n${entry("swift-tui", "docs", {
    doccCommand: "./make-docs.sh\n      --flag",
  })}`;
  // Precondition: YAML folds the continuation into the scalar.
  const yaml = Bun.YAML.parse(manifest) as {
    swiftRepos: { doccCommand: string }[];
  };
  expect(yaml.swiftRepos[0]?.doccCommand).toBe("./make-docs.sh --flag");
  const result = await buildManifest(site, manifest, ["swift-tui"]);
  const index = await readText(join(site.dist, "docs/index.html"));
  const outcome =
    result.exitCode !== 0
      ? "refused as unsupported"
      : index.includes("args=[--flag]")
        ? "ran ./make-docs.sh --flag"
        : `ran with ${index.trim()}`;
  w3HuntKnownIssue(
    "w3cb025 NEW-7: a plain doccCommand folded onto a continuation line runs without the continuation; a line without ':' is skipped (build_docc_site.sh:177); contract: build_docc_site.sh:22-24, YAML 1.2 §7.3.3 (Bun.YAML reads './make-docs.sh --flag'); adjacent STUI-1198",
    () => expect(outcome).toBe("ran with swift-tui archive args=[]"),
    () =>
      expect(["refused as unsupported", "ran ./make-docs.sh --flag"]).toContain(
        outcome,
      ),
  );
});

test("w3cb029 double-quoted manifest escapes decode, and an escaped tab is refused before any rm", async () => {
  // YAML 1.2 §5.7 escapes; build_docc_site.sh:183-184 refuses control
  // characters; README.md:79-81, checked before anything is deleted.
  const decoded = await makeSiteRoot();
  const env = await makeRemotes(decoded, ["fixture"]);
  await writeFile(
    join(decoded.siteRoot, "docs/docc-repos.yml"),
    `swiftRepos:\n${entry("swift-tui", "docs", { ref: '"fix\\x74ure"' })}`,
  );
  const built = runBash(
    decoded.buildScript,
    [],
    { ...env, DOCC_SOURCE_REF: "" },
    decoded.siteRoot,
  );
  const refusedSite = await makeSiteRoot();
  const refusedEnv = await makeRemotes(refusedSite, ["fixture"]);
  const previous = await plant(
    join(refusedSite.dist, "docs/old.txt"),
    "previous",
  );
  await writeFile(
    join(refusedSite.siteRoot, "docs/docc-repos.yml"),
    `swiftRepos:\n${entry("swift-tui", "docs", { ref: '"fix\\tture"' })}`,
  );
  const refused = runBash(
    refusedSite.buildScript,
    [],
    { ...refusedEnv, DOCC_SOURCE_REF: "" },
    refusedSite.siteRoot,
  );
  expect({
    built: built.exitCode,
    index: (await readText(join(decoded.dist, "docs/index.html"))).trim(),
    refused: refused.exitCode,
    message: refused.stderr.includes("control characters"),
    previous: await exists(previous),
  }).toEqual({
    built: 0,
    index: "tagged swift-tui",
    refused: 1,
    message: true,
    previous: true,
  });
});

// ---------------------------------------------------------------------------
// Tokens (STUI-1205): CSS Custom Properties L1 §3 (a custom property with
// the guaranteed-invalid value takes the var() fallback), §3.1 (an
// unregistered custom property invalid at computed-value time has the
// guaranteed-invalid value), §2.3 (properties in a cycle are invalid at
// computed-value time).

const tail = `
      [data-theme="dark"] {
        --a: #ffffff;
      }
      :root {
        --font-writer: "iA Writer Quattro S", monospace;
        --font-mono: "Geist Mono", monospace;
      }
`;

const tokenForms = parseTokens(`
      :root, [data-theme="light"] {
        --a: #000000;
        --unknown: var(--missing);
        --outer: var(--unknown, #123456);
        --p: var(--q);
        --q: var(--p);
        --cyc: var(--p, #654321);
        --upper: VAR(--a);
        --commas: var(--missing, rgb(1, 2, 3));
        --empty: var(--missing,);
      }${tail}`);

function resolved(name: string): string {
  try {
    return resolveToken(name, tokenForms.light, tokenForms.shared);
  } catch (error) {
    return `throws ${error instanceof Error ? error.message : String(error)}`;
  }
}

test("w3cb026 a declared token whose own substitution fails takes the outer fallback", () => {
  const values = [resolved("--outer"), resolved("--cyc")];
  w3HuntKnownIssue(
    "w3cb026 NEW-8: var(--x, F) throws instead of taking F when --x is declared but its own substitution fails (an undefined reference or a cycle); resolveToken takes the fallback only for an undeclared name (docc-theme.ts:110-112, :74-77); contract: CSS Custom Properties L1 §3, §3.1, §2.3 (Chromium 149 resolves #123456 and #654321); adjacent STUI-1205",
    () =>
      expect(values).toEqual([
        "throws unknown token --missing",
        "throws token alias cycle at --p",
      ]),
    () => expect(values).toEqual(["#123456", "#654321"]),
  );
});

test("w3cb027 var() function-name case and comma-bearing or empty fallbacks resolve as CSS", () => {
  expect([
    resolved("--upper"),
    resolved("--commas"),
    resolved("--empty"),
  ]).toEqual(["#000000", "rgb(1, 2, 3)", ""]);
});

// ---------------------------------------------------------------------------
// Cloudflare (STUI-1203): compose-cloudflare.ts:150-155 ("Every input the
// composition reads, and every precondition it asserts on them").

async function composeFixture() {
  const root = await tempRoot("w3hunt-compose-");
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
  for (const [path, text] of Object.entries(authored))
    await plant(join(website, path), text);
  await plant(
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
    "dom.html": '<script type="module" src="./index.js"></script>',
  }))
    await plant(join(demo, path), text);
  return { website, demo, output };
}

test("w3cb028 a dom.html without its stylesheet reference is refused before the previous tree is removed", async () => {
  const f = await composeFixture();
  const marker = await plant(
    join(f.output, "previous-deployment.marker"),
    "previous deployment",
  );
  await rejects(
    composeCloudflare(f.website, f.demo, f.output, "sha"),
    /Missing WebExample asset reference/,
  );
  expect(await exists(marker)).toBe(true);
});

// ---------------------------------------------------------------------------
// releases.yml (STUI-1196): prepare-webexample.ts:47-65 reads
// current.counterDemoRef with Bun's YAML 1.2 core schema; README.md:76-78.

async function prepareFixture(releasesYaml: string) {
  const root = await tempRoot("w3hunt-prepare-webexample-");
  const siteRoot = join(root, "site");
  const scriptsDir = join(siteRoot, "Website/scripts");
  const binDir = join(root, "bin");
  const logPath = join(root, "commands.log");
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(join(siteRoot, "docs"), { recursive: true });
  await mkdir(binDir, { recursive: true });
  await copyFile(
    join(websiteRoot, "scripts/prepare-webexample.ts"),
    join(scriptsDir, "prepare-webexample.ts"),
  );
  await writeFile(join(siteRoot, "docs/releases.yml"), releasesYaml);
  // `git clone` creates the WebExample directory; every other call is logged.
  await writeFile(
    join(binDir, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'git %s\\n' "$*" >> "$FAKE_COMMAND_LOG"
if [[ "$*" == *"rev-parse --show-toplevel"* ]]; then exit 128; fi
if [[ "$1" == "clone" ]]; then mkdir -p "$7/WebExample"; fi
exit 0
`,
  );
  await writeFile(
    join(binDir, "bun"),
    `#!/usr/bin/env bash
printf 'bun %s\\n' "$*" >> "$FAKE_COMMAND_LOG"
`,
  );
  await chmod(join(binDir, "git"), 0o755);
  await chmod(join(binDir, "bun"), 0o755);
  const result = Bun.spawnSync({
    cmd: [process.execPath, "run", join(scriptsDir, "prepare-webexample.ts")],
    cwd: siteRoot,
    env: {
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      FAKE_COMMAND_LOG: logPath,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { exitCode: result.exitCode, log: await readText(logPath) };
}

test("w3cb030 YAML 1.1-only scalar shapes stay string pins", async () => {
  const refs = ["on", "no", "2026-10-25"];
  const observed: string[] = [];
  for (const ref of refs) {
    const run = await prepareFixture(`current:\n  counterDemoRef: ${ref}\n`);
    const clone = run.log
      .split("\n")
      .find((line) => line.startsWith("git clone"));
    observed.push(`${run.exitCode} ${clone?.split(" ").slice(0, 6).join(" ")}`);
  }
  expect(observed).toEqual(
    refs.map((ref) => `0 git clone --depth 1 --branch ${ref}`),
  );
});
