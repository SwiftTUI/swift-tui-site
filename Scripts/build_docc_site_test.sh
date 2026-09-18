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
terminalview_checkout="$source_parent/terminalview-source"

mkdir -p "$site_root/Scripts" "$site_root/docs" "$site_root/Website/dist" \
  "$site_root/Website/docs-theme" \
  "$source_checkout" "$charts_checkout" "$terminalview_checkout"
cp "$build_script" "$site_root/Scripts/build_docc_site.sh"
cp "$(dirname "$build_script")/apply_docc_theme.sh" "$site_root/Scripts/apply_docc_theme.sh"
printf '{"theme":{}}\n' > "$site_root/Website/docs-theme/theme-settings.json"
printf '/* fixture theme */\n' > "$site_root/Website/docs-theme/docs-theme.css"

# Three fixture repos have distinct mounts. All must survive composition.
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
  - name: swift-tui-terminal-view
    repository: SwiftTUI/swift-tui-terminal-view
    ref: terminalview-fixture
    doccCommand: ./make-docs.sh
    outputPath: .build-docs
    mountPath: docs/terminal-view
EOF

git -C "$source_parent" init -q

cat > "$source_checkout/make-docs.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p .build-docs/documentation/fixture
printf 'local overlay docs\n' > .build-docs/index.html
printf '<html><head><title>x</title></head><body>shell</body></html>\n' \
  > .build-docs/documentation/fixture/index.html
EOF
chmod +x "$source_checkout/make-docs.sh"

cat > "$charts_checkout/make-docs.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p .build-docs
printf 'local overlay charts docs\n' > .build-docs/index.html
EOF
chmod +x "$charts_checkout/make-docs.sh"

cat > "$terminalview_checkout/make-docs.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p .build-docs
printf 'local overlay terminalview docs\n' > .build-docs/index.html
EOF
chmod +x "$terminalview_checkout/make-docs.sh"

SWIFTTUI_CHECKOUT="$source_checkout" \
SWIFTTUI_CHARTS_CHECKOUT="$charts_checkout" \
SWIFTTUI_TERMINAL_VIEW_CHECKOUT="$terminalview_checkout" \
DOCC_SOURCE_REF=nonexistent-remote-ref \
  "$site_root/Scripts/build_docc_site.sh" >/dev/null

grep -q "local overlay docs" "$site_root/Website/dist/docs/index.html"
grep -q "local overlay charts docs" "$site_root/Website/dist/docs/charts/index.html"
grep -q "local overlay terminalview docs" "$site_root/Website/dist/docs/terminal-view/index.html"
# The charts mount lives INSIDE the framework mount; re-check the framework
# index after both copies to prove the second archive did not overwrite it.
grep -q "local overlay docs" "$site_root/Website/dist/docs/index.html"
# The site theme lands in every mount, and every shell with a <head> links
# its own mount's stylesheet by absolute path.
for mount in docs docs/charts docs/terminal-view; do
  test -f "$site_root/Website/dist/$mount/theme-settings.json"
  test -f "$site_root/Website/dist/$mount/docs-theme.css"
done
grep -q '<link rel="stylesheet" href="/docs/docs-theme.css"></head>' \
  "$site_root/Website/dist/docs/documentation/fixture/index.html"
test "$(grep -o 'docs-theme.css' "$site_root/Website/dist/docs/documentation/fixture/index.html" | wc -l | tr -d ' ')" = 1

# A set-but-missing local checkout must fail loudly, not clone a public tag.
if SWIFTTUI_CHARTS_CHECKOUT="$source_parent/does-not-exist" \
  SWIFTTUI_CHECKOUT="$source_checkout" \
  "$site_root/Scripts/build_docc_site.sh" >/dev/null 2>&1; then
  printf '[build_docc_site_test] FAIL: missing SWIFTTUI_CHARTS_CHECKOUT did not fail\n' >&2
  exit 1
fi

# Public builds fetch their selected ref, with isolated local remotes so the
# test needs no network, credentials, or user Git configuration.
remote_root="$tmp_dir/remotes"
mkdir -p "$remote_root"
while read -r repo tag; do
  remote="$remote_root/$repo"
  git -c init.defaultBranch=main init -q "$remote"
  printf '#!/bin/sh\nmkdir -p .build-docs\nprintf "tagged %s\\n" > .build-docs/index.html\n' \
    "$repo" > "$remote/make-docs.sh"
  chmod +x "$remote/make-docs.sh"
  git -C "$remote" add make-docs.sh
  git -C "$remote" -c core.hooksPath=/dev/null -c commit.gpgsign=false \
    -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm tagged
  git -C "$remote" -c tag.gpgsign=false tag "$tag"
  printf '#!/bin/sh\nmkdir -p .build-docs\nprintf "head %s\\n" > .build-docs/index.html\n' \
    "$repo" > "$remote/make-docs.sh"
  git -C "$remote" add make-docs.sh
  git -C "$remote" -c core.hooksPath=/dev/null -c commit.gpgsign=false \
    -c user.name=Fixture -c user.email=fixture@example.invalid commit -qm head
done <<'EOF'
swift-tui fixture
swift-tui-charts charts-fixture
swift-tui-terminal-view terminalview-fixture
EOF

git_config="$tmp_dir/gitconfig"
git config --file "$git_config" "url.file://$remote_root/.insteadOf" https://github.com/SwiftTUI/
export GIT_CONFIG_GLOBAL="$git_config" GIT_CONFIG_NOSYSTEM=1
unset SWIFTTUI_CHECKOUT SWIFTTUI_CHARTS_CHECKOUT SWIFTTUI_TERMINAL_VIEW_CHECKOUT DOCC_SOURCE_REF

DOCC_SOURCE_REF= "$site_root/Scripts/build_docc_site.sh" > "$tmp_dir/tagged.log" 2>&1
grep -q 'tagged swift-tui$' "$site_root/Website/dist/docs/index.html"
grep -q 'tagged swift-tui-charts$' "$site_root/Website/dist/docs/charts/index.html"
grep -q 'tagged swift-tui-terminal-view$' "$site_root/Website/dist/docs/terminal-view/index.html"

"$site_root/Scripts/build_docc_site.sh" > "$tmp_dir/head.log" 2>&1
grep -q 'head swift-tui$' "$site_root/Website/dist/docs/index.html"
grep -q 'head swift-tui-charts$' "$site_root/Website/dist/docs/charts/index.html"
grep -q 'head swift-tui-terminal-view$' "$site_root/Website/dist/docs/terminal-view/index.html"
grep -q "ref=main revision=$(git -C "$remote_root/swift-tui" rev-parse HEAD)" "$tmp_dir/head.log"

for invalid_ref in missing-ref --help 'main;echo'; do
  if DOCC_SOURCE_REF="$invalid_ref" "$site_root/Scripts/build_docc_site.sh" > "$tmp_dir/invalid.log" 2>&1; then
    printf '[build_docc_site_test] FAIL: invalid ref succeeded: %s\n' "$invalid_ref" >&2
    exit 1
  fi
done

printf '[build_docc_site_test] ok\n'
