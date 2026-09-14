# Website

Astro site that frames the
[`swift-tui-counter-demo/WebExample`](https://github.com/SwiftTUI/swift-tui-counter-demo/tree/0.13.3/WebExample)
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
