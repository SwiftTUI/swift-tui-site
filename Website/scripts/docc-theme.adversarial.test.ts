// D1 adversarial corpus, docc-theme.ts (d1s014-d1s015): CSS grammar edges in
// the token parser and the var() resolver.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import {
  parseTokens,
  resolveToken,
  themeSettings,
  tokensPath,
} from "./docc-theme";

const tail = `
      [data-theme="dark"] {
        --a: #ffffff;
        --b: var(--a);
      }
      :root {
        --font-writer: "iA Writer Quattro S", monospace;
        --font-mono: "Geist Mono", monospace;
      }
`;

test("d1s014 the last declaration of a token block is dropped when it omits the semicolon", () => {
  // CSS Syntax Level 3 §5.4.4: the final declaration's semicolon is optional.
  const tokens = parseTokens(`
      :root, [data-theme="light"] {
        --a: #000000;
        --b: var(--a)
      }${tail}`);
  // Precondition: the block was found and its first declaration parsed.
  expect(tokens.light.get("--a")).toBe("#000000");
  // STUI-1204, fixed in wave 3.
  expect(resolveToken("--b", tokens.light, tokens.shared)).toBe("#000000");
});

test("d1s015 var() with a fallback is left unresolved and reaches theme-settings verbatim", async () => {
  // CSS Custom Properties §3: var(--x, <fallback>) resolves to --x or the fallback.
  const synthetic = parseTokens(`
      :root, [data-theme="light"] {
        --a: #000000;
        --b: var(--missing, #123456);
      }${tail}`);
  expect(synthetic.light.get("--b")).toBe("var(--missing, #123456)");
  // STUI-1205, fixed in wave 3.
  expect(resolveToken("--b", synthetic.light, synthetic.shared)).toBe(
    "#123456",
  );
  // The same mechanism through themeSettings on the real token file with one
  // alias rewritten: the drift test's hex-literal invariant is what breaks.
  const real = parseTokens(await readFile(tokensPath, "utf8"));
  real.light.set("--text-accent", "var(--missing, #123456)");
  const settings = themeSettings(real) as {
    theme: { color: Record<string, { light: string; dark: string }> };
  };
  expect(settings.theme.color.link.light).toMatch(
    /^#[0-9a-f]{6}([0-9a-f]{2})?$/,
  );
});

// Wave 3 repair scenarios (swift-tui-org campaign two, STUI-1166): ids
// w3r37-w3r39 of the wave-3 site repair-hypotheses.json.

const forms = parseTokens(`
      :root, [data-theme="light"] {
        --a: #000000;
        --defined: var(--a, #123456);
        --nested: var(--missing, var(--a));
        --padded: var( --a );
        --repeated: var(--a) var(--a);
        --unknown: var(--missing);
        --p: var(--q);
        --q: var(--p);
      }${tail}`);

// CSS Custom Properties §3 (fallback), §2.3 (only a reference loop is a
// cycle, so a name used twice in one value resolves twice).
test.each([
  ["--defined", "#000000"],
  ["--nested", "#000000"],
  ["--padded", "#000000"],
  ["--repeated", "#000000 #000000"],
])("wave3 STUI-1205 var() form %s resolves to %s", (name, expected) => {
  expect(resolveToken(name, forms.light, forms.shared)).toBe(expected);
});

test.each([
  ["--unknown", "unknown token --missing"],
  ["--p", "token alias cycle"],
])("wave3 STUI-1205 %s still fails with %s", (name, message) => {
  expect(() => resolveToken(name, forms.light, forms.shared)).toThrow(message);
});
