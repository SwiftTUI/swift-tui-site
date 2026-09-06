import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { dataProjects, deploymentOrigin, writeDataRedirects } from "./compose-cloudflare";

const siteRoot = resolve(import.meta.dir, "../..");
const artifact = join(siteRoot, "_cf-pages-artifact");
const revision = process.env.CF_COMMIT_SHA;
if (!revision || !/^[a-f0-9]{40}$/.test(revision)) throw new Error("CF_COMMIT_SHA must be a full commit SHA");
const urls = {} as Record<keyof typeof dataProjects, string>;

for (const key of ["views", "other"] as const) {
  const project = dataProjects[key];
  const output = join(artifact, `${key}-deployment.jsonl`);
  await rm(output, { force: true });
  const upload = Bun.spawn([
    "bunx", "wrangler@4.129.0", "pages", "deploy", join(artifact, key),
    `--project-name=${project}`, "--branch=main", `--commit-hash=${revision}`, "--commit-dirty=true",
  ], {
    cwd: siteRoot,
    env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: output },
    stdout: "inherit", stderr: "inherit",
  });
  if (await upload.exited !== 0) throw new Error(`Deployment failed for ${project}`);
  const records = (await readFile(output, "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const deployment = records.find(record => record.type === "pages-deploy" && record.pages_project === project);
  if (!deployment) throw new Error(`Wrangler did not report a deployment for ${project}`);
  const origin = deploymentOrigin(deployment.url, project);
  // Check availability and CORS before the main site can reference this data.
  let verified = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const response = await fetch(`${origin}/_publication.json`, { signal: AbortSignal.timeout(10_000) });
      if (response.ok && response.headers.get("access-control-allow-origin") === "*") {
        const publication = await response.json() as { revision?: string; project?: string };
        if (publication.revision === revision && publication.project === project) {
          verified = true;
          break;
        }
      }
    } catch { /* A new deployment may not have propagated yet. */ }
    await Bun.sleep(2_000);
  }
  if (!verified) throw new Error(`Public data/CORS verification failed for ${project}`);
  urls[key] = origin;
  console.log(`[deploy-docc-data] verified ${project}: ${origin}`);
}

await writeDataRedirects(artifact, urls);
console.log("[deploy-docc-data] main site now references both verified immutable data deployments");
