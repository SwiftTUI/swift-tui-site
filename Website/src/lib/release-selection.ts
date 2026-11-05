import { parse } from "yaml";

export function frameworkVersionFromManifest(text: string): string {
  const manifest = parse(text, { uniqueKeys: true });
  const version: unknown = manifest?.current?.swiftTUI;
  if (
    typeof version !== "string" ||
    !/^0\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
  ) {
    throw new Error(
      "docs/releases.yml must select a stable pre-1.0 current.swiftTUI version",
    );
  }
  return version;
}
