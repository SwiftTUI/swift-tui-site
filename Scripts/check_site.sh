#!/usr/bin/env bash
set -euo pipefail

site_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
swift_tui_checkout="${SWIFTTUI_CHECKOUT:-${site_root}/../swift-tui}"
examples_checkout="${SWIFTTUI_EXAMPLES_CHECKOUT:-${site_root}/../swift-tui-examples}"
web_checkout="${SWIFTTUI_WEB_CHECKOUT:-${site_root}/../swift-tui-web}"
webexample_dir="${WEBEXAMPLE_DIR:-${examples_checkout}/WebExample}"
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

require_checkout() {
  path=$1
  label=$2
  if [[ ! -d "$path" ]]; then
    fail "missing $label checkout: $path"
  fi
}

require_command bun
require_command brotli
require_command swiftly
require_command wasm-opt
require_checkout "$swift_tui_checkout" "swift-tui"
require_checkout "$examples_checkout" "swift-tui-examples"
require_checkout "$web_checkout" "swift-tui-web"
require_checkout "$webexample_dir" "WebExample"

"$site_root/Scripts/check_site_ci_workflow.sh"

bun install --cwd "$website_dir" --frozen-lockfile
bun install --cwd "$examples_checkout" --frozen-lockfile

WEBEXAMPLE_DIR="$webexample_dir" bun run --cwd "$website_dir" build:wasm

wasm_path="$webexample_dir/pages-dist/TerminalApp/dist/assets/app.wasm"
if [[ ! -f "$wasm_path" ]]; then
  fail "missing WebExample wasm at $wasm_path"
fi

brotli --test "$wasm_path"
WASM_PATH="$wasm_path" bun -e 'const wasmPath = process.env.WASM_PATH; if (!wasmPath) throw new Error("WASM_PATH is required"); const proc = Bun.spawnSync({ cmd: ["brotli", "--decompress", "--stdout", wasmPath], stdout: "pipe", stderr: "pipe" }); if (proc.exitCode !== 0) { console.error(new TextDecoder().decode(proc.stderr)); process.exit(proc.exitCode ?? 1); } await WebAssembly.compile(proc.stdout); console.log(`Validated Brotli-compressed ${wasmPath}`);'

WEBEXAMPLE_DIR="$webexample_dir" bun run --cwd "$website_dir" check
ASTRO_SITE="${ASTRO_SITE:-https://swifttui.sh}" \
  ASTRO_BASE="${ASTRO_BASE:-/}" \
  WEBEXAMPLE_DIR="$webexample_dir" \
  bun run --cwd "$website_dir" build

SWIFTTUI_CHECKOUT="$swift_tui_checkout" "$site_root/Scripts/build_docc_site.sh"

printf '[check_site] ok\n'
