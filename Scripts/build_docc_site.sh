#!/usr/bin/env bash
set -euo pipefail

site_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
manifest_path="${site_root}/docs/docc-repos.yml"
work_root="${site_root}/.build-docs-work"
website_dist="${site_root}/Website/dist"

repo_name="$(awk '/^[[:space:]]*- name:/ { print $3; exit }' "$manifest_path")"
repository="$(awk '/^[[:space:]]*repository:/ { print $2; exit }' "$manifest_path")"
ref="$(awk '/^[[:space:]]*ref:/ { print $2; exit }' "$manifest_path")"
docc_command="$(awk -F': ' '/^[[:space:]]*doccCommand:/ { print $2; exit }' "$manifest_path")"
output_path="$(awk '/^[[:space:]]*outputPath:/ { print $2; exit }' "$manifest_path")"
mount_path="$(awk '/^[[:space:]]*mountPath:/ { print $2; exit }' "$manifest_path")"

if [ -z "$repo_name" ] || [ -z "$repository" ] || [ -z "$ref" ] || [ -z "$docc_command" ] || [ -z "$output_path" ] || [ -z "$mount_path" ]; then
  printf '[build_docc_site] invalid manifest: %s\n' "$manifest_path" >&2
  exit 1
fi

source_checkout="${SWIFTTUI_CHECKOUT:-}"
clone_dir="${work_root}/${repo_name}"
output_root="${website_dist}/${mount_path}"

rm -rf "$work_root" "$output_root"
mkdir -p "$work_root" "$output_root"

if [ -n "$source_checkout" ] && git -C "$source_checkout" rev-parse --git-dir >/dev/null 2>&1; then
  git clone "$source_checkout" "$clone_dir"
else
  git clone "https://github.com/${repository}" "$clone_dir"
fi

(
  cd "$clone_dir"
  git fetch --tags origin "$ref" >/dev/null 2>&1 || true
  git checkout --quiet "$ref"
  sh -c "$docc_command"
)

cp -R "${clone_dir}/${output_path}"/. "$output_root"/
printf '[build_docc_site] copied %s DocC archive at %s to %s\n' "$repo_name" "$ref" "$output_root"
