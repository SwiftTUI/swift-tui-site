# Website

Astro site that frames the
[`swift-tui-counter-demo/WebExample`](https://github.com/SwiftTUI/swift-tui-counter-demo/tree/0.15.1/WebExample)
WASI demo in an iframe.
Deployed at <https://swifttui.sh>.

The site copy is the public marketing layer for the framework. Keep its state,
runtime, capability-negotiation, and terminal-safety claims consistent with the
repository documentation and DocC catalogs.

The deploy workflow (`.github/workflows/cloudflare-pages.yml`) composes a
complete local artifact:

```
/              <- this Astro site (Website/dist/)
/docs/         <- DocC archive
/webexample/   <- WebExample WASI demo
```

Publication splits this into the main website and two DocC data deployments,
with immutable data URLs behind the same public documentation routes. See the
[repository README](../README.md#cloudflare-deployment) for composition and
asset budgets.

The iframe loads `/webexample/` from the same origin. Thus, the COOP/COEP
headers in `public/_headers` also isolate the iframe.

## Local

```sh
bun install
bun run dev            # http://localhost:4321
bun run build:wasm     # release WebExample, q11 Brotli wasm
bun run build:wasm:dev # debug WebExample, q9 Brotli wasm
bun run build:docc     # combined DocC archive for linkable public products
bun run build:full     # release WebExample + DocC + Astro dist/
bun run build:dev      # debug WebExample + DocC + Astro dist/
```

By default, wasm scripts fetch the tagged public WebExample input recorded in
`../docs/releases.yml` into `../.build/public-inputs/`. Set `WEBEXAMPLE_DIR` to
the path of a WebExample checkout only for unpublished local inputs. Full
website builds generate DocC from the repositories in
`../docs/docc-repos.yml`. Then the builds copy the archive to
`Website/dist/docs/`.

The deployment workflow documents `main` through its `docs_ref` input, and local
documentation builds also default to `main`. Set `DOCC_SOURCE_REF` to a shared
tag to build that snapshot, or to an empty string to use the manifest refs.
The guides describe current behavior without a release
history; package installation examples remain concrete and reproducible.

## Design system

The site is styled from the SwiftTUI design system. `src/styles/tokens.css`
is the only file that names a colour, font, radius or spacing value; every
other stylesheet composes those custom properties, and both themes (light is
primary; `data-theme="dark"` on `<html>`) come from that one file.

- `src/styles/components.css` — the system's Button, Kbd, NewsBar,
  FeatureCard, Testimonial, GridFrame and Navigation rules.
- `src/styles/site.css` — the page skeleton (two column rails with a `┼`
  junction at every intersection), the type scale, code, and the legacy-name
  aliases the pipeline walkthrough still reads.
- `src/styles/docs.css` — the long-form pages (contents rail, numbered
  sections, callouts, side-by-side code).
- `src/styles/home.css` — the marketing sequence: a compact live counter,
  maintained app examples, three illustrated benefits, quick start, and hosts.
- `src/components/CodeSnippet.astro` and `src/styles/code-snippet.css` —
  syntax-highlighted code with copy controls, announced confirmation, and a
  text-selection fallback when clipboard access is unavailable. The full
  counter source is a native disclosure; mobile shows the live result first.
- `/compare/` — a responsive framework comparison with dated primary sources
  and explicit distinctions between built-in features and companion packages.
  Toolchain and package setup live at `/guides/#toolchain`.
- `src/layouts/Site.astro` — every public page: head, header, news bar,
  sections, footer. Sections are `Section.astro` so the nodes land on the
  rails; actions are `Button.astro`.
- `public/fonts/` — self-hosted IBM Plex Serif (headings), iA Writer Quattro S
  (text) and Geist Mono (code). The origin is cross-origin isolated, so nothing
  is fetched from a font CDN. Every family is SIL OFL 1.1, which requires the
  copyright notice and licence to travel with the files: each family's upstream
  licence text sits beside them as `LICENSE-*` and is served from `/fonts/`.
  Geist Mono (v1.7.2) and iA Writer Quattro S are the unmodified upstream
  webfonts; the Plex files are the Google Fonts latin subsets. Add the licence
  file with any new family, and keep a Reserved Font Name in mind before
  subsetting one (Plex and iA Writer declare one; Geist does not).

The DocC archives get the same system through `docs-theme/`: `bun run
docc-theme` generates `theme-settings.json` (Swift-DocC-Render's theme file,
resolved from the tokens) and `docs-theme.css` (the font faces plus
`overrides.css`), and `Scripts/apply_docc_theme.sh` copies both into every
mount during `build:docc`. `scripts/docc-theme.test.ts` fails when the
committed output is stale.
