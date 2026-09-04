#!/usr/bin/env bash
# Bundles and runs the saved-document compatibility assertions against the real
# project.json exports captured in scripts/fixtures.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

npx esbuild "$root/scripts/check-schema.ts" --bundle --platform=node --format=esm \
  --log-level=warning --outfile="$work/check-schema.mjs"
node "$work/check-schema.mjs" "$root/scripts/fixtures"
