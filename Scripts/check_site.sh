#!/usr/bin/env bash
set -euo pipefail

site_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
webexample_dir="${WEBEXAMPLE_DIR:-${site_root}/.build/public-inputs/swift-tui-counter-demo/WebExample}"
website_dir="${site_root}/Website"

fail() {
  printf '[check_site] %s\n' "$1" >&2
  exit 1
}

require_command() {
  name=$1
  if ! command -v "$name" >/dev/null 2>&1; then
    fail "missing required command: $name"
  fi
}

require_command bun
require_command brotli
require_command swiftly
require_command wasm-opt

"$site_root/Scripts/check_site_ci_workflow.sh"

bun install --cwd "$website_dir" --frozen-lockfile
bun run --cwd "$website_dir" test

bun run --cwd "$website_dir" build:wasm

wasm_path="$webexample_dir/pages-dist/TerminalApp/dist/assets/app.wasm"
if [[ ! -f "$wasm_path" ]]; then
  fail "missing WebExample wasm at $wasm_path"
fi

brotli --test "$wasm_path"
WASM_PATH="$wasm_path" bun -e 'const wasmPath = process.env.WASM_PATH; if (!wasmPath) throw new Error("WASM_PATH is required"); const proc = Bun.spawnSync({ cmd: ["brotli", "--decompress", "--stdout", wasmPath], stdout: "pipe", stderr: "pipe" }); if (proc.exitCode !== 0) { console.error(new TextDecoder().decode(proc.stderr)); process.exit(proc.exitCode ?? 1); } await WebAssembly.compile(proc.stdout); console.log(`Validated Brotli-compressed ${wasmPath}`);'

bun run --cwd "$website_dir" check
ASTRO_SITE="${ASTRO_SITE:-https://swifttui.sh}" \
  ASTRO_BASE="${ASTRO_BASE:-/}" \
  bun run --cwd "$website_dir" build
bun run --cwd "$website_dir" compose:webexample

composed_wasm_path="$website_dir/dist/webexample/TerminalApp/dist/assets/app.wasm"
if [[ ! -f "$composed_wasm_path" ]]; then
  fail "missing composed WebExample wasm at $composed_wasm_path"
fi

"$site_root/Scripts/build_docc_site.sh"
bun run "$website_dir/scripts/compose-cloudflare.ts"

printf '[check_site] ok\n'
