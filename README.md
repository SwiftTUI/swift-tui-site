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

Pre-public status: the default build still expects source checkouts for
WebExample and web packages while the public releases are being prepared. You
can point the build at a specific WebExample checkout with:

```bash
WEBEXAMPLE_DIR=/path/to/swift-tui-examples/WebExample \
  bun run --cwd Website build:wasm
```

DocC inputs are listed in [`docs/docc-repos.yml`](docs/docc-repos.yml). Release
metadata lives in [`docs/releases.yml`](docs/releases.yml).

Remaining public-release work: replace untagged examples/web inputs with public
release tags or artifacts so a fresh site clone can build without sibling
checkouts by default.
