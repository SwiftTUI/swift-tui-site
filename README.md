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
([`docc-repos.yml`](docs/docc-repos.yml), [`releases.yml`](docs/releases.yml)).
Build and gate scripts live in [`Scripts/`](Scripts).

## Local development

Every command targets the Astro app via `--cwd Website`:

```bash
bun install --cwd Website --frozen-lockfile
bun run --cwd Website dev         # local dev server
bun run --cwd Website check       # astro check — types + diagnostics
bun run --cwd Website build       # site only — fast, no wasm
bun run --cwd Website build:full  # full artifact — wasm demo + site + DocC
```

`dev`, `check`, and `build` need only Bun. `build:full` and `build:wasm` also
compile and compress the WebExample wasm. These commands require Swift 6.3.x
through `swiftly`, Binaryen, and Brotli. If a tool is absent, `build:full` stops
at the wasm step.

The full artifact has this layout:

```text
/              Astro site
/docs/         combined DocC archive
/webexample/   WebExample WASI demo
```

The Astro site also serves `/domrenderer`. This demo page mounts the same
WebExample wasm through the `@swifttui/web` DOM surface renderer. With `renderer:
"dom"`, cells are absolutely positioned text elements instead of
canvas pixels. The page reuses the `/webexample` artifact, so it adds no second
wasm build. The page runtime comes from the `@swifttui/web` release tarball in
`Website/package.json`.

## WebExample and DocC inputs

The `0.4.7` public beta build fetches the tagged `swift-tui-examples`
repo into `.build/public-inputs/` and uses the WebExample release-tarball
dependencies recorded there. To test unpublished changes, point the build at a
local WebExample checkout instead:

```bash
WEBEXAMPLE_DIR=/path/to/swift-tui-examples/WebExample \
  bun run --cwd Website build:wasm
```

[`docs/docc-repos.yml`](docs/docc-repos.yml) lists the DocC inputs.
[`docs/releases.yml`](docs/releases.yml) pins the release versions. Both files
track the current organization release (`0.4.7`) in lockstep. Update them only
as part of an organization release.

## License

MIT — see [LICENSE](LICENSE). The build creates the DocC archive under `/docs/`
from the separate [`swift-tui`](https://github.com/SwiftTUI/swift-tui)
repository. That repository also uses the MIT license.
