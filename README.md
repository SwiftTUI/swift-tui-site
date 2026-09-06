# SwiftTUI Website

Source for **[swifttui.sh](https://swifttui.sh)**: the public SwiftTUI site, the
combined DocC archive, and the in-browser WebExample demo. See it live:
<https://swifttui.sh>

This repo builds the site that explains and demos
[SwiftTUI](https://github.com/SwiftTUI/swift-tui). For the org-wide build and
pin model, see the
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


## WebExample and DocC inputs

The `0.11.1` public beta build fetches the tagged `swift-tui-counter-demo`
repo into `.build/public-inputs/` and uses the WebExample release-tarball
dependencies recorded there. To test unpublished changes, point the build at a
local WebExample checkout instead:

```bash
WEBEXAMPLE_DIR=/path/to/swift-tui-counter-demo/WebExample \
  bun run --cwd Website build:wasm
```

[`docs/docc-repos.yml`](docs/docc-repos.yml) lists the DocC inputs.
[`docs/releases.yml`](docs/releases.yml) pins the release versions. Both files
track the current organization release (`0.11.1`) in lockstep. Update them only
as part of an organization release.

## Cloudflare deployment

The dispatch-only deployment workflow builds the complete site, then runs
`Website/scripts/compose-cloudflare.ts`. The generated `_cf-pages-artifact/`
contains three independent static deployments, each checked against the Free
plan's 20,000-file and 25 MiB single-file limits:

- `site/`: the website, both DocC application shells and search indexes, and
  the compressed browser demo, deployed to the existing `swift-tui` project.
- `views/`: SwiftTUIViews DocC JSON, deployed to `swift-tui-docc-views`.
- `other/`: the remaining framework and Charts DocC JSON, deployed to
  `swift-tui-docc-data`.

The two data projects are direct-upload Pages projects with production branch
`main`, in the same account as the site. The workflow uses its existing
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` secrets for all three.
`deploy-docc-data.ts` uploads and verifies both data deployments before writing
the main site's redirects. These redirects name immutable deployment URLs;
keep those deployments while a site release references them. Public page URLs
remain under `swifttui.sh/docs/`. Data responses allow cross-origin reads.
The ordinary local `Website/dist/` retains the entire self-contained archive.

Generated DocC shells load a scoped fetch adapter for these JSON paths. It
requests the data deployments directly because DocC interprets an HTTP data
redirect as a renamed page. Other requests retain the browser's normal fetch
behavior; redirected data requests omit credentials. The public JSON paths
also remain usable through HTTP redirects. The adapter filename includes its
content hash so custom-domain browser caching cannot retain another
deployment's data routes.

Wrangler is pinned to 4.129.0 for its structured deployment output. Each data
project exposes `_publication.json` so deployment verification can check the
exact source revision and CORS headers before publishing the main site.

## License

MIT. See [LICENSE](LICENSE). The build creates the DocC archive under `/docs/`
from the separate [`swift-tui`](https://github.com/SwiftTUI/swift-tui)
repository. That repository also uses the MIT license.
