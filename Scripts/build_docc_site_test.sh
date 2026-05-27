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

mkdir -p "$site_root/Scripts" "$site_root/docs" "$site_root/Website/dist" "$source_checkout"
cp "$build_script" "$site_root/Scripts/build_docc_site.sh"

cat > "$site_root/docs/docc-repos.yml" <<'EOF'
swiftRepos:
  - name: swift-tui
    repository: SwiftTUI/swift-tui
    ref: fixture
    doccCommand: ./make-docs.sh
    outputPath: .build-docs
    mountPath: docs
EOF

git -C "$source_parent" init -q

cat > "$source_checkout/make-docs.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p .build-docs
printf 'local overlay docs\n' > .build-docs/index.html
EOF
chmod +x "$source_checkout/make-docs.sh"

SWIFTTUI_CHECKOUT="$source_checkout" "$site_root/Scripts/build_docc_site.sh" >/dev/null
grep -q "local overlay docs" "$site_root/Website/dist/docs/index.html"

printf '[build_docc_site_test] ok\n'
