#!/usr/bin/env bash
# CI fence: two checks to keep Clerk SDK coupling contained.
#
# 1. @clerk/react/experimental must stay inside src/components/billing/**.
# 2. @clerk/backend must only be imported by convex/lib/billing/provider.clerk.ts.
set -euo pipefail

FAIL=0

# Check 1: experimental Clerk React imports
BAD_EXPERIMENTAL=$(grep -rln "@clerk/react/experimental" src \
  | grep -v "^src/components/billing/" || true)

if [[ -n "$BAD_EXPERIMENTAL" ]]; then
  echo "::error::Clerk experimental imports found outside src/components/billing/**:"
  echo "$BAD_EXPERIMENTAL"
  echo ""
  echo "All @clerk/react/experimental imports must stay in src/components/billing/**"
  echo "so a beta-API break is localized. Move the offending import."
  FAIL=1
fi

# Check 2: @clerk/backend must only appear in provider.clerk.ts
BAD_BACKEND=$(grep -rln "@clerk/backend" convex \
  | grep -v "^convex/lib/billing/provider\.clerk\.ts$" \
  | grep -v "^convex/testing/" \
  | grep -v "\.test\.ts$" || true)

if [[ -n "$BAD_BACKEND" ]]; then
  echo "::error::@clerk/backend imported outside convex/lib/billing/provider.clerk.ts:"
  echo "$BAD_BACKEND"
  echo ""
  echo "All @clerk/backend imports must stay in convex/lib/billing/provider.clerk.ts."
  echo "Use getClerkClient() from that module instead of importing directly."
  FAIL=1
fi

if [[ $FAIL -eq 1 ]]; then
  exit 1
fi

echo "✓ billing fence clean"
