import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pageDark, pageLight } from "../src/lib/theme";
import {
  parseTokens,
  render,
  resolveToken,
  themeDir,
  themeSettings,
  tokensPath,
} from "./docc-theme";

describe("docc-theme", () => {
  test("resolves token aliases through var() chains", () => {
    const tokens = parseTokens(`
      :root, [data-theme="light"] {
        --color-black: #000000; /* a comment */
        --text-high-contrast: var(--color-black);
        --link: var(--text-high-contrast);
      }
      [data-theme="dark"] {
        --color-black: #ffffff;
        --text-high-contrast: var(--color-black);
        --link: var(--text-high-contrast);
      }
      :root {
        --font-writer: "iA Writer Quattro S", monospace;
        --font-mono: "Geist Mono", monospace;
      }
    `);
    expect(resolveToken("--link", tokens.light, tokens.shared)).toBe("#000000");
    expect(resolveToken("--link", tokens.dark, tokens.shared)).toBe("#ffffff");
    expect(() => resolveToken("--missing", tokens.light)).toThrow(
      "unknown token",
    );
  });

  test("every mapped DocC colour resolves to a literal in both schemes", async () => {
    const tokens = parseTokens(await readFile(tokensPath, "utf8"));
    const settings = themeSettings(tokens) as {
      theme: { color: Record<string, { light: string; dark: string }> };
    };
    for (const [property, value] of Object.entries(settings.theme.color)) {
      for (const scheme of ["light", "dark"] as const) {
        expect(value[scheme], `${property}.${scheme}`).toMatch(
          /^#[0-9a-f]{6}([0-9a-f]{2})?$/,
        );
      }
    }
    expect(settings.theme.color.fill.light).toBe(pageLight);
    expect(settings.theme.color.fill.dark).toBe(pageDark);
  });

  test("the committed theme files match the generator (run `bun run docc-theme`)", async () => {
    const { settings, stylesheet } = await render();
    expect(
      await readFile(resolve(themeDir, "theme-settings.json"), "utf8"),
    ).toBe(settings);
    expect(await readFile(resolve(themeDir, "docs-theme.css"), "utf8")).toBe(
      stylesheet,
    );
  });
});
