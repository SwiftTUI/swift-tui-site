// Generates the site-owned DocC theme from the design-system tokens.
//
// Swift-DocC-Render reads `theme-settings.json` beside its shell and maps
// `theme.color.*` onto its own `--color-*` custom properties, one value per
// scheme. `src/styles/tokens.css` is the only file that names a colour, so
// this script resolves the token aliases and writes:
//
//   Website/docs-theme/theme-settings.json  (colours + the two font stacks)
//   Website/docs-theme/docs-theme.css       (the @font-face rules from
//                                            tokens.css + docs-theme/overrides.css)
//
// Scripts/apply_docc_theme.sh copies both into every DocC mount. Run
// `bun run docc-theme` after editing tokens or the overrides; the drift test
// fails when the committed output is stale.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const websiteRoot = resolve(import.meta.dir, "..");
export const tokensPath = resolve(websiteRoot, "src/styles/tokens.css");
export const themeDir = resolve(websiteRoot, "docs-theme");

export type TokenTable = Map<string, string>;

export interface ParsedTokens {
  light: TokenTable;
  dark: TokenTable;
  shared: TokenTable;
  fontFaces: string[];
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function declarations(block: string): TokenTable {
  const table: TokenTable = new Map();
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    table.set(match[1], match[2].trim());
  }
  return table;
}

function blockFor(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`tokens.css has no "${selector}" block`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

export function parseTokens(css: string): ParsedTokens {
  const bare = stripComments(css);
  const fontFaces = [...bare.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) =>
    m[0].trim(),
  );
  return {
    light: declarations(blockFor(bare, ':root, [data-theme="light"]')),
    dark: declarations(blockFor(bare, '[data-theme="dark"]')),
    shared: declarations(blockFor(bare, ":root")),
    fontFaces,
  };
}

export function resolveToken(name: string, ...tables: TokenTable[]): string {
  const seen = new Set<string>();
  const lookup = (token: string): string => {
    if (seen.has(token)) throw new Error(`token alias cycle at ${token}`);
    seen.add(token);
    const value = tables
      .map((table) => table.get(token))
      .find((entry) => entry !== undefined);
    if (value === undefined) throw new Error(`unknown token ${token}`);
    return value.replace(/var\((--[a-z0-9-]+)\)/gi, (_match, inner: string) =>
      lookup(inner),
    );
  };
  return lookup(name);
}

// DocC colour property → design-system token. Semantic asides (warning,
// deprecated, important) keep DocC's own colours: they carry meaning the
// one-hue rule does not cover.
const colorMap: Record<string, string> = {
  fill: "--page",
  "fill-secondary": "--surface",
  "fill-tertiary": "--nav-background",
  "fill-quaternary": "--btn-ghost-hover",
  text: "--text-strong",
  "text-background": "--page",
  "figure-gray": "--text-high-contrast",
  "figure-gray-secondary": "--text-body",
  "figure-gray-secondary-alt": "--text-body",
  "figure-gray-tertiary": "--text-muted",
  "figure-blue": "--text-accent",
  "figure-green": "--text-accent",
  "fill-blue": "--color-accent",
  "standard-blue": "--text-accent",
  link: "--text-accent",
  "header-text": "--text-high-contrast",
  grid: "--border-default",
  eyebrow: "--text-accent",
  "hero-eyebrow": "--text-accent",
  "secondary-label": "--text-muted",
  "svg-icon": "--icon",
  "focus-color": "--focus-ring",
  "focus-border-color": "--focus-ring",
  "nav-background": "--nav-background",
  "nav-solid-background": "--nav-background",
  "nav-expanded": "--nav-background",
  "nav-stuck": "--nav-background",
  "nav-uiblur-expanded": "--nav-background",
  "nav-uiblur-stuck": "--nav-background",
  "nav-keyline": "--border-default",
  "nav-rule": "--border-default",
  "nav-outlines": "--border-default",
  "nav-sticking-expanded-keyline": "--border-default",
  "nav-hierarchy-item-borders": "--border-default",
  "nav-hierarchy-collapse-borders": "--border-default",
  "nav-hierarchy-collapse-background": "--surface",
  "nav-color": "--text-high-contrast",
  "nav-link-color": "--text-body",
  "nav-link-color-hover": "--text-high-contrast",
  "nav-current-link": "--text-high-contrast",
  "nav-root-subhead": "--text-muted",
  "nav-root-title": "--text-high-contrast",
  "navigator-item-hover": "--btn-ghost-hover",
  "button-background": "--color-accent",
  "button-background-hover": "--btn-primary-hover",
  "button-background-active": "--btn-primary-hover",
  "button-text": "--text-on-accent",
  "button-border": "--color-accent",
  "call-to-action-background": "--surface",
  "documentation-intro-fill": "--surface",
  "documentation-intro-title": "--text-high-contrast",
  "documentation-intro-eyebrow": "--text-accent",
  "documentation-intro-accent": "--color-accent",
  "documentation-intro-figure": "--text-body",
  "article-background": "--page",
  "article-body-background": "--page",
  "card-background": "--surface",
  "card-content-text": "--text-body",
  "card-eyebrow": "--text-accent",
  "card-shadow": "--border-card",
  "link-block-card-border": "--border-card",
  "overviewcard-border": "--border-card",
  "overviewcard-fill": "--surface",
  "overviewcard-fill-secondary": "--page",
  "tabnav-item-border-color": "--border-default",
  "dropdown-background": "--surface",
  "dropdown-border": "--border-default",
  "dropdown-text": "--text-strong",
  "dropdown-option-text": "--text-body",
  "loading-placeholder-background": "--btn-ghost-hover",
  "generic-modal-background": "--surface",
  "code-background": "--surface",
  "code-plain": "--text-strong",
  "code-line-highlight": "--news-bar-tint",
  "code-line-highlight-border": "--color-accent",
  "code-collapsible-background": "--btn-ghost-hover",
  "code-collapsible-text": "--text-muted",
  "inline-code-background": "--btn-ghost-hover",
  "aside-note": "--text-high-contrast",
  "aside-note-background": "--surface-card",
  "aside-note-border": "--color-accent",
  "aside-tip": "--text-high-contrast",
  "aside-tip-background": "--surface-card",
  "aside-tip-border": "--color-accent",
  "aside-experiment": "--text-high-contrast",
  "aside-experiment-background": "--surface-card",
  "aside-experiment-border": "--color-accent",
  "badge-default": "--text-accent",
  "badge-beta": "--text-accent",
  "changes-added": "--text-accent",
  "changes-added-hover": "--text-accent",
  "changes-modified": "--text-strong",
  "changes-modified-hover": "--text-strong",
  "syntax-plain-text": "--text-strong",
  "syntax-keywords": "--text-high-contrast",
  "syntax-type-declarations": "--text-accent",
  "syntax-other-type-names": "--text-accent",
  "syntax-project-type-names": "--text-accent",
  "syntax-other-class-names": "--text-accent",
  "syntax-project-class-names": "--text-accent",
  "syntax-strings": "--text-strong",
  "syntax-characters": "--text-strong",
  "syntax-numbers": "--text-muted",
  "syntax-comments": "--text-muted",
  "syntax-documentation-markup": "--text-muted",
  "syntax-documentation-markup-keywords": "--text-muted",
  "syntax-attributes": "--text-muted",
  "syntax-param-internal-name": "--text-muted",
  "syntax-other-declarations": "--text-high-contrast",
  "syntax-other-function-and-method-names": "--text-strong",
  "syntax-project-function-and-method-names": "--text-strong",
  "syntax-other-instance-variables-and-globals": "--text-strong",
  "syntax-project-instance-variables-and-globals": "--text-strong",
  "syntax-other-constants": "--text-strong",
  "syntax-project-constants": "--text-strong",
  "syntax-other-preprocessor-macros": "--text-muted",
  "syntax-project-preprocessor-macros": "--text-muted",
  "syntax-preprocessor-statements": "--text-muted",
  "syntax-heading": "--text-high-contrast",
  "syntax-marks": "--text-muted",
  "syntax-urls": "--text-accent",
  "syntax-highlighted": "--news-bar-tint",
};

export function themeSettings(tokens: ParsedTokens): Record<string, unknown> {
  const color: Record<string, { light: string; dark: string }> = {};
  for (const [property, token] of Object.entries(colorMap)) {
    color[property] = {
      light: resolveToken(token, tokens.light, tokens.shared),
      dark: resolveToken(token, tokens.dark, tokens.shared),
    };
  }
  return {
    theme: {
      typography: {
        "html-font": resolveToken("--font-writer", tokens.shared),
        "html-font-mono": resolveToken("--font-mono", tokens.shared),
      },
      color,
    },
    features: {
      docs: {
        quickNavigation: { enable: true },
      },
    },
  };
}

export function themeStylesheet(
  tokens: ParsedTokens,
  overrides: string,
): string {
  return [
    "/* Generated by Website/scripts/docc-theme.ts from src/styles/tokens.css and",
    "   docs-theme/overrides.css. Do not edit; run `bun run docc-theme`. */",
    ...tokens.fontFaces,
    "",
    overrides.trim(),
    "",
  ].join("\n");
}

export async function render(): Promise<{
  settings: string;
  stylesheet: string;
}> {
  const tokens = parseTokens(await readFile(tokensPath, "utf8"));
  const overrides = await readFile(resolve(themeDir, "overrides.css"), "utf8");
  return {
    settings: `${JSON.stringify(themeSettings(tokens), null, 2)}\n`,
    stylesheet: themeStylesheet(tokens, overrides),
  };
}

if (import.meta.main) {
  const { settings, stylesheet } = await render();
  await writeFile(resolve(themeDir, "theme-settings.json"), settings);
  await writeFile(resolve(themeDir, "docs-theme.css"), stylesheet);
  console.log(
    `[docc-theme] wrote ${themeDir}/theme-settings.json and docs-theme.css`,
  );
}
