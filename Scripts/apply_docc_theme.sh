#!/usr/bin/env bash
set -euo pipefail

# Applies the site-owned DocC theme to one composed DocC mount:
#
#   Scripts/apply_docc_theme.sh <mount_dir> <mount_path>
#
# Copies Website/docs-theme/theme-settings.json (which Swift-DocC-Render
# fetches beside its shell) and docs-theme.css into <mount_dir>, then links
# the stylesheet from every DocC shell under the mount so the documentation
# loads the design system's fonts and heading rules. The link is absolute
# (/<mount_path>/docs-theme.css) because the shells are served at rewritten
# paths (/docs/documentation/...) by Cloudflare Pages. Shells without a
# </head> are left alone. Idempotent: a second run changes nothing.
#
# A DocC archive transformed for static hosting carries thousands of per-page
# copies of the shell (the deploy removes them; local previews use them), so
# the shells are patched in one Python pass, never one process per file.
#
# Run Website/scripts/docc-theme.ts (bun run docc-theme) to regenerate the
# theme inputs from src/styles/tokens.css.

site_root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
theme_dir="${site_root}/Website/docs-theme"

if [ "$#" -ne 2 ]; then
  printf 'usage: %s <mount_dir> <mount_path>\n' "$0" >&2
  exit 1
fi

mount_dir=$1
mount_path=${2#/}
mount_path=${mount_path%/}

if [ ! -d "$mount_dir" ]; then
  printf '[apply_docc_theme] mount directory does not exist: %s\n' "$mount_dir" >&2
  exit 1
fi

for input in theme-settings.json docs-theme.css; do
  if [ ! -f "$theme_dir/$input" ]; then
    printf '[apply_docc_theme] missing theme input: %s (run `bun run docc-theme` in Website/)\n' \
      "$theme_dir/$input" >&2
    exit 1
  fi
  cp "$theme_dir/$input" "$mount_dir/$input"
done

counts="$(MOUNT_DIR="$mount_dir" MOUNT_PATH="$mount_path" python3 - <<'PY'
import os
import sys

mount_dir = os.environ["MOUNT_DIR"]
link = '<link rel="stylesheet" href="/%s/docs-theme.css">' % os.environ["MOUNT_PATH"]
linked = skipped = 0
for root, _dirs, files in os.walk(mount_dir):
    if "index.html" not in files:
        continue
    path = os.path.join(root, "index.html")
    with open(path, encoding="utf-8") as handle:
        html = handle.read()
    if "docs-theme.css" in html:
        continue
    if "</head>" not in html:
        skipped += 1
        continue
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(html.replace("</head>", link + "</head>", 1))
    linked += 1
sys.stdout.write("%d %d\n" % (linked, skipped))
PY
)"

printf '[apply_docc_theme] %s: theme copied, %s shell(s) linked, %s without <head> skipped\n' \
  "$mount_path" "${counts%% *}" "${counts##* }"
