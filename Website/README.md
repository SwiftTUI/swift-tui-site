# Website

Astro site that frames the
[`swift-tui-examples/WebExample`](https://github.com/SwiftTUI/swift-tui-examples/tree/0.3.2/WebExample)
WASI demo in an iframe.
Deployed at <https://swifttui.sh>.

The site copy is the public marketing layer for the framework. Keep state,
runtime, capability negotiation, and terminal-presentation safety claims
aligned with the repo docs and DocC catalogs.

The deploy workflow (`.github/workflows/cloudflare-pages.yml`) composes a
single Cloudflare Pages artifact:

```
/              <- this Astro site (Website/dist/)
/docs/         <- DocC archive
/webexample/   <- WebExample WASI demo
```

The iframe loads `/webexample/`, which is same-origin, so cross-origin
isolation propagates from the COOP/COEP headers in `public/_headers`.

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
point at a specific WebExample checkout only when testing unpublished local
inputs. The full website builds generate DocC from the repositories listed in
`../docs/docc-repos.yml` and copy the archive into `Website/dist/docs/`.
