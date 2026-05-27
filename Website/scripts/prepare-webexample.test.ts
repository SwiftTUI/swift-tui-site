import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const websiteRoot = resolve(import.meta.dir, "..");
const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("overlay WebExample inputs install without a frozen lockfile", async () => {
  const { examplesRoot, logPath, env } = await makeFixture();

  const result = runPrepareWebExample({
    env: {
      ...env,
      SWIFTTUI_EXAMPLES_CHECKOUT: examplesRoot,
    },
  });

  expect(result.exitCode).toBe(0);
  const log = await readFile(logPath, "utf8");
  expect(log).toContain(`cwd=${examplesRoot}`);
  expect(log).toContain("args=install");
  expect(log).not.toContain("--frozen-lockfile");
});

test("plain WebExample overrides keep frozen lockfile installs", async () => {
  const { examplesRoot, logPath, env } = await makeFixture();

  const result = runPrepareWebExample({ env });

  expect(result.exitCode).toBe(0);
  const log = await readFile(logPath, "utf8");
  expect(log).toContain(`cwd=${examplesRoot}`);
  expect(log).toContain("args=install --frozen-lockfile");
});

async function makeFixture(): Promise<{
  examplesRoot: string;
  logPath: string;
  env: Record<string, string>;
}> {
  const root = await realpath(await mkdtemp(join(tmpdir(), "prepare-webexample-")));
  tempRoots.push(root);

  const examplesRoot = join(root, "swift-tui-examples");
  const webExampleDir = join(examplesRoot, "WebExample");
  const fakeBin = join(root, "bin");
  const fakeBun = join(fakeBin, "bun");
  const logPath = join(root, "bun.log");

  await mkdir(webExampleDir, { recursive: true });
  await mkdir(fakeBin, { recursive: true });
  await writeFile(
    fakeBun,
    `#!/usr/bin/env bash
set -euo pipefail
{
  printf 'cwd=%s\\n' "$PWD"
  printf 'args=%s\\n' "$*"
} >> "$FAKE_BUN_LOG"
`,
  );
  await chmod(fakeBun, 0o755);

  const env = {
    PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
    FAKE_BUN_LOG: logPath,
    WEBEXAMPLE_DIR: webExampleDir,
  };

  return { examplesRoot, logPath, env };
}

function runPrepareWebExample(options: { env: Record<string, string> }): Bun.SyncSubprocess<"pipe", "pipe"> {
  return Bun.spawnSync({
    cmd: [process.execPath, "run", "scripts/prepare-webexample.ts"],
    cwd: websiteRoot,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
  });
}
