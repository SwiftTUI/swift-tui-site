# SwiftTUI Website

Source for <https://swifttui.sh>, the public SwiftTUI website, combined DocC
archive, and browser WebExample deployment.

The site is an Astro/Bun project in [`Website/`](Website). The repository also
contains release metadata under [`docs/`](docs) and scripts for composing DocC
and validating the deploy artifact.

## Local Development

```bash
bun install --cwd Website --frozen-lockfile
bun run --cwd Website dev
bun run --cwd Website check
bun run --cwd Website build
```

The full composed site includes:

```text
/              Astro site
/docs/         combined DocC archive
/webexample/   WebExample WASI demo
```

Build the full composed artifact with:

```bash
bun run --cwd Website build:full
```

## WebExample And Docs Inputs

The `0.0.6` public pre-release build fetches the tagged
`swift-tui-examples` repo into `.build/public-inputs/` and uses the WebExample
release-tarball dependencies recorded there. You can still point the build at a
specific local WebExample checkout when testing unpublished changes:

```bash
WEBEXAMPLE_DIR=/path/to/swift-tui-examples/WebExample \
  bun run --cwd Website build:wasm
```

DocC inputs are listed in [`docs/docc-repos.yml`](docs/docc-repos.yml). Release
metadata lives in [`docs/releases.yml`](docs/releases.yml).
