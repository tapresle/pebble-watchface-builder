#!/usr/bin/env bash
# Bundles and runs the weather icon bounds assertion.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

npx esbuild "$root/scripts/check-icons.ts" --bundle --platform=node --format=esm \
  --log-level=warning --outfile="$work/check-icons.mjs"
node "$work/check-icons.mjs"
