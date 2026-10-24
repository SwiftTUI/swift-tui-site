// D1 adversarial corpus, prepare-webexample.ts (d1s001-d1s004).
// Each case copies the script into a temporary site root so the manifest it
// reads (`<root>/docs/releases.yml`) is the fixture's, and replaces `git` and
// `bun` with logging stubs, as prepare-webexample.test.ts does.
import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { d1KnownIssue } from "./d1-known-issue";

const websiteRoot = resolve(import.meta.dir, "..");
const scriptSource = join(websiteRoot, "scripts/prepare-webexample.ts");
const publicRepository =
  "https://github.com/SwiftTUI/swift-tui-counter-demo.git";
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  );
});

interface Fixture {
  siteRoot: string;
  checkoutRoot: string;
  logPath: string;
  run(env: Record<string, string>): {
    exitCode: number | null;
    stderr: string;
    log: () => Promise<string>;
  };
}

async function fixture(releasesYaml: string | Uint8Array): Promise<Fixture> {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "d1-prepare-webexample-")),
  );
  tempRoots.push(root);
  const siteRoot = join(root, "site");
  const scriptsDir = join(siteRoot, "Website/scripts");
  const binDir = join(root, "bin");
  const logPath = join(root, "commands.log");
  const checkoutRoot = join(
    siteRoot,
    ".build/public-inputs/swift-tui-counter-demo",
  );
  await mkdir(scriptsDir, { recursive: true });
  await mkdir(join(siteRoot, "docs"), { recursive: true });
  await mkdir(binDir, { recursive: true });
  await copyFile(scriptSource, join(scriptsDir, "prepare-webexample.ts"));
  await writeFile(join(siteRoot, "docs/releases.yml"), releasesYaml);

  // `git -C <root> rev-parse --show-toplevel` answers with D1_FAKE_TOPLEVEL
  // when set (the existing-checkout branch), else fails like a non-repository.
  // `git clone` creates the WebExample directory the script expects.
  await writeFile(
    join(binDir, "git"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'git %s\\n' "$*" >> "$FAKE_COMMAND_LOG"
if [[ "$*" == *"rev-parse --show-toplevel"* ]]; then
  if [[ -n "\${D1_FAKE_TOPLEVEL:-}" ]]; then printf '%s\\n' "$D1_FAKE_TOPLEVEL"; exit 0; fi
  exit 128
fi
if [[ "$*" == *"remote get-url origin"* ]]; then
  printf '%s\\n' "\${D1_FAKE_ORIGIN:-${publicRepository}}"; exit 0
fi
if [[ "$1" == "clone" ]]; then mkdir -p "$7/WebExample"; fi
exit 0
`,
  );
  await writeFile(
    join(binDir, "bun"),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'bun cwd=%s args=%s\\n' "$PWD" "$*" >> "$FAKE_COMMAND_LOG"
`,
  );
  await chmod(join(binDir, "git"), 0o755);
  await chmod(join(binDir, "bun"), 0o755);

  return {
    siteRoot,
    checkoutRoot,
    logPath,
    run(env) {
      const result = Bun.spawnSync({
        cmd: [
          process.execPath,
          "run",
          join(scriptsDir, "prepare-webexample.ts"),
        ],
        cwd: siteRoot,
        env: {
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          FAKE_COMMAND_LOG: logPath,
          ...env,
        },
        stdout: "pipe",
        stderr: "pipe",
      });
      return {
        exitCode: result.exitCode,
        stderr: new TextDecoder().decode(result.stderr),
        log: async () => readFile(logPath, "utf8").catch(() => ""),
      };
    },
  };
}

test("d1s001 an option-shaped SWIFTTUI_COUNTER_DEMO_REF reaches git unvalidated", async () => {
  const f = await fixture("current:\n  counterDemoRef: 0.19.0\n");
  // An existing public checkout, so the script takes the fetch/checkout path
  // (prepare-webexample.ts:42-46) instead of a fresh clone.
  await mkdir(join(f.checkoutRoot, "WebExample"), { recursive: true });
  const hostile = "--upload-pack=/tmp/d1-evil";
  const result = f.run({
    D1_FAKE_TOPLEVEL: f.checkoutRoot,
    SWIFTTUI_COUNTER_DEMO_REF: hostile,
  });
  const log = await result.log();
  // Contract: a ref override is validated before any git call, as
  // Scripts/build_docc_site.sh:28-32 validates DOCC_SOURCE_REF.
  d1KnownIssue(
    "d1s001",
    "STUI-1195: SWIFTTUI_COUNTER_DEMO_REF is passed to git fetch/checkout unvalidated (prepare-webexample.ts:12,43-44); the sibling build_docc_site.sh:28-32 rejects option-shaped refs; contract: cloudflare-pages.yml:20-23 ref override; adjacent none",
    () => {
      expect(result.exitCode).not.toBe(0);
      expect(log).not.toContain(hostile);
    },
  );
});

test("d1s002 a double-quoted counterDemoRef keeps its quotes", async () => {
  const f = await fixture('current:\n  counterDemoRef: "0.19.0"\n');
  const result = f.run({});
  const log = await result.log();
  expect(result.exitCode).toBe(0);
  // Contract: YAML 1.2 §7.3, a double-quoted scalar denotes its contents.
  d1KnownIssue(
    "d1s002",
    "STUI-1196: a quoted counterDemoRef is cloned with literal quotes (prepare-webexample.ts:29 captures \\S+); contract: YAML 1.2 §7.3, README.md:56; adjacent none",
    () => {
      expect(log).toContain(
        `git clone --depth 1 --branch 0.19.0 ${publicRepository}`,
      );
    },
  );
});

test("d1s003 a trailing YAML comment on the pin line makes the pin unreadable", async () => {
  const f = await fixture("current:\n  counterDemoRef: 0.19.0 # pin\n");
  const result = f.run({});
  const log = await result.log();
  // Contract: YAML 1.2 §6.6, a comment after a scalar is not part of it.
  d1KnownIssue(
    "d1s003",
    "STUI-1196: a trailing comment on counterDemoRef fails the manifest read (prepare-webexample.ts:29-32: \\s*$ cannot absorb '# pin'); contract: YAML 1.2 §6.6, README.md:56; adjacent none",
    () => {
      expect(result.exitCode).toBe(0);
      expect(log).toContain(
        `git clone --depth 1 --branch 0.19.0 ${publicRepository}`,
      );
    },
  );
});

test("d1s004 a CRLF manifest with a BOM is read correctly", async () => {
  const f = await fixture(
    new TextEncoder().encode("﻿current:\r\n  counterDemoRef: 0.19.0\r\n"),
  );
  const result = f.run({});
  const log = await result.log();
  expect(result.exitCode).toBe(0);
  expect(log).toContain(
    `git clone --depth 1 --branch 0.19.0 ${publicRepository}`,
  );
  expect(log).toContain(
    `bun cwd=${f.checkoutRoot} args=install --frozen-lockfile`,
  );
});
