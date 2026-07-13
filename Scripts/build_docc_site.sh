#!/usr/bin/env bash
set -euo pipefail

# Builds every DocC archive listed in docs/docc-repos.yml and copies each into
# Website/dist at its own mountPath. Each swiftRepos entry builds from either
# a local checkout (the per-repo environment variable below, used by the
# coordination overlay's pre-tag gates) or a fresh clone of its release ref.
#
# Local checkout inputs:
#   swift-tui        -> SWIFTTUI_CHECKOUT
#   swift-tui-charts -> SWIFTTUI_CHARTS_CHECKOUT
#
# When the variable for a repo is set it MUST point at an existing directory —
# the script fails loudly rather than silently cloning a public tag while a
# pre-tag overlay intended to test local source.

site_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
manifest_path="${site_root}/docs/docc-repos.yml"
work_root="${site_root}/.build-docs-work"
website_dist="${site_root}/Website/dist"

checkout_variable_for_repo() {
  case "$1" in
  swift-tui) printf 'SWIFTTUI_CHECKOUT' ;;
  swift-tui-charts) printf 'SWIFTTUI_CHARTS_CHECKOUT' ;;
  *) printf '' ;;
  esac
}

# Parse the manifest into one tab-separated record per swiftRepos entry.
entries="$(
  python3 - "$manifest_path" <<'PY'
import sys

entries = []
current = None
for raw in open(sys.argv[1]):
    line = raw.rstrip("\n")
    stripped = line.strip()
    if not stripped or stripped.startswith("#") or stripped == "swiftRepos:":
        continue
    if stripped.startswith("- "):
        current = {}
        entries.append(current)
        stripped = stripped[2:]
    if current is None or ":" not in stripped:
        continue
    key, _, value = stripped.partition(":")
    current[key.strip()] = value.strip()

required = ("name", "repository", "ref", "doccCommand", "outputPath", "mountPath")
for entry in entries:
    missing = [key for key in required if not entry.get(key)]
    if missing:
        sys.stderr.write(
            "invalid swiftRepos entry (missing %s): %r\n" % (", ".join(missing), entry)
        )
        sys.exit(1)
    print("\t".join(entry[key] for key in required))

if not entries:
    sys.stderr.write("no swiftRepos entries found\n")
    sys.exit(1)
PY
)" || {
  printf '[build_docc_site] invalid manifest: %s\n' "$manifest_path" >&2
  exit 1
}

rm -rf "$work_root"
mkdir -p "$work_root"

while IFS=$'\t' read -r repo_name repository ref docc_command output_path mount_path; do
  clone_dir="${work_root}/${repo_name}"
  output_root="${website_dist}/${mount_path}"

  checkout_variable="$(checkout_variable_for_repo "$repo_name")"
  source_checkout=""
  if [ -n "$checkout_variable" ]; then
    source_checkout="$(eval "printf '%s' \"\${${checkout_variable}:-}\"")"
  fi

  using_source_checkout=0
  if [ -n "$source_checkout" ]; then
    if [ ! -d "$source_checkout" ]; then
      printf '[build_docc_site] %s does not exist: %s\n' "$checkout_variable" "$source_checkout" >&2
      exit 1
    fi
    source_checkout="$(cd "$source_checkout" && pwd)"
    using_source_checkout=1
  fi

  rm -rf "$output_root"
  mkdir -p "$output_root"

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
done <<EOF
$entries
EOF
