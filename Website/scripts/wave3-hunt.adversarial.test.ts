// Wave-3 regression hunt, part CB (swift-tui-org campaign two, STUI-1167):
// neighbours of the aba2410 site-script repairs (STUI-1195 to STUI-1206). The
// coordination root's wave-3 hunt evidence owns the case descriptions
// (w3cb021 to w3cb030). Every shell case runs against a temporary site root
// assembled as shell-scripts.adversarial.test.ts assembles one; nothing
// touches the checkout. The wave-4 repair (STUI-1169: STUI-1278 to STUI-1281)
// promoted the six finding tests, w3cb021 to w3cb026, to ordinary assertions
// and adds its own repair and neighbour scenarios as `wave4 ...` tests.
import { afterEach, expect, test } from "bun:test";
import { rejects } from "node:assert/strict";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
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

/** Every path under `root`, relative and sorted; links are listed, not followed. */
async function listing(root: string, prefix = ""): Promise<string[]> {
  const paths: string[] = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    paths.push(path);
    if ((await lstat(join(root, path))).isDirectory())
      paths.push(...(await listing(root, path)));
  }
  return paths;
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

type RepoName = "swift-tui" | "swift-tui-charts" | "swift-tui-terminal-view";
const checkoutVariable = (name: RepoName) =>
  ({
    "swift-tui": "SWIFTTUI_CHECKOUT",
    "swift-tui-charts": "SWIFTTUI_CHARTS_CHECKOUT",
    "swift-tui-terminal-view": "SWIFTTUI_TERMINAL_VIEW_CHECKOUT",
  })[name];

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

/** apply_docc_theme.sh over a docs mount holding one shell. */
async function applyTheme(mountPath: string) {
  const site = await makeSiteRoot();
  const mount = join(site.dist, "docs");
  const shellPath = await plant(
    join(mount, "documentation/fixture/index.html"),
    shell,
  );
  const result = runBash(
    site.themeScript,
    [mount, mountPath],
    {},
    site.siteRoot,
  );
  const linked = await readText(shellPath);
  return {
    result,
    mount,
    shellPath,
    linked,
    href: linked.match(/href="([^"]*docs-theme\.css)"/)?.[1],
  };
}

async function linkedHref(mountPath: string): Promise<string | undefined> {
  const { result, href } = await applyTheme(mountPath);
  expect(result.exitCode, result.stderr).toBe(0);
  return href;
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
  // STUI-1278, fixed in wave 4: on a case-insensitive volume docs and DOCS
  // name one directory and the build is refused before any rm; on a
  // case-sensitive volume they are distinct and both archives compose.
  expect(outcome).toBe(
    (await caseInsensitiveVolume())
      ? "refused before any rm"
      : "both archives survive",
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
  // STUI-1278, fixed in wave 4: docs contains the earlier alias/charts.
  expect(outcome).toBe("refused before any rm");
});

// Wave 4 repair scenarios (swift-tui-org campaign two, STUI-1169): ids
// w4s03-w4s08 and w4s37 of the wave-4 site repair-hypotheses.json. Mounts are
// compared as the directories they name, before anything is deleted.

test("wave4 STUI-1278 case-only mounts that do not exist yet are compared as the directories they create", async () => {
  const site = await makeSiteRoot();
  const result = await buildManifest(
    site,
    `swiftRepos:\n${entry("swift-tui", "docs")}${entry("swift-tui-charts", "DOCS")}`,
    ["swift-tui", "swift-tui-charts"],
  );
  if (await caseInsensitiveVolume()) {
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("mountPath");
    // The probe removes the directories it created.
    expect(await listing(site.dist)).toEqual([]);
  } else {
    expect(result.exitCode, result.stderr).toBe(0);
    expect(await readText(join(site.dist, "docs/index.html"))).toContain(
      "swift-tui archive",
    );
    expect(await readText(join(site.dist, "DOCS/index.html"))).toContain(
      "swift-tui-charts archive",
    );
  }
});

test("wave4 STUI-1278 a case-only containing mount listed after its nested mount is refused on a case-insensitive volume", async () => {
  const site = await makeSiteRoot();
  const result = await buildManifest(
    site,
    `swiftRepos:\n${entry("swift-tui-charts", "DOCS/charts")}${entry("swift-tui", "docs")}`,
    ["swift-tui", "swift-tui-charts"],
  );
  if (await caseInsensitiveVolume()) {
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("mountPath");
    expect(await listing(site.dist)).toEqual([]);
  } else {
    expect(result.exitCode, result.stderr).toBe(0);
    expect(await readText(join(site.dist, "DOCS/charts/index.html"))).toContain(
      "swift-tui-charts archive",
    );
    expect(await readText(join(site.dist, "docs/index.html"))).toContain(
      "swift-tui archive",
    );
  }
});

test("wave4 STUI-1278 a refused manifest leaves the dist as it found it", async () => {
  const site = await makeSiteRoot();
  await plant(join(site.dist, "docs/old.txt"), "previous");
  await mkdir(join(site.dist, "keep-empty"));
  await symlink("docs", join(site.dist, "alias"));
  const before = await listing(site.dist);
  const result = await buildManifest(
    site,
    `swiftRepos:\n${entry("swift-tui-terminal-view", "fresh/one")}${entry("swift-tui-charts", "alias/charts")}${entry("swift-tui", "docs")}`,
    ["swift-tui", "swift-tui-charts", "swift-tui-terminal-view"],
  );
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("mountPath");
  expect(await listing(site.dist)).toEqual(before);
  expect(before).toEqual(["alias", "docs", "docs/old.txt", "keep-empty"]);
  expect((await lstat(join(site.dist, "alias"))).isSymbolicLink()).toBe(true);
});

test("wave4 STUI-1278 a mount whose last component links to an earlier mount is refused", async () => {
  const site = await makeSiteRoot();
  await mkdir(join(site.dist, "docs"));
  await symlink("docs", join(site.dist, "latest"));
  const result = await buildManifest(
    site,
    `swiftRepos:\n${entry("swift-tui", "docs")}${entry("swift-tui-charts", "latest")}`,
    ["swift-tui", "swift-tui-charts"],
  );
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("mountPath");
  expect((await lstat(join(site.dist, "latest"))).isSymbolicLink()).toBe(true);
});

test("wave4 STUI-1278 a nested mount reached through a symlink after its container still composes", async () => {
  const site = await makeSiteRoot();
  await mkdir(join(site.dist, "docs"));
  await symlink("docs", join(site.dist, "alias"));
  const result = await buildManifest(
    site,
    `swiftRepos:\n${entry("swift-tui", "docs")}${entry("swift-tui-charts", "alias/charts")}`,
    ["swift-tui", "swift-tui-charts"],
  );
  expect(result.exitCode, result.stderr).toBe(0);
  expect(await readText(join(site.dist, "docs/index.html"))).toContain(
    "swift-tui archive",
  );
  expect(await readText(join(site.dist, "docs/charts/index.html"))).toContain(
    "swift-tui-charts archive",
  );
});

test("wave4 STUI-1278 a mount through a dangling link inside the dist composes and leaves no probe directory", async () => {
  const site = await makeSiteRoot();
  await symlink("nowhere", join(site.dist, "dangling"));
  const result = await buildManifest(
    site,
    `swiftRepos:\n${entry("swift-tui", "dangling")}`,
    ["swift-tui"],
  );
  expect(result.exitCode, result.stderr).toBe(0);
  // rm -rf replaces the link itself; the probe's directory at its target is
  // removed again once the mounts are checked.
  expect(await listing(site.dist)).toEqual([
    "dangling",
    "dangling/docs-theme.css",
    "dangling/documentation",
    "dangling/documentation/fixture",
    "dangling/documentation/fixture/index.html",
    "dangling/index.html",
    "dangling/theme-settings.json",
  ]);
});

test("wave4 STUI-1278 a mount through a symlink out of the dist is refused before any directory is created", async () => {
  const site = await makeSiteRoot();
  await mkdir(join(site.siteRoot, "outside"));
  await symlink("../../outside", join(site.dist, "linked"));
  const result = await buildManifest(
    site,
    `swiftRepos:\n${entry("swift-tui", "fresh")}${entry("swift-tui-charts", "linked/new")}`,
    ["swift-tui", "swift-tui-charts"],
  );
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("outside");
  expect(await exists(join(site.dist, "fresh"))).toBe(false);
  expect(await exists(join(site.siteRoot, "outside/new"))).toBe(false);
});

// ---------------------------------------------------------------------------
// Theme href (STUI-1200): apply_docc_theme.sh:11-13; RFC 3986 §4.2.

test("w3cb023 a doubled slash in the mount path still links an absolute path", async () => {
  const hrefs = [await linkedHref("//docs"), await linkedHref("docs//")];
  // STUI-1279, fixed in wave 4.
  expect(hrefs).toEqual(["/docs/docs-theme.css", "/docs/docs-theme.css"]);
});

// Wave 4 repair scenarios: ids w4s11-w4s13. The mount path is normalized as
// build_docc_site.sh normalizes a mountPath.

test.each([
  ["/./docs/./", "/docs/docs-theme.css"],
  ["docs/./charts", "/docs/charts/docs-theme.css"],
  ["///", "/docs-theme.css"],
])("wave4 STUI-1279 mount path %p links %p", async (mountPath, href) => {
  expect(await linkedHref(mountPath)).toBe(href);
});

test("wave4 STUI-1279 a mount path with a .. segment is refused before anything is written", async () => {
  const { result, mount, linked } = await applyTheme("docs/../x");
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain("..");
  expect(linked).toBe(shell);
  expect(await exists(join(mount, "docs-theme.css"))).toBe(false);
  expect(await exists(join(mount, "theme-settings.json"))).toBe(false);
});

test.each([
  ["docs/charts", "/docs/charts/docs-theme.css", "docs/charts"],
  ["/", "/docs-theme.css", "/"],
  ["", "/docs-theme.css", "/"],
])(
  "wave4 STUI-1279 mount path %p still links %p",
  async (mountPath, href, label) => {
    const { result, href: linked } = await applyTheme(mountPath);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(linked).toBe(href);
    expect(result.stdout).toContain(
      `[apply_docc_theme] ${label}: theme copied, 1 shell(s) linked`,
    );
  },
);

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
  // STUI-1280, fixed in wave 4: the line the reader cannot place is refused.
  expect(outcome).toBe("refused as unsupported");
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
  // STUI-1280, fixed in wave 4: a multi-line scalar is an unsupported form.
  expect(outcome).toBe("refused as unsupported");
});

// Wave 4 repair scenarios: ids w4s16-w4s27, w4s35 and w4s36. The reader
// places every line of the documented subset or refuses the manifest at that
// line, before any rm. Bun.YAML, the cross-implementation reading, either
// rejects each refused shape or reads it as something other than one flat
// swiftRepos list (a tab never indents YAML, YAML 1.2 §6.1, although Bun.YAML
// accepts one).

const docsEntry = entry("swift-tui", "docs");

test.each([
  [
    "a sibling list before swiftRepos",
    `archivedRepos:\n${entry("swift-tui-charts", "docs-archived")}swiftRepos:\n${docsEntry}`,
    1,
    false,
  ],
  [
    "a continuation at the key column",
    `swiftRepos:\n${entry("swift-tui", "docs", { doccCommand: "./make-docs.sh\n    --flag" })}`,
    6,
    true,
  ],
  [
    "a nested mapping under an entry key",
    `swiftRepos:\n${entry("swift-tui", "docs", { extra: "\n      nested: y" })}`,
    9,
    false,
  ],
  [
    "a tab-indented key line",
    `swiftRepos:\n${docsEntry.replace("    ref:", "\tref:")}`,
    4,
    undefined,
  ],
  [
    "a misaligned second entry",
    `swiftRepos:\n${docsEntry}${entry("swift-tui-charts", "docs-charts").replace("  - ", "   - ")}`,
    8,
    true,
  ],
  [
    "a key without a separator",
    `swiftRepos:\n${docsEntry.replace("outputPath: ", "outputPath:")}`,
    6,
    true,
  ],
  [
    "a second YAML document",
    `swiftRepos:\n${docsEntry}---\nswiftRepos:\n${entry("swift-tui-charts", "docs-second")}`,
    8,
    false,
  ],
  [
    "content after the document end marker",
    `swiftRepos:\n${docsEntry}...\n${entry("swift-tui-charts", "docs-after")}`,
    9,
    false,
  ],
])(
  "wave4 STUI-1280 manifest with %s is refused at its line before any rm",
  async (_shape, manifest, line, bunRejects) => {
    if (bunRejects !== undefined) {
      const parse = () => Bun.YAML.parse(manifest);
      if (bunRejects) expect(parse).toThrow();
      else expect(parse).not.toThrow();
    }
    const site = await makeSiteRoot();
    await plant(join(site.dist, "docs/old.txt"), "previous");
    const result = await buildManifest(site, manifest, [
      "swift-tui",
      "swift-tui-charts",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("invalid manifest");
    expect(result.stderr).toContain(`line ${line}:`);
    expect(await listing(site.dist)).toEqual(["docs", "docs/old.txt"]);
  },
);

test.each([
  [
    "a compact sequence at column 0",
    `swiftRepos:\n${docsEntry.replace(/^ {2}/gm, "")}`,
    ["docs"],
    "swift-tui archive args=[]",
  ],
  [
    "a directive, a document marker, comments, blank lines and CRLF",
    `%YAML 1.2\n---\n# DocC inputs\nswiftRepos: # one entry\n\n  # the framework\n\t# a tab-led comment\n  \t # a space, tab and space before the comment\n${docsEntry}`.replace(
      /\n/g,
      "\r\n",
    ),
    ["docs"],
    "swift-tui archive args=[]",
  ],
  [
    "a bare dash and a dash comment",
    `swiftRepos:\n${docsEntry.replace("  - ", "  -\n    ")}${entry("swift-tui-charts", "docs-charts").replace("  - ", "  - # charts\n    ")}`,
    ["docs", "docs-charts"],
    "swift-tui archive args=[]",
  ],
  [
    "an indented root",
    `  swiftRepos:\n${docsEntry.replace(/^/gm, "  ")}`,
    ["docs"],
    "swift-tui archive args=[]",
  ],
  [
    "a document end marker and a closing comment",
    `swiftRepos:\n${docsEntry}...\n# end of the DocC inputs\n`,
    ["docs"],
    "swift-tui archive args=[]",
  ],
  [
    "spaced and tab separators, an unknown key and a duplicate key",
    "swiftRepos:\n  - name : swift-tui\n    repository: SwiftTUI/swift-tui\n    ref: fixture\n    doccCommand:\t./make-docs.sh --flag\n    outputPath: .build-docs\n    note: kept\n    mountPath: elsewhere\n    mountPath: docs\n",
    ["docs"],
    "swift-tui archive args=[--flag]",
  ],
])(
  "wave4 STUI-1280 manifest with %s still builds as Bun.YAML reads it",
  async (_shape, manifest, mounts, docsIndex) => {
    const yaml = Bun.YAML.parse(manifest) as {
      swiftRepos: { mountPath: string }[];
    };
    expect(yaml.swiftRepos.map((repo) => repo.mountPath)).toEqual(mounts);
    const site = await makeSiteRoot();
    const result = await buildManifest(site, manifest, [
      "swift-tui",
      "swift-tui-charts",
    ]);
    expect(result.exitCode, result.stderr).toBe(0);
    expect((await readText(join(site.dist, "docs/index.html"))).trim()).toBe(
      docsIndex,
    );
    for (const mount of mounts.slice(1))
      expect(await readText(join(site.dist, mount, "index.html"))).toContain(
        "swift-tui-charts archive",
      );
  },
);

// Adjacent repair with STUI-1280 (not campaign yield): since aba2410 a backtick
// in the manifest reader's heredoc, inside a command substitution, stopped
// bash 3.2 (macOS's /bin/bash) from parsing build_docc_site.sh at all.

test("wave4 every site shell script parses under /bin/bash (bash 3.2 on macOS)", async () => {
  const scripts = (await readdir(join(siteCheckout, "Scripts")))
    .filter((name) => name.endsWith(".sh"))
    .sort();
  expect(scripts).toContain("build_docc_site.sh");
  const failures = scripts.flatMap((script) => {
    const result = Bun.spawnSync({
      cmd: ["/bin/bash", "-n", join(siteCheckout, "Scripts", script)],
      stdout: "pipe",
      stderr: "pipe",
    });
    return result.exitCode === 0
      ? []
      : [`${script}: ${new TextDecoder().decode(result.stderr).trim()}`];
  });
  expect(failures).toEqual([]);
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

function resolved(name: string, tokens = tokenForms): string {
  try {
    return resolveToken(name, tokens.light, tokens.shared);
  } catch (error) {
    return `throws ${error instanceof Error ? error.message : String(error)}`;
  }
}

test("w3cb026 a declared token whose own substitution fails takes the outer fallback", () => {
  // STUI-1281, fixed in wave 4 (Chromium 149 computes the same values).
  expect([resolved("--outer"), resolved("--cyc")]).toEqual([
    "#123456",
    "#654321",
  ]);
});

test("w3cb027 var() function-name case and comma-bearing or empty fallbacks resolve as CSS", () => {
  expect([
    resolved("--upper"),
    resolved("--commas"),
    resolved("--empty"),
  ]).toEqual(["#000000", "rgb(1, 2, 3)", ""]);
});

// Wave 4 repair scenarios: ids w4s30-w4s33. Each expected value is Chrome
// 155's computed value for the same declarations (the wave-4 site evidence's
// css-oracle-probe.log): a var() takes its fallback whenever its referent has
// the guaranteed-invalid value.

const wave4Tokens = parseTokens(`
      :root, [data-theme="light"] {
        --a: #000000;
        --unknown: var(--missing);
        --outer: var(--unknown, #123456);
        --p: var(--q);
        --q: var(--p);
        --p2: var(--q2, #0000ff);
        --q2: var(--p2);
        --r2: var(--p2, #111111);
        --x3: var(--y3, #990000);
        --y3: var(--x3, #009900);
        --useX3: var(--x3, #999999);
        --k: initial;
        --useK: var(--k, #222222);
        --inh: inherit;
        --useInh: var(--inh, #333333);
        --uns: unset;
        --useUns: var(--uns, #444444);
        --rev: revert;
        --useRev: var(--rev, #454545);
        --revl: revert-layer;
        --useRevl: var(--revl, #464646);
        --kupper: INITIAL;
        --useKupper: var(--kupper, #474747);
        --chain: var(--unknown);
        --useChain: var(--chain, #555555);
        --both: var(--unknown, var(--missing));
        --useBoth: var(--both, #666666);
        --mid: var(--a) var(--unknown);
        --useMid: var(--mid, #777777);
        --deep: var(--outer, #abcdef);
        --fallbackRef: var(--missing, var(--unknown, #fedcba));
        --inner: var(--unknown, var(--p, #010101));
        --self: var(--a, var(--self));
        --emptyDecl: ;
        --useEmpty: var(--emptyDecl, #888888);
        --kw2: initial #000;
        --useKw2: var(--kw2, #020202);
      }${tail}`);

test.each([
  ["--r2", "#111111"],
  ["--useX3", "#999999"],
  ["--useK", "#222222"],
  ["--useInh", "#333333"],
  ["--useUns", "#444444"],
  ["--useRev", "#454545"],
  ["--useRevl", "#464646"],
  ["--useKupper", "#474747"],
  ["--useChain", "#555555"],
  ["--useBoth", "#666666"],
  ["--useMid", "#777777"],
  ["--deep", "#123456"],
  ["--fallbackRef", "#fedcba"],
  ["--inner", "#010101"],
  ["--self", "#000000"],
  ["--useEmpty", ""],
  ["--useKw2", "initial #000"],
])(
  "wave4 STUI-1281 token %s resolves to %p as Chrome computes it",
  (name, expected) => {
    expect(resolved(name, wave4Tokens)).toBe(expected);
  },
);

test.each([
  ["--p2", "token alias cycle at --p2"],
  ["--x3", "token alias cycle at --x3"],
  ["--k", "token --k is the CSS-wide keyword initial"],
  ["--unknown", "unknown token --missing"],
])("wave4 STUI-1281 top-level token %s still throws %p", (name, message) => {
  expect(resolved(name, wave4Tokens)).toBe(`throws ${message}`);
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
