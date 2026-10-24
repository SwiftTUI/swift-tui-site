// D1 adversarial corpus, docc-theme.ts (d1s014-d1s015): CSS grammar edges in
// the token parser and the var() resolver.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { d1KnownIssue } from "./d1-known-issue";
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
  d1KnownIssue(
    "d1s014",
    "STUI-1204: a block's last declaration without ';' is dropped by parseTokens (docc-theme.ts:37 requires a trailing semicolon); contract: CSS Syntax Level 3 §5.4.4; adjacent none",
    () => {
      expect(resolveToken("--b", tokens.light, tokens.shared)).toBe("#000000");
    },
  );
});

test("d1s015 var() with a fallback is left unresolved and reaches theme-settings verbatim", async () => {
  // CSS Custom Properties §3: var(--x, <fallback>) resolves to --x or the fallback.
  const synthetic = parseTokens(`
      :root, [data-theme="light"] {
        --a: #000000;
        --b: var(--missing, #123456);
      }${tail}`);
  expect(synthetic.light.get("--b")).toBe("var(--missing, #123456)");
  d1KnownIssue(
    "d1s015",
    "STUI-1205: resolveToken resolves only the one-argument var() form (docc-theme.ts:73), so a fallback is emitted verbatim into theme-settings.json; contract: CSS Custom Properties §3, docc-theme.test.ts:44-49 (hex literals); adjacent none",
    () => {
      expect(resolveToken("--b", synthetic.light, synthetic.shared)).toBe(
        "#123456",
      );
    },
  );
  // The same mechanism through themeSettings on the real token file with one
  // alias rewritten: the drift test's hex-literal invariant is what breaks.
  const real = parseTokens(await readFile(tokensPath, "utf8"));
  real.light.set("--text-accent", "var(--missing, #123456)");
  const settings = themeSettings(real) as {
    theme: { color: Record<string, { light: string; dark: string }> };
  };
  d1KnownIssue(
    "d1s015",
    "STUI-1205: themeSettings emits the unresolved var() string for a fallback token (docc-theme.ts:73, 208-215); contract: docc-theme.test.ts:44-49 hex literals; adjacent none",
    () => {
      expect(settings.theme.color.link.light).toMatch(
        /^#[0-9a-f]{6}([0-9a-f]{2})?$/,
      );
    },
  );
});
