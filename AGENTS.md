# AGENTS.md

Guidance for agentic assistants working in **`swift-tui-site`**. Keep this
concise. This repo builds the public SwiftTUI website and composes the DocC
documentation.

## Layout

| Path | Role |
| --- | --- |
| [`Website/`](Website) | The **Astro** app (`swift-tui-website`) — most site work happens here |
| `docs/` | DocC composition config: `docc-repos.yml`, `releases.yml` |
| `Scripts/` | Gates + build: `build_docc_site.sh`, `check_site.sh` |

The Astro build embeds the live browser demo by building and compressing
WebExample wasm. Public builds fetch tagged examples/web artifacts by default.
Use `WEBEXAMPLE_DIR` only as an explicit local override for unpublished inputs.

## Toolchains

- **Bun** for the Astro app and scripts (run commands `--cwd Website`).
- **`swiftly`** Swift 6.3.x for the WASI build that `build:wasm` triggers.
- **Binaryen/Brotli** for wasm compression.

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

`AGENTS.md` is the real file; `CLAUDE.md` is a symlink to it. Edit `AGENTS.md`.
Keep the site buildable with the Astro/Bun workflow — it's a hard org invariant.
