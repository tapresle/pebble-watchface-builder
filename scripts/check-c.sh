#!/usr/bin/env bash
# Generates a watchface that uses every element type, for every supported watch,
# and compiles each against the stub SDK header so codegen regressions surface
# as compiler errors.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

npx esbuild "$root/scripts/emit-fixture.ts" --bundle --platform=node --format=esm \
  --log-level=warning --outfile="$work/emit.mjs"

for platform in emery flint gabbro diorite chalk; do
  node "$work/emit.mjs" c "$platform" > "$work/generated-$platform.c"
  node "$work/emit.mjs" json "$platform" > "$work/package-$platform.json"
  node -e "
    const doc = JSON.parse(require('fs').readFileSync('$work/package-$platform.json', 'utf8'));
    const got = doc.pebble.targetPlatforms;
    if (got.length !== 1 || got[0] !== '$platform') {
      throw new Error('expected targetPlatforms [$platform], got ' + JSON.stringify(got));
    }
  "

  # The resource compiler normally defines these; fake them for the syntax check.
  {
    grep -oE '(RESOURCE_ID|MESSAGE_KEY)_[A-Z0-9_]+' "$work/generated-$platform.c" | sort -u |
      awk '{ printf "#define %s %du\n", $1, NR }'
    cat "$work/generated-$platform.c"
  } > "$work/main-$platform.c"

  cc -std=c11 -fsyntax-only -Wall -Wextra -Werror \
    -I "$root/scripts/pebble-stub" "$work/main-$platform.c"

  echo "$platform: generated C compiles clean ($(wc -l < "$work/generated-$platform.c" | tr -d ' ') lines)"
done

# A 1-bit target must never emit a color expression it cannot represent.
for platform in flint diorite; do
  if grep -q 'GColorFromRGB' "$work/generated-$platform.c"; then
    echo "$platform: unexpected GColorFromRGB in a black-and-white build" >&2
    exit 1
  fi
  echo "$platform: colors are GColorBlack/GColorWhite only"
done
