#!/usr/bin/env bash
# CI fence: ensures @clerk/react/experimental imports stay inside
# src/components/billing/**. That folder isolates Clerk-beta-API coupling
# so a breaking change has a small blast radius. Any other location with
# an experimental import fails the check.
set -euo pipefail

BAD=$(grep -rln "@clerk/react/experimental" src \
  | grep -v "^src/components/billing/" || true)

if [[ -n "$BAD" ]]; then
  echo "::error::Clerk experimental imports found outside src/components/billing/**:"
  echo "$BAD"
  echo ""
  echo "All @clerk/react/experimental imports must stay in src/components/billing/**"
  echo "so a beta-API break is localized. Move the offending import."
  exit 1
fi

echo "✓ billing fence clean"
