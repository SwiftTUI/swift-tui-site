#!/usr/bin/env bash
set -euo pipefail

# Builds every DocC archive listed in docs/docc-repos.yml and copies each into
# Website/dist at its own mountPath, then applies the site-owned DocC theme
# (Scripts/apply_docc_theme.sh: theme-settings.json + docs-theme.css). Each swiftRepos entry builds from either
# a local checkout (the per-repo environment variable below, used by the
# coordination overlay's pre-tag gates) or a fresh clone of its release ref.
#
# Local checkout inputs:
#   swift-tui        -> SWIFTTUI_CHECKOUT
#   swift-tui-charts -> SWIFTTUI_CHARTS_CHECKOUT
#   swift-tui-terminal-view -> SWIFTTUI_TERMINAL_VIEW_CHECKOUT
#
# When the variable for a repo is set it MUST point at an existing directory —
# the script fails loudly rather than silently cloning a public tag while a
# pre-tag overlay intended to test local source.
# DOCC_SOURCE_REF defaults to main for current documentation. Set it to an
# empty string to use the manifest refs, or to a shared tag for that snapshot.
# Local checkout inputs take precedence. Package dependencies remain tagged.
#
# The manifest is a `swiftRepos:` block list of flat `key: value` mappings.
# Values are YAML scalars read as strings: plain (a ` #` starts a comment),
# 'single-quoted' or "double-quoted". Every ref (DOCC_SOURCE_REF or the
# manifest's) must be a branch, tag (SemVer build metadata included) or commit
# ID. Every mountPath must name a distinct directory strictly inside
# Website/dist, and a mount must be listed before any mount nested in it, since
# each entry replaces its mount. All of this is checked before anything is
# deleted.

site_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
manifest_path="${site_root}/docs/docc-repos.yml"
work_root="${site_root}/.build-docs-work"
website_dist="${site_root}/Website/dist"
DOCC_SOURCE_REF="${DOCC_SOURCE_REF-main}"
# A leading alphanumeric keeps every accepted ref from reading as a git option.
ref_pattern='^[A-Za-z0-9][A-Za-z0-9._/+-]*$'

if [ -n "${DOCC_SOURCE_REF:-}" ] &&
  ! [[ "$DOCC_SOURCE_REF" =~ $ref_pattern ]]; then
  printf '[build_docc_site] DOCC_SOURCE_REF must be a branch, tag, or commit ID\n' >&2
  exit 1
fi

checkout_variable_for_repo() {
  case "$1" in
  swift-tui) printf 'SWIFTTUI_CHECKOUT' ;;
  swift-tui-charts) printf 'SWIFTTUI_CHARTS_CHECKOUT' ;;
  swift-tui-terminal-view) printf 'SWIFTTUI_TERMINAL_VIEW_CHECKOUT' ;;
  *) printf '' ;;
  esac
}

# The `docc` swift-docc-plugin picks out of the toolchain is not always runnable
# on the host. The swift-6.3.x macOS toolchains ship an **x86_64-only** `docc`
# while every other binary in them is universal, so on Apple Silicon without
# Rosetta the plugin's exec dies part-way through the build with a bare
#
#   error: Error Domain=NSPOSIXErrorDomain Code=86 "Bad CPU type in executable"
#
# that names neither the tool nor the reason. Probe the executable the plugin
# would choose and, when it cannot run here, hand it one that can through
# `DOCC_EXEC` (which the plugin honors ahead of its own toolchain lookup).
#
# This is inert on a healthy toolchain: a caller-set DOCC_EXEC is left alone,
# and a runnable toolchain `docc` leaves the plugin's normal lookup untouched.
docc_runs() {
  [ -n "${1:-}" ] && [ -x "$1" ] && "$1" --help >/dev/null 2>&1
}

if [ -z "${DOCC_EXEC:-}" ]; then
  if command -v swiftly >/dev/null 2>&1; then
    # Matches the plugin's own resolution: `swiftly run` puts the active
    # toolchain's bin directory ahead of everything else on PATH.
    toolchain_docc="$(swiftly run which docc 2>/dev/null || true)"
  else
    toolchain_docc="$(command -v docc 2>/dev/null || true)"
  fi

  if [ -n "$toolchain_docc" ] && ! docc_runs "$toolchain_docc"; then
    fallback_docc="$(xcrun --find docc 2>/dev/null || true)"
    if docc_runs "$fallback_docc"; then
      export DOCC_EXEC="$fallback_docc"
      printf '[build_docc_site] toolchain docc cannot execute on this host (%s); using %s\n' \
        "$toolchain_docc" "$fallback_docc" >&2
    else
      printf '[build_docc_site] no runnable docc found.\n' >&2
      printf '[build_docc_site]   toolchain docc: %s (cannot execute here)\n' "$toolchain_docc" >&2
      printf '[build_docc_site]   on Apple Silicon check `lipo -archs %s` — the 6.3.x toolchains ship an x86_64-only docc.\n' \
        "$toolchain_docc" >&2
      printf '[build_docc_site]   install the Xcode command line tools, or set DOCC_EXEC to a docc built for this architecture.\n' >&2
      exit 1
    fi
  fi
fi

# Parse the manifest into one tab-separated record per swiftRepos entry.
entries="$(
  python3 - "$manifest_path" <<'PY'
import re
import sys

ESCAPES = {"0": "\0", "a": "\a", "b": "\b", "t": "\t", "n": "\n", "v": "\v",
           "f": "\f", "r": "\r", "e": "\x1b", " ": " ", '"': '"', "/": "/",
           "\\": "\\", "N": "\x85", "_": "\xa0", "L": "\u2028", "P": "\u2029"}
HEX_ESCAPES = {"x": 2, "u": 4, "U": 8}


def fail(message):
    sys.stderr.write(message + "\n")
    sys.exit(1)


def scalar(text, where):
    """One YAML 1.2 flow scalar, read with the failsafe schema (a string)."""
    if not text or text.startswith("#"):
        return ""
    if text[0] == "'":
        value, index = [], 1
        while True:
            end = text.find("'", index)
            if end < 0:
                fail("%s: unterminated single-quoted scalar" % where)
            value.append(text[index:end])
            if text[end + 1:end + 2] != "'":
                break
            value.append("'")
            index = end + 2
        rest = text[end + 1:]
    elif text[0] == '"':
        value, index = [], 1
        while True:
            if index >= len(text):
                fail("%s: unterminated double-quoted scalar" % where)
            char = text[index]
            if char == '"':
                break
            if char == "\\":
                code = text[index + 1:index + 2]
                if code in HEX_ESCAPES:
                    width = HEX_ESCAPES[code]
                    digits = text[index + 2:index + 2 + width]
                    if not re.fullmatch("[0-9A-Fa-f]{%d}" % width, digits):
                        fail("%s: invalid \\%s escape" % (where, code))
                    value.append(chr(int(digits, 16)))
                    index += 2 + width
                    continue
                if code not in ESCAPES:
                    fail("%s: unsupported escape \\%s" % (where, code))
                value.append(ESCAPES[code])
                index += 2
                continue
            value.append(char)
            index += 1
        rest = text[index + 1:]
    else:
        if text[0] in "[]{}&*!|>%@`," or (text[0] in "-?:" and text[1:2] in ("", " ")):
            fail("%s: unsupported YAML value %r (use a plain or quoted scalar)" % (where, text))
        comment = re.search(r"\s#", text)
        return text[:comment.start()].rstrip() if comment else text
    rest = rest.strip()
    if rest and not rest.startswith("#"):
        fail("%s: unexpected text after the quoted scalar: %r" % (where, rest))
    return "".join(value)


entries = []
current = None
for number, raw in enumerate(open(sys.argv[1], encoding="utf-8-sig"), 1):
    stripped = raw.strip()
    if not stripped or stripped.startswith("#") or re.fullmatch(r"swiftRepos:(\s+#.*)?", stripped):
        continue
    if stripped == "-" or stripped.startswith("- "):
        current = {}
        entries.append(current)
        stripped = stripped[1:].lstrip()
    if current is None or ":" not in stripped:
        continue
    key, _, value = stripped.partition(":")
    key = key.strip()
    value = scalar(value.strip(), "line %d (%s)" % (number, key))
    # Each value becomes one field of a tab-separated record for the shell.
    if any(ord(char) < 0x20 or ord(char) == 0x7F for char in value):
        fail("line %d (%s): a value must not contain control characters" % (number, key))
    current[key] = value

required = ("name", "repository", "ref", "doccCommand", "outputPath", "mountPath")
mounts = []
for entry in entries:
    missing = [key for key in required if not entry.get(key, "").strip()]
    if missing:
        fail("invalid swiftRepos entry (missing %s): %r" % (", ".join(missing), entry))
    # Empty and "." segments are dropped, so /docs/ still means docs; ".."
    # could leave Website/dist, and no segment at all is the whole dist.
    segments = [part for part in entry["mountPath"].split("/") if part not in ("", ".")]
    if ".." in segments or not segments:
        fail("mountPath %r must name a directory inside Website/dist" % entry["mountPath"])
    mount = "/".join(segments)
    for earlier in mounts:
        if earlier == mount:
            fail("duplicate mountPath %r: each archive needs its own mount" % mount)
        if earlier.startswith(mount + "/"):
            fail("mountPath %r is listed after the nested mount %r and would delete it; "
                 "list the containing mount first" % (mount, earlier))
    mounts.append(mount)
    entry["mountPath"] = mount
    print("\t".join(entry[key] for key in required))

if not entries:
    fail("no swiftRepos entries found")
PY
)" || {
  printf '[build_docc_site] invalid manifest: %s\n' "$manifest_path" >&2
  exit 1
}

# Fails unless the real path of $1 lies strictly inside the real path of
# Website/dist, so a symlinked parent cannot carry the rm -rf below outside it.
require_mount_inside_dist() {
  python3 - "$website_dist" "$1" <<'PY' || exit 1
import os
import sys

dist, target = (os.path.realpath(path) for path in sys.argv[1:3])
if target == dist or os.path.commonpath([dist, target]) != dist:
    sys.stderr.write(
        "[build_docc_site] mountPath %s resolves to %s, outside %s\n" % (sys.argv[2], target, dist)
    )
    sys.exit(1)
PY
}

# Validate every entry before anything is deleted.
while IFS=$'\t' read -r repo_name repository ref docc_command output_path mount_path; do
  ref="${DOCC_SOURCE_REF:-$ref}"
  if ! [[ "$ref" =~ $ref_pattern ]]; then
    printf '[build_docc_site] %s ref must be a branch, tag, or commit ID: %s\n' \
      "$repo_name" "$ref" >&2
    exit 1
  fi
  require_mount_inside_dist "${website_dist}/${mount_path}"
done <<EOF
$entries
EOF

rm -rf "$work_root"
mkdir -p "$work_root"

while IFS=$'\t' read -r repo_name repository ref docc_command output_path mount_path; do
  ref="${DOCC_SOURCE_REF:-$ref}"
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

  # An earlier archive may have added links under Website/dist; check again.
  require_mount_inside_dist "$output_root"
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
      git fetch --tags origin -- "$ref" >/dev/null
      git checkout --quiet --detach FETCH_HEAD
      printf '[build_docc_site] source %s ref=%s revision=%s\n' \
        "$repo_name" "$ref" "$(git rev-parse HEAD)"
    else
      printf '[build_docc_site] source %s local-checkout=%s\n' \
        "$repo_name" "$source_checkout"
    fi
    sh -c "$docc_command"
  )

  cp -R "${clone_dir}/${output_path}"/. "$output_root"/
  printf '[build_docc_site] copied %s DocC archive to %s\n' "$repo_name" "$output_root"
  "${site_root}/Scripts/apply_docc_theme.sh" "$output_root" "$mount_path"
done <<EOF
$entries
EOF
