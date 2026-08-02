# AGENTS.md

Guidance for agentic assistants working in **`swift-tui-site`**. Keep this
concise. This repo builds the public SwiftTUI website and composes the DocC
documentation.

## Layout

| Path | Role |
| --- | --- |
| [`Website/`](Website) | The **Astro** app (`swift-tui-website`) — most site work happens here |
| `docs/` | DocC composition files: `docc-repos.yml`, `releases.yml` |
| `Scripts/` | Gates + build: `build_docc_site.sh`, `check_site.sh` |

The Astro build compiles and compresses the WebExample wasm for the live browser
demo. Public builds fetch tagged example and web artifacts by default. Use
`WEBEXAMPLE_DIR` only for unpublished local inputs.

## Toolchains

- Use **Bun** for the Astro app and scripts. Run commands with `--cwd Website`.
- Use **`swiftly`** Swift 6.3.x for the WASI build that `build:wasm` starts.
- Use **Binaryen/Brotli** for wasm compression.

## Commands

```bash
bun install --cwd Website --frozen-lockfile
bun run --cwd Website check       # astro check (type/diagnostics)
bun run --cwd Website dev         # local dev server
bun run --cwd Website build       # astro build (site only)
bun run --cwd Website build:full  # wasm demo + site + DocC
Scripts/build_docc_site.sh        # compose DocC (also via Website build:docc)
```

`//:swift_tui_site_native_gate` in the org root runs: install (frozen) +
`check` + `build` + `build_docc_site.sh`.

## Conventions

`AGENTS.md` is the real file. `CLAUDE.md` is a symlink to it. Edit `AGENTS.md`.
Keep the site compatible with the Astro/Bun workflow. This compatibility is an
organization requirement.
