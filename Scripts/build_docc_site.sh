#!/usr/bin/env bash
set -euo pipefail

site_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
work_root="${site_root}/.build-docs-work"
output_root="${site_root}/Website/dist/docs"
swift_tui_checkout="${SWIFTTUI_CHECKOUT:-${site_root}/../swift-tui}"

rm -rf "$work_root" "$output_root"
mkdir -p "$work_root" "$output_root"

if [ -d "$swift_tui_checkout/.git" ]; then
  git clone "$swift_tui_checkout" "$work_root/swift-tui"
else
  git clone https://github.com/SwiftTUI/swift-tui "$work_root/swift-tui"
fi
(
  cd "$work_root/swift-tui"
  Scripts/build_docc_archive.sh --hosting-base-path docs --output-path .build-docs
)

cp -R "$work_root/swift-tui/.build-docs"/. "$output_root"/
printf '[build_docc_site] copied swift-tui DocC archive to %s\n' "$output_root"
