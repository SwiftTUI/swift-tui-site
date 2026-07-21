# SwiftTUI Website

Source for **[swifttui.sh](https://swifttui.sh)** — the public SwiftTUI site, the
combined DocC archive, and the in-browser WebExample demo, composed into one
deployable artifact. See it live: <https://swifttui.sh>

SwiftTUI is SwiftUI semantics, drawn in terminal cells — author your `App` once
and ship it across five hosts: terminal executable, static WASI bundle, localhost
WebHost, native SwiftUI surface, and native Android surface. This repo builds the
site that explains and demos that. For the org-wide build and pin model, see the
[org root](https://github.com/SwiftTUI/swift-tui-org).

The site is an Astro/Bun app in [`Website/`](Website). DocC composition and
release pins live in [`docs/`](docs)
([`docc-repos.yml`](docs/docc-repos.yml), [`releases.yml`](docs/releases.yml));
build and gate scripts live in [`Scripts/`](Scripts).

## Local development

Every command targets the Astro app via `--cwd Website`:

```bash
bun install --cwd Website --frozen-lockfile
bun run --cwd Website dev         # local dev server
bun run --cwd Website check       # astro check — types + diagnostics
bun run --cwd Website build       # site only — fast, no wasm
bun run --cwd Website build:full  # full artifact — wasm demo + site + DocC
```

`dev`, `check`, and `build` need only Bun. `build:full` (and `build:wasm`) also
build and compress the WebExample wasm, so they require Swift 6.3.x (via
`swiftly`) plus Binaryen and Brotli — without those, expect `build:full` to fail
at the wasm step.

The full composed artifact lays out as:

```text
/              Astro site
/docs/         combined DocC archive
/webexample/   WebExample WASI demo
```

## WebExample and DocC inputs

The `0.1.12` public beta build fetches the tagged `swift-tui-examples`
repo into `.build/public-inputs/` and uses the WebExample release-tarball
dependencies recorded there. To test unpublished changes, point the build at a
local WebExample checkout instead:

```bash
WEBEXAMPLE_DIR=/path/to/swift-tui-examples/WebExample \
  bun run --cwd Website build:wasm
```

DocC inputs are listed in [`docs/docc-repos.yml`](docs/docc-repos.yml); release
versions are pinned in [`docs/releases.yml`](docs/releases.yml). Both track the
current org release (`0.1.12`) in lockstep — bump them with the org release, not
by hand here.

## License

MIT — see [LICENSE](LICENSE). The composed DocC archive under `/docs/` is built
from the separately-tracked [`swift-tui`](https://github.com/SwiftTUI/swift-tui)
repository (also MIT).
