import { mkdir, readFile, rm } from "node:fs/promises";
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
  await installExamplesDependencies(resolve(webExampleDir, ".."));
  console.log(`[prepare-webexample] using WEBEXAMPLE_DIR=${webExampleDir}`);
} else {
  await ensurePublicExamplesCheckout(defaultExamplesRoot, examplesRef);
  await installExamplesDependencies(defaultExamplesRoot);
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

  if (await isGitCheckout(checkoutRoot)) {
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

async function isGitCheckout(path: string): Promise<boolean> {
  const result = Bun.spawnSync({
    cmd: ["git", "-C", path, "rev-parse", "--git-dir"],
    stdout: "ignore",
    stderr: "ignore",
  });
  return result.exitCode === 0;
}

async function installExamplesDependencies(examplesRoot: string): Promise<void> {
  run(["bun", "install", "--frozen-lockfile"], { cwd: examplesRoot });
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
