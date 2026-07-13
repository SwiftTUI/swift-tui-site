#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
build_script="$script_dir/build_docc_site.sh"
if [ ! -f "$build_script" ]; then
  build_script="$script_dir/Scripts/build_docc_site.sh"
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

site_root="$tmp_dir/site"
source_parent="$tmp_dir/parent"
source_checkout="$source_parent/source"
charts_checkout="$source_parent/charts-source"

mkdir -p "$site_root/Scripts" "$site_root/docs" "$site_root/Website/dist" \
  "$source_checkout" "$charts_checkout"
cp "$build_script" "$site_root/Scripts/build_docc_site.sh"

# Two fixture repos with distinct mounts: the framework archive at docs and
# the charts archive at docs/charts. Both must be present after the build and
# neither may overwrite the other.
cat > "$site_root/docs/docc-repos.yml" <<'EOF'
swiftRepos:
  - name: swift-tui
    repository: SwiftTUI/swift-tui
    ref: fixture
    doccCommand: ./make-docs.sh
    outputPath: .build-docs
    mountPath: docs
  - name: swift-tui-charts
    repository: SwiftTUI/swift-tui-charts
    ref: charts-fixture
    doccCommand: ./make-docs.sh
    outputPath: .build-docs
    mountPath: docs/charts
EOF

git -C "$source_parent" init -q

cat > "$source_checkout/make-docs.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p .build-docs
printf 'local overlay docs\n' > .build-docs/index.html
EOF
chmod +x "$source_checkout/make-docs.sh"

cat > "$charts_checkout/make-docs.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p .build-docs
printf 'local overlay charts docs\n' > .build-docs/index.html
EOF
chmod +x "$charts_checkout/make-docs.sh"

SWIFTTUI_CHECKOUT="$source_checkout" \
SWIFTTUI_CHARTS_CHECKOUT="$charts_checkout" \
  "$site_root/Scripts/build_docc_site.sh" >/dev/null

grep -q "local overlay docs" "$site_root/Website/dist/docs/index.html"
grep -q "local overlay charts docs" "$site_root/Website/dist/docs/charts/index.html"
# The charts mount lives INSIDE the framework mount; re-check the framework
# index after both copies to prove the second archive did not overwrite it.
grep -q "local overlay docs" "$site_root/Website/dist/docs/index.html"

# A set-but-missing local checkout must fail loudly, not clone a public tag.
if SWIFTTUI_CHARTS_CHECKOUT="$source_parent/does-not-exist" \
  SWIFTTUI_CHECKOUT="$source_checkout" \
  "$site_root/Scripts/build_docc_site.sh" >/dev/null 2>&1; then
  printf '[build_docc_site_test] FAIL: missing SWIFTTUI_CHARTS_CHECKOUT did not fail\n' >&2
  exit 1
fi

printf '[build_docc_site_test] ok\n'
