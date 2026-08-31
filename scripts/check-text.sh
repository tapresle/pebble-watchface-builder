#!/usr/bin/env bash
# Fails if an em dash or en dash has crept into the source, the generated
# output or the docs. Plain hyphens and pipes only.
#
# The patterns are matched as fixed strings: a bracket expression like [--]
# would be compared byte by byte in a C locale, where it also matches parts of
# unrelated multi-byte characters such as emoji.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

em=$'—'
en=$'–'

if hits="$(grep -rnF --exclude=check-text.sh -e "$em" -e "$en" src scripts README.md index.html 2>/dev/null)"; then
  echo "Em or en dashes found. Use a hyphen (-) or a pipe (|) instead:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "text: no em or en dashes"
