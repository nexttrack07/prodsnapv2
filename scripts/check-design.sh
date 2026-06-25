#!/usr/bin/env bash
# Design-system guard: fails if dark-theme hardcodes (the patterns that broke
# the light/monochrome redesign) creep back into component files. The theme
# (src/routes/__root.tsx) + tokens (src/styles/app.css) are the source of truth;
# components should reference theme colors / --mantine-color-* / the semantic
# --surface/--text-*/--border tokens instead of hardcoding these.
#
# Allowlist: FacebookAdPreview.tsx is a faithful Facebook UI mock (real FB
# colors); __root.tsx is the theme; index.tsx has the landing's own token set.
set -euo pipefail

cd "$(dirname "$0")/.."

ALLOW='src/components/ads/FacebookAdPreview.tsx|src/routes/__root.tsx|src/routes/index.tsx|src/icons/icons.tsx'

# pattern|human description
checks=(
  'color="blue"|Mantine literal blue — use the brand (monochrome) color or a semantic token'
  'rgba\(255, ?255, ?255, ?0\.0|near-transparent white fill (dark-theme pattern; invisible on light) — use --surface/--border'
  '#050505|#070707|#080808|#0d0d0d|dark surface hex (dark-theme leftover) — use --surface/--canvas'
  'rgba\((26|10|13|17|18|20|24), ?(26|10|13|17|18|20|24), ?(26|10|13|17|18|20|24), ?0|dark surface rgba (dark-theme leftover) — use --surface/--canvas/--overlay'
  'forceColorScheme="dark"|the app is a light theme; do not force dark'
)

fail=0
for entry in "${checks[@]}"; do
  pattern="${entry%%|*}"
  desc="${entry#*|}"
  hits="$(grep -rnE "$pattern" src --include='*.tsx' 2>/dev/null | grep -vE "$ALLOW" || true)"
  if [ -n "$hits" ]; then
    echo "✗ design-guard: $desc"
    echo "$hits" | sed 's/^/    /'
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo ""
  echo "Design guard failed. Fix the above (use theme colors / --mantine-color-* / --surface tokens), or add a justified exception to scripts/check-design.sh."
  exit 1
fi

echo "✓ design guard clean"
