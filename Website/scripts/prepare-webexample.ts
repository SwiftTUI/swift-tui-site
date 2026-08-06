import { mkdir, readFile, realpath, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const websiteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = resolve(websiteRoot, "..");
const releasesPath = resolve(siteRoot, "docs/releases.yml");
const defaultCounterDemoRoot = resolve(siteRoot, ".build/public-inputs/swift-tui-counter-demo");
const counterDemoRepository = "https://github.com/SwiftTUI/swift-tui-counter-demo.git";

const webExampleOverride = process.env.WEBEXAMPLE_DIR;
const counterDemoRef = process.env.SWIFTTUI_COUNTER_DEMO_REF ?? await readCounterDemoRef();

if (webExampleOverride) {
  const webExampleDir = resolve(process.cwd(), webExampleOverride);
  const counterDemoRoot = resolve(webExampleDir, "..");
  await installWorkspaceDependencies(counterDemoRoot, {
    frozenLockfile: !usesCoordinationOverlay(counterDemoRoot),
  });
  console.log(`[prepare-webexample] using WEBEXAMPLE_DIR=${webExampleDir}`);
} else {
  await ensurePublicCounterDemoCheckout(defaultCounterDemoRoot, counterDemoRef);
  await installWorkspaceDependencies(defaultCounterDemoRoot, { frozenLockfile: true });
  console.log(`[prepare-webexample] prepared swift-tui-counter-demo ${counterDemoRef}`);
}

async function readCounterDemoRef(): Promise<string> {
  const releases = await readFile(releasesPath, "utf8");
  const match = releases.match(/^\s*counterDemoRef:\s*(\S+)\s*$/m);
  if (!match) {
    throw new Error(`missing current.counterDemoRef in ${releasesPath}`);
  }
  return match[1];
}

async function ensurePublicCounterDemoCheckout(
  checkoutRoot: string,
  ref: string
): Promise<void> {
  await mkdir(dirname(checkoutRoot), { recursive: true });

  if (await isExpectedCounterDemoCheckout(checkoutRoot)) {
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
    counterDemoRepository,
    checkoutRoot,
  ]);
}

async function isExpectedCounterDemoCheckout(path: string): Promise<boolean> {
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
  return normalizeGitRemote(origin) === normalizeGitRemote(counterDemoRepository);
}

function normalizeGitRemote(remote: string): string {
  return remote.replace(/\/+$/, "").replace(/\.git$/, "");
}

function usesCoordinationOverlay(counterDemoRoot: string): boolean {
  const overlayCounterDemoCheckout = process.env.SWIFTTUI_COUNTER_DEMO_CHECKOUT;
  if (!overlayCounterDemoCheckout) {
    return false;
  }

  return counterDemoRoot === resolve(process.cwd(), overlayCounterDemoCheckout);
}

async function installWorkspaceDependencies(
  counterDemoRoot: string,
  options: { frozenLockfile: boolean }
): Promise<void> {
  const command = ["bun", "install"];
  if (options.frozenLockfile) {
    command.push("--frozen-lockfile");
  }
  run(command, { cwd: counterDemoRoot });
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
