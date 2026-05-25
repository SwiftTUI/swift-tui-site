#!/usr/bin/env bash
set -euo pipefail

site_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
test_workflow="$site_root/.github/workflows/test.yml"
deploy_workflow="$site_root/.github/workflows/cloudflare-pages.yml"

fail() {
  printf '[check_site_ci_workflow] %s\n' "$1" >&2
  exit 1
}

require_file() {
  path=$1
  if [[ ! -f "$path" ]]; then
    fail "missing required file: ${path#$site_root/}"
  fi
}

require_text() {
  needle=$1
  path=$2
  if ! grep -Fq -- "$needle" "$path"; then
    fail "expected ${path#$site_root/} to contain: $needle"
  fi
}

forbid_text() {
  needle=$1
  path=$2
  if grep -Fq -- "$needle" "$path"; then
    fail "forbidden stale text in ${path#$site_root/}: $needle"
  fi
}

require_file "$test_workflow"
require_file "$deploy_workflow"

forbid_text "swift-tui-examples/Examples/WebExample" "$deploy_workflow"
require_text "swift-tui-examples/WebExample" "$deploy_workflow"
require_text "WEBEXAMPLE_DIR" "$deploy_workflow"
require_text "brotli --test" "$deploy_workflow"
require_text "WebAssembly.compile" "$deploy_workflow"
require_text "CLOUDFLARE_PAGES_FILE_LIMIT" "$deploy_workflow"
require_text 'secrets.SWIFTTUI_CI_TOKEN || github.token' "$deploy_workflow"

require_text "Scripts/check_site.sh" "$test_workflow"
require_text "repository: SwiftTUI/swift-tui" "$test_workflow"
require_text "repository: SwiftTUI/swift-tui-examples" "$test_workflow"
require_text "repository: SwiftTUI/swift-tui-web" "$test_workflow"
require_text 'secrets.SWIFTTUI_CI_TOKEN || github.token' "$test_workflow"

printf '[check_site_ci_workflow] ok\n'
