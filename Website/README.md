# Website

Astro site that frames the
[`swift-tui-examples/Examples/WebExample`](https://github.com/SwiftTUI/swift-tui-examples/tree/main/Examples/WebExample)
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

By default, wasm scripts expect `swift-tui-site`, `swift-tui-examples`, and
`swift-tui-web` to be sibling checkouts. Set `WEBEXAMPLE_DIR` to point at a
different WebExample checkout. The full website builds generate DocC from the
repositories listed in `../docs/docc-repos.yml` and copy the archive into
`Website/dist/docs/`.
