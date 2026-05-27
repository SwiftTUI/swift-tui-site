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
using_source_checkout=0

if [ -n "$source_checkout" ]; then
  if [ ! -d "$source_checkout" ]; then
    printf '[build_docc_site] SWIFTTUI_CHECKOUT does not exist: %s\n' "$source_checkout" >&2
    exit 1
  fi
  source_checkout="$(cd "$source_checkout" && pwd)"
  using_source_checkout=1
fi

rm -rf "$work_root" "$output_root"
mkdir -p "$work_root" "$output_root"

if [ "$using_source_checkout" -eq 1 ]; then
  mkdir -p "$clone_dir"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --exclude='.git' \
      --exclude='.build' \
      --exclude='node_modules' \
      "$source_checkout"/ "$clone_dir"/
  else
    cp -R "$source_checkout"/. "$clone_dir"/
    rm -rf "$clone_dir/.git" "$clone_dir/.build" "$clone_dir/node_modules"
  fi
else
  git clone "https://github.com/${repository}" "$clone_dir"
fi

(
  cd "$clone_dir"
  if [ "$using_source_checkout" -eq 0 ]; then
    git fetch --tags origin "$ref" >/dev/null 2>&1 || true
    git checkout --quiet "$ref"
  fi
  sh -c "$docc_command"
)

cp -R "${clone_dir}/${output_path}"/. "$output_root"/
printf '[build_docc_site] copied %s DocC archive at %s to %s\n' "$repo_name" "$ref" "$output_root"
