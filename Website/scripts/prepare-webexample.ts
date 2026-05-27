import { mkdir, readFile, realpath, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = resolve(websiteRoot, "..");
const releasesPath = resolve(siteRoot, "docs/releases.yml");
const defaultExamplesRoot = resolve(siteRoot, ".build/public-inputs/swift-tui-examples");
const examplesRepository = "https://github.com/SwiftTUI/swift-tui-examples.git";

const webExampleOverride = process.env.WEBEXAMPLE_DIR;
const examplesRef = process.env.SWIFTTUI_EXAMPLES_REF ?? await readExamplesRef();

if (webExampleOverride) {
  const webExampleDir = resolve(process.cwd(), webExampleOverride);
  const examplesRoot = resolve(webExampleDir, "..");
  await installExamplesDependencies(examplesRoot, {
    frozenLockfile: !usesCoordinationOverlay(examplesRoot),
  });
  console.log(`[prepare-webexample] using WEBEXAMPLE_DIR=${webExampleDir}`);
} else {
  await ensurePublicExamplesCheckout(defaultExamplesRoot, examplesRef);
  await installExamplesDependencies(defaultExamplesRoot, { frozenLockfile: true });
  console.log(`[prepare-webexample] prepared swift-tui-examples ${examplesRef}`);
}

async function readExamplesRef(): Promise<string> {
  const releases = await readFile(releasesPath, "utf8");
  const match = releases.match(/^\s*examplesRef:\s*(\S+)\s*$/m);
  if (!match) {
    throw new Error(`missing current.examplesRef in ${releasesPath}`);
  }
  return match[1];
}

async function ensurePublicExamplesCheckout(
  checkoutRoot: string,
  ref: string
): Promise<void> {
  await mkdir(dirname(checkoutRoot), { recursive: true });

  if (await isExpectedExamplesCheckout(checkoutRoot)) {
    run(["git", "-C", checkoutRoot, "fetch", "--tags", "--force", "origin", ref]);
    run(["git", "-C", checkoutRoot, "checkout", "--force", ref]);
    run(["git", "-C", checkoutRoot, "clean", "-fdx"]);
    return;
  }

  await rm(checkoutRoot, { recursive: true, force: true });
  run([
    "git",
    "clone",
    "--depth",
    "1",
    "--branch",
    ref,
    examplesRepository,
    checkoutRoot,
  ]);
}

async function isExpectedExamplesCheckout(path: string): Promise<boolean> {
  const topLevelResult = Bun.spawnSync({
    cmd: ["git", "-C", path, "rev-parse", "--show-toplevel"],
    stdout: "pipe",
    stderr: "ignore",
  });
  if (topLevelResult.exitCode !== 0) {
    return false;
  }

  const topLevel = new TextDecoder().decode(topLevelResult.stdout).trim();
  const [resolvedTopLevel, resolvedPath] = await Promise.all([
    realpath(topLevel).catch(() => topLevel),
    realpath(path).catch(() => path),
  ]);
  if (resolvedTopLevel !== resolvedPath) {
    return false;
  }

  const originResult = Bun.spawnSync({
    cmd: ["git", "-C", path, "remote", "get-url", "origin"],
    stdout: "pipe",
    stderr: "ignore",
  });
  if (originResult.exitCode !== 0) {
    return false;
  }

  const origin = new TextDecoder().decode(originResult.stdout).trim();
  return normalizeGitRemote(origin) === normalizeGitRemote(examplesRepository);
}

function normalizeGitRemote(remote: string): string {
  return remote.replace(/\/+$/, "").replace(/\.git$/, "");
}

function usesCoordinationOverlay(examplesRoot: string): boolean {
  const overlayExamplesCheckout = process.env.SWIFTTUI_EXAMPLES_CHECKOUT;
  if (!overlayExamplesCheckout) {
    return false;
  }

  return examplesRoot === resolve(process.cwd(), overlayExamplesCheckout);
}

async function installExamplesDependencies(
  examplesRoot: string,
  options: { frozenLockfile: boolean }
): Promise<void> {
  const command = ["bun", "install"];
  if (options.frozenLockfile) {
    command.push("--frozen-lockfile");
  }
  run(command, { cwd: examplesRoot });
}

function run(
  cmd: string[],
  options: { cwd?: string } = {}
): void {
  const result = Bun.spawnSync({
    cmd,
    cwd: options.cwd,
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    throw new Error(`command failed (${result.exitCode}): ${cmd.join(" ")}`);
  }
}
