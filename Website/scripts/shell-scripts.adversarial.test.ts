// D1 adversarial corpus, Scripts/build_docc_site.sh, Scripts/apply_docc_theme.sh
// and minify-webexample-wasm.ts (d1s005-d1s011, d1s016, d1s017). Every case
// runs against a temporary site root assembled the way
// Scripts/build_docc_site_test.sh assembles one; nothing touches the checkout.
import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  copyFile,
  lstat,
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

interface SiteRoot {
  root: string;
  siteRoot: string;
  dist: string;
  buildScript: string;
  themeScript: string;
  /** A local checkout stub whose doccCommand writes `text` into .build-docs/index.html. */
  checkoutStub(name: string, text: string): Promise<string>;
}

async function makeSiteRoot(): Promise<SiteRoot> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "d1-site-scripts-")),
  );
  tempRoots.push(root);
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
    async checkoutStub(name, text) {
      const dir = join(root, "checkouts", name);
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "make-docs.sh"),
        `#!/usr/bin/env bash
set -euo pipefail
mkdir -p .build-docs/documentation/fixture
printf '%s\\n' '${text}' > .build-docs/index.html
printf '<html><head><title>x</title></head><body>shell</body></html>\\n' > .build-docs/documentation/fixture/index.html
`,
      );
      await chmod(join(dir, "make-docs.sh"), 0o755);
      return dir;
    },
  };
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
  // A caller-set DOCC_EXEC skips the toolchain docc probe (build_docc_site.sh:60);
  // the fixture doccCommand never runs docc.
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

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Isolated local remotes behind url.insteadOf, as build_docc_site_test.sh:110-138 builds them. */
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
  // The three local-checkout variables are cleared so the clone path runs.
  return {
    GIT_CONFIG_GLOBAL: gitConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    SWIFTTUI_CHECKOUT: undefined,
    SWIFTTUI_CHARTS_CHECKOUT: undefined,
    SWIFTTUI_TERMINAL_VIEW_CHECKOUT: undefined,
  };
}

test("d1s005 a mountPath that climbs out of Website/dist deletes and writes outside it", async () => {
  // Contract: build_docc_site.sh:4-5, archives land "into Website/dist at its
  // own mountPath"; README.md:36-40 layout.
  const site = await makeSiteRoot();
  const checkout = await site.checkoutStub("swift-tui", "escaped archive");
  await writeFile(
    join(site.siteRoot, "docs/docc-repos.yml"),
    `swiftRepos:\n${entry("swift-tui", "../escaped")}`,
  );
  const sentinel = join(site.siteRoot, "Website/escaped/keep.txt");
  await mkdir(join(site.siteRoot, "Website/escaped"), { recursive: true });
  await writeFile(sentinel, "must survive");
  const result = runBash(
    site.buildScript,
    [],
    { SWIFTTUI_CHECKOUT: checkout },
    site.siteRoot,
  );
  const sentinelSurvived = await exists(sentinel);
  const escapedIndex = await exists(
    join(site.siteRoot, "Website/escaped/index.html"),
  );
  // STUI-1197, fixed in wave 3.
  expect(result.exitCode).not.toBe(0);
  expect(sentinelSurvived).toBe(true);
  expect(escapedIndex).toBe(false);
});

test("d1s006 a double-quoted ref in docc-repos.yml is fetched with its quotes", async () => {
  // Contract: YAML 1.2 §7.3; README.md:62-68 (DOCC_SOURCE_REF= uses the
  // manifest refs).
  const site = await makeSiteRoot();
  const env = await makeRemotes(site, ["fixture"]);
  await writeFile(
    join(site.siteRoot, "docs/docc-repos.yml"),
    `swiftRepos:\n${entry("swift-tui", "docs", { ref: '"fixture"' })}`,
  );
  const result = runBash(
    site.buildScript,
    [],
    { ...env, DOCC_SOURCE_REF: "" },
    site.siteRoot,
  );
  const index = await readFile(
    join(site.dist, "docs/index.html"),
    "utf8",
  ).catch(() => "");
  // STUI-1198, fixed in wave 3.
  expect(result.exitCode).toBe(0);
  expect(index).toContain("tagged swift-tui");
});

test("d1s016 DOCC_SOURCE_REF rejects a tag carrying SemVer build metadata", async () => {
  // Contract: README.md:66-67 (a shared tag), git-check-ref-format(1) permits
  // '+', and prepare-webexample.test.ts:59 treats 1.2.3+site.1 as a legal ref.
  const site = await makeSiteRoot();
  const env = await makeRemotes(site, ["fixture", "0.14.0+site.1"]);
  await writeFile(
    join(site.siteRoot, "docs/docc-repos.yml"),
    `swiftRepos:\n${entry("swift-tui", "docs")}`,
  );
  const result = runBash(
    site.buildScript,
    [],
    { ...env, DOCC_SOURCE_REF: "0.14.0+site.1" },
    site.siteRoot,
  );
  const index = await readFile(
    join(site.dist, "docs/index.html"),
    "utf8",
  ).catch(() => "");
  // STUI-1206, fixed in wave 3.
  expect(result.exitCode).toBe(0);
  expect(index).toContain("tagged swift-tui");
});

test("d1s007 two entries with the same mountPath silently keep only the last archive", async () => {
  // Contract: build_docc_site_test.sh:87-89, composition preserves every archive.
  const site = await makeSiteRoot();
  const first = await site.checkoutStub("swift-tui", "first archive");
  const second = await site.checkoutStub("swift-tui-charts", "second archive");
  await writeFile(
    join(site.siteRoot, "docs/docc-repos.yml"),
    `swiftRepos:\n${entry("swift-tui", "docs")}${entry("swift-tui-charts", "docs")}`,
  );
  const result = runBash(
    site.buildScript,
    [],
    { SWIFTTUI_CHECKOUT: first, SWIFTTUI_CHARTS_CHECKOUT: second },
    site.siteRoot,
  );
  const index = await readFile(
    join(site.dist, "docs/index.html"),
    "utf8",
  ).catch(() => "");
  // STUI-1199, fixed in wave 3. Either refused, or both archives survive
  // (the first is not clobbered).
  if (result.exitCode === 0) expect(index).toContain("first archive");
});

test("d1s008 an empty swiftRepos list and a missing required key are refused", async () => {
  const site = await makeSiteRoot();
  await writeFile(join(site.siteRoot, "docs/docc-repos.yml"), "swiftRepos:\n");
  const empty = runBash(site.buildScript, [], {}, site.siteRoot);
  expect(empty.exitCode).toBe(1);
  expect(empty.stderr).toContain("no swiftRepos entries found");
  await writeFile(
    join(site.siteRoot, "docs/docc-repos.yml"),
    `swiftRepos:\n  - name: swift-tui\n    repository: SwiftTUI/swift-tui\n    ref: fixture\n    doccCommand: ./make-docs.sh\n    outputPath: .build-docs\n`,
  );
  const partial = runBash(site.buildScript, [], {}, site.siteRoot);
  expect(partial.exitCode).toBe(1);
  expect(partial.stderr).toContain(
    "invalid swiftRepos entry (missing mountPath)",
  );
});

async function mountWithShell(site: SiteRoot, html: string): Promise<string> {
  const mount = join(site.dist, "docs");
  await mkdir(join(mount, "documentation/fixture"), { recursive: true });
  await writeFile(join(mount, "documentation/fixture/index.html"), html);
  return mount;
}

const shell = "<html><head><title>x</title></head><body>shell</body></html>\n";

test("d1s009 a root mount path produces a protocol-relative stylesheet URL", async () => {
  // Contract: apply_docc_theme.sh:11-13 ("absolute (/<mount_path>/docs-theme.css)");
  // RFC 3986 §4.2 ("//…" is a network-path reference).
  const site = await makeSiteRoot();
  const mount = await mountWithShell(site, shell);
  const result = runBash(site.themeScript, [mount, "/"], {}, site.siteRoot);
  expect(result.exitCode).toBe(0);
  const linked = await readFile(
    join(mount, "documentation/fixture/index.html"),
    "utf8",
  );
  const href = linked.match(/href="([^"]*docs-theme\.css)"/)?.[1];
  // STUI-1200, fixed in wave 3.
  expect(href).toBe("/docs-theme.css");
});

test("d1s010 a symlinked shell is rewritten through the link outside the mount", async () => {
  // Contract: apply_docc_theme.sh:8-11, the script modifies shells under the mount.
  const site = await makeSiteRoot();
  const mount = join(site.dist, "docs");
  await mkdir(join(mount, "documentation/fixture"), { recursive: true });
  const outside = join(site.siteRoot, "outside/shell.html");
  await mkdir(join(site.siteRoot, "outside"), { recursive: true });
  await writeFile(outside, shell);
  await symlink(
    "../../../../../outside/shell.html",
    join(mount, "documentation/fixture/index.html"),
  );
  // Precondition: the link resolves to the outside file.
  expect(
    await readFile(join(mount, "documentation/fixture/index.html"), "utf8"),
  ).toBe(shell);
  const result = runBash(site.themeScript, [mount, "docs"], {}, site.siteRoot);
  expect(result.exitCode).toBe(0);
  const after = await readFile(outside, "utf8");
  // STUI-1201, fixed in wave 3.
  expect(after).toBe(shell);
});

test("d1s011 a shell whose body mentions docs-theme.css is never linked", async () => {
  // Contract: apply_docc_theme.sh:9-11 ("every DocC shell under the mount").
  const site = await makeSiteRoot();
  const mount = await mountWithShell(
    site,
    "<html><head><title>x</title></head><body><p>see docs-theme.css</p></body></html>\n",
  );
  const result = runBash(site.themeScript, [mount, "docs"], {}, site.siteRoot);
  expect(result.exitCode).toBe(0);
  const linked = await readFile(
    join(mount, "documentation/fixture/index.html"),
    "utf8",
  );
  const links =
    linked.match(/<link rel="stylesheet" href="\/docs\/docs-theme\.css">/g) ??
    [];
  // STUI-1202, fixed in wave 3.
  expect(links).toHaveLength(1);
  expect(result.stdout).toContain("1 shell(s) linked");
});

test("d1s017 an empty or HTML app.wasm is refused by the compressor", async () => {
  // Contract: minify-webexample-wasm.ts:116-134 (a Brotli-compressed, browser-
  // compilable wasm is the only accepted shape); README.md:29-32.
  for (const body of ["<!doctype html><title>404 Not Found</title>", ""]) {
    const root = await realpath(await mkdtemp(join(tmpdir(), "d1-minify-")));
    tempRoots.push(root);
    const webExample = join(root, "WebExample");
    const assets = join(webExample, "pages-dist/TerminalApp/dist/assets");
    await mkdir(assets, { recursive: true });
    await writeFile(join(assets, "app.wasm"), body);
    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        "run",
        join(websiteRoot, "scripts/minify-webexample-wasm.ts"),
      ],
      cwd: websiteRoot,
      env: { ...process.env, WEBEXAMPLE_DIR: webExample },
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = new TextDecoder().decode(result.stderr);
    expect(result.exitCode).not.toBe(0);
    expect(stderr).toContain("does not decompress");
    // The input is left in place, not replaced.
    expect(await readFile(join(assets, "app.wasm"), "utf8")).toBe(body);
  }
});

// Wave 3 repair scenarios (swift-tui-org campaign two, STUI-1166): ids
// w3r12-w3r30 and w3r42-w3r44 of the wave-3 site repair-hypotheses.json.

/** Writes `text` to `path`, creating its parent directories. */
async function plant(path: string, text: string): Promise<string> {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
  return path;
}

/** One local-checkout entry per name, in order, with the given mounts. */
async function buildWithMounts(
  site: SiteRoot,
  mounts: [name: "swift-tui" | "swift-tui-charts", mountPath: string][],
): Promise<RunResult> {
  const env: Record<string, string> = {};
  for (const [name] of mounts)
    env[
      name === "swift-tui" ? "SWIFTTUI_CHECKOUT" : "SWIFTTUI_CHARTS_CHECKOUT"
    ] = await site.checkoutStub(name, `${name} archive`);
  await writeFile(
    join(site.siteRoot, "docs/docc-repos.yml"),
    `swiftRepos:\n${mounts.map(([name, mount]) => entry(name, mount)).join("")}`,
  );
  return runBash(site.buildScript, [], env, site.siteRoot);
}

test.each(["docs/../../escaped", "/"])(
  "wave3 STUI-1197 mountPath %p is refused before any rm",
  async (mount) => {
    const site = await makeSiteRoot();
    const kept = [
      await plant(join(site.dist, "docs/old.txt"), "previous"),
      await plant(join(site.dist, "astro.txt"), "astro page"),
      await plant(join(site.siteRoot, "Website/escaped/keep.txt"), "sentinel"),
      await plant(join(site.siteRoot, ".build-docs-work/marker"), "work tree"),
    ];
    const result = await buildWithMounts(site, [
      ["swift-tui", "docs"],
      ["swift-tui-charts", mount],
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("mountPath");
    for (const path of kept) expect(await exists(path), path).toBe(true);
  },
);

test("wave3 STUI-1197 a mountPath under a symlinked directory that leaves Website/dist is refused", async () => {
  const site = await makeSiteRoot();
  const keep = await plant(
    join(site.siteRoot, "outside/docs/keep.txt"),
    "must survive",
  );
  await symlink("../../outside", join(site.dist, "linked"));
  const result = await buildWithMounts(site, [["swift-tui", "linked/docs"]]);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("outside");
  expect(await exists(keep)).toBe(true);
});

test("wave3 STUI-1197 a slash-wrapped mountPath still composes inside Website/dist", async () => {
  const site = await makeSiteRoot();
  const result = await buildWithMounts(site, [["swift-tui", "/docs/"]]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(await readFile(join(site.dist, "docs/index.html"), "utf8")).toContain(
    "swift-tui archive",
  );
  expect(
    await readFile(
      join(site.dist, "docs/documentation/fixture/index.html"),
      "utf8",
    ),
  ).toContain('<link rel="stylesheet" href="/docs/docs-theme.css"></head>');
});

test.each(["'fixture' # pinned", "fixture # pinned"])(
  "wave3 STUI-1198 manifest ref %p is read as the YAML scalar fixture",
  async (ref) => {
    const site = await makeSiteRoot();
    const env = await makeRemotes(site, ["fixture"]);
    await writeFile(
      join(site.siteRoot, "docs/docc-repos.yml"),
      `swiftRepos:\n${entry("swift-tui", "docs", { ref })}`,
    );
    const result = runBash(
      site.buildScript,
      [],
      { ...env, DOCC_SOURCE_REF: "" },
      site.siteRoot,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(
      await readFile(join(site.dist, "docs/index.html"), "utf8"),
    ).toContain("tagged swift-tui");
  },
);

test("wave3 STUI-1198 quotes inside a plain scalar are content, not quoting", async () => {
  const site = await makeSiteRoot();
  const checkout = await site.checkoutStub("swift-tui", "plain command");
  await writeFile(
    join(site.siteRoot, "docs/docc-repos.yml"),
    `swiftRepos:\n${entry("swift-tui", "docs", { doccCommand: 'sh -c "./make-docs.sh"' })}`,
  );
  const result = runBash(
    site.buildScript,
    [],
    { SWIFTTUI_CHECKOUT: checkout },
    site.siteRoot,
  );
  expect(result.exitCode, result.stderr).toBe(0);
  expect(await readFile(join(site.dist, "docs/index.html"), "utf8")).toContain(
    "plain command",
  );
});

test.each([
  ['"--upload-pack=/tmp/d1-evil"', "must be a branch, tag, or commit ID"],
  ["[fixture]", "invalid manifest"],
  ['"fixture', "invalid manifest"],
  ['"fixture" extra', "invalid manifest"],
])(
  "wave3 STUI-1198 manifest ref %p is refused before any rm",
  async (ref, message) => {
    const site = await makeSiteRoot();
    const env = await makeRemotes(site, ["fixture"]);
    const previous = await plant(join(site.dist, "docs/old.txt"), "previous");
    await writeFile(
      join(site.siteRoot, "docs/docc-repos.yml"),
      `swiftRepos:\n${entry("swift-tui", "docs", { ref })}`,
    );
    const result = runBash(
      site.buildScript,
      [],
      { ...env, DOCC_SOURCE_REF: "" },
      site.siteRoot,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(message);
    expect(await exists(previous)).toBe(true);
  },
);

test.each([
  ["docs", "docs"],
  ["docs", "/docs/"],
  ["docs/charts", "docs"],
])(
  "wave3 STUI-1199 mounts %p then %p are refused before any rm",
  async (first, second) => {
    const site = await makeSiteRoot();
    const previous = await plant(join(site.dist, "docs/old.txt"), "previous");
    const result = await buildWithMounts(site, [
      ["swift-tui", first],
      ["swift-tui-charts", second],
    ]);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("mountPath");
    expect(await exists(previous)).toBe(true);
  },
);

test("wave3 STUI-1199 sibling mounts that share a string prefix both compose", async () => {
  const site = await makeSiteRoot();
  const result = await buildWithMounts(site, [
    ["swift-tui", "docs"],
    ["swift-tui-charts", "docs-old"],
  ]);
  expect(result.exitCode, result.stderr).toBe(0);
  expect(await readFile(join(site.dist, "docs/index.html"), "utf8")).toContain(
    "swift-tui archive",
  );
  expect(
    await readFile(join(site.dist, "docs-old/index.html"), "utf8"),
  ).toContain("swift-tui-charts archive");
});

test.each(["docs", "docs/", "/docs"])(
  "wave3 STUI-1200 mount path %p links /docs/docs-theme.css",
  async (mountPath) => {
    const site = await makeSiteRoot();
    const mount = await mountWithShell(site, shell);
    const result = runBash(
      site.themeScript,
      [mount, mountPath],
      {},
      site.siteRoot,
    );
    expect(result.exitCode).toBe(0);
    const linked = await readFile(
      join(mount, "documentation/fixture/index.html"),
      "utf8",
    );
    expect(linked.match(/href="([^"]*docs-theme\.css)"/)?.[1]).toBe(
      "/docs/docs-theme.css",
    );
  },
);

test("wave3 STUI-1201 the theme copy replaces a symlinked destination and regular shells are still linked", async () => {
  const site = await makeSiteRoot();
  const mount = await mountWithShell(site, shell);
  const outside = await plant(
    join(site.siteRoot, "outside/target.css"),
    "outside original",
  );
  await symlink("../../../outside/target.css", join(mount, "docs-theme.css"));
  // Precondition: the destination link resolves to the outside file.
  expect(await readFile(join(mount, "docs-theme.css"), "utf8")).toBe(
    "outside original",
  );
  const result = runBash(site.themeScript, [mount, "docs"], {}, site.siteRoot);
  expect(result.exitCode).toBe(0);
  expect(await readFile(outside, "utf8")).toBe("outside original");
  expect((await lstat(join(mount, "docs-theme.css"))).isSymbolicLink()).toBe(
    false,
  );
  expect(await readFile(join(mount, "docs-theme.css"), "utf8")).toBe(
    "/* fixture theme */\n",
  );
  const linked = await readFile(
    join(mount, "documentation/fixture/index.html"),
    "utf8",
  );
  expect(linked.match(/docs-theme\.css/g)).toHaveLength(1);
});

test("wave3 STUI-1202 a second theme run changes nothing and headless shells stay skipped", async () => {
  const site = await makeSiteRoot();
  const mount = await mountWithShell(site, shell);
  const headless = "<html><body>no head</body></html>\n";
  const headlessPath = await plant(
    join(mount, "documentation/headless/index.html"),
    headless,
  );
  const first = runBash(site.themeScript, [mount, "docs"], {}, site.siteRoot);
  expect(first.exitCode).toBe(0);
  expect(first.stdout).toContain("1 shell(s) linked, 1 without <head> skipped");
  const once = await readFile(
    join(mount, "documentation/fixture/index.html"),
    "utf8",
  );
  const second = runBash(site.themeScript, [mount, "docs"], {}, site.siteRoot);
  expect(second.exitCode).toBe(0);
  expect(second.stdout).toContain(
    "0 shell(s) linked, 1 without <head> skipped",
  );
  expect(
    await readFile(join(mount, "documentation/fixture/index.html"), "utf8"),
  ).toBe(once);
  expect(once.match(/docs-theme\.css/g)).toHaveLength(1);
  expect(await readFile(headlessPath, "utf8")).toBe(headless);
});

test.each(["-x+y", "+main", "--help", "main;echo"])(
  "wave3 STUI-1206 DOCC_SOURCE_REF %p is still refused before any rm",
  async (ref) => {
    const site = await makeSiteRoot();
    const checkout = await site.checkoutStub("swift-tui", "local archive");
    const previous = await plant(join(site.dist, "docs/old.txt"), "previous");
    await writeFile(
      join(site.siteRoot, "docs/docc-repos.yml"),
      `swiftRepos:\n${entry("swift-tui", "docs")}`,
    );
    const result = runBash(
      site.buildScript,
      [],
      { SWIFTTUI_CHECKOUT: checkout, DOCC_SOURCE_REF: ref },
      site.siteRoot,
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "DOCC_SOURCE_REF must be a branch, tag, or commit ID",
    );
    expect(await exists(previous)).toBe(true);
  },
);

test.each(["relative", "absolute"])(
  "wave3 S4 check_site.sh and the Bun scripts agree on a %s WEBEXAMPLE_DIR",
  async (kind) => {
    // check_site.sh with every external tool stubbed: the stub bun records the
    // WEBEXAMPLE_DIR each build step sees; the gate's own wasm checks must look
    // at the same directory. The gate runs from an unrelated directory.
    const root = await realpath(
      await mkdtemp(join(tmpdir(), "d1-check-site-")),
    );
    tempRoots.push(root);
    const siteRoot = join(root, "site");
    const bin = join(root, "bin");
    const log = join(root, "bun.log");
    await mkdir(join(siteRoot, "Scripts"), { recursive: true });
    await copyFile(
      join(siteCheckout, "Scripts/check_site.sh"),
      join(siteRoot, "Scripts/check_site.sh"),
    );
    const executables = [
      await plant(
        join(bin, "bun"),
        '#!/usr/bin/env bash\nprintf \'%s\\n\' "$WEBEXAMPLE_DIR" >> "$D1_BUN_LOG"\n',
      ),
    ];
    for (const stub of ["check_site_ci_workflow.sh", "build_docc_site.sh"])
      executables.push(
        await plant(join(siteRoot, "Scripts", stub), "#!/usr/bin/env bash\n"),
      );
    for (const tool of ["brotli", "swiftly", "wasm-opt"])
      executables.push(await plant(join(bin, tool), "#!/usr/bin/env bash\n"));
    for (const path of executables) await chmod(path, 0o755);
    const demo = join(siteRoot, "demo/WebExample");
    await plant(join(demo, "pages-dist/TerminalApp/dist/assets/app.wasm"), "w");
    await plant(
      join(
        siteRoot,
        "Website/dist/webexample/TerminalApp/dist/assets/app.wasm",
      ),
      "w",
    );
    const result = runBash(
      join(siteRoot, "Scripts/check_site.sh"),
      [],
      {
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        D1_BUN_LOG: log,
        WEBEXAMPLE_DIR: kind === "relative" ? "../demo/WebExample" : demo,
      },
      root,
    );
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stdout).toContain("[check_site] ok");
    const seen = (await readFile(log, "utf8")).trim().split("\n");
    expect(seen.length).toBeGreaterThan(0);
    for (const dir of seen) {
      expect(dir.startsWith("/"), dir).toBe(true);
      expect(resolve(dir)).toBe(demo);
    }
  },
);
