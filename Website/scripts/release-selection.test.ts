import { expect, test } from "bun:test";
import { frameworkVersionFromManifest } from "../src/lib/release-selection";

test("framework identity comes from the curated tuple, independently of other component versions", () => {
  expect(
    frameworkVersionFromManifest(`current:
  swiftTUI: "0.21.3" # deliberately older than the site
  charts: 0.22.1
  site: 0.24.0
`),
  ).toBe("0.21.3");
});

test("ambiguous, missing or non-release framework identities fail before rendering links", () => {
  for (const text of [
    "current: {}",
    "current:\n  swiftTUI: main",
    "current:\n  swiftTUI: 0.21",
    "current:\n  swiftTUI: 0.21.0\n  swiftTUI: 0.22.0",
    "current:\n  swiftTUI: 0.21.0/other",
  ]) {
    expect(() => frameworkVersionFromManifest(text)).toThrow();
  }
});
