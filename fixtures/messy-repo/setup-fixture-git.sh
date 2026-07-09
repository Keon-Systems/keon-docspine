#!/usr/bin/env bash
# Seeds a throwaway git history for the DocSpine messy-repo fixture in a
# temporary COPY, including the git-rename that fixture defect #2 depends
# on. POSIX/bash counterpart of setup-fixture-git.ps1 — keep both in sync.
#
# NEVER run this against the checked-in fixture tree directly — always pass
# --target outside the repo (e.g. under $TMPDIR). This script only copies
# the source tree; it never mutates it.
#
# Usage: ./setup-fixture-git.sh [--target <dir>]
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target|-t)
      TARGET="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TARGET" ]]; then
  TARGET="$(mktemp -d "${TMPDIR:-/tmp}/docspine-fixture-git.XXXXXX")"
fi

echo "Source fixture: $SOURCE_ROOT"
echo "Target (throwaway) repo: $TARGET"

if [[ "$(cd "$SOURCE_ROOT" && pwd)" == "$(cd "$TARGET" 2>/dev/null && pwd || echo __nope__)" ]]; then
  echo "Target must not be the checked-in fixture tree itself. Pass a separate --target directory." >&2
  exit 1
fi

if [[ -e "$TARGET" ]]; then
  rm -rf "$TARGET"
fi
mkdir -p "$TARGET"

# Copy everything except any pre-existing .git.
shopt -s dotglob
for entry in "$SOURCE_ROOT"/*; do
  base="$(basename "$entry")"
  if [[ "$base" == ".git" ]]; then
    continue
  fi
  cp -R "$entry" "$TARGET/$base"
done
shopt -u dotglob

cd "$TARGET"

git init -q -b main
git config user.email "fixture@docspine.invalid"
git config user.name "DocSpine Fixture Seeder"

NEW_PATH="src/payments/charge-processor.ts"
OLD_PATH="src/payments/processor.ts"

if [[ ! -f "$NEW_PATH" ]]; then
  echo "Expected fixture file not found: $NEW_PATH" >&2
  exit 1
fi

# Step 1: simulate the pre-rename state and commit it.
mv "$NEW_PATH" "$OLD_PATH"
git add -A
git commit -q -m "Initial import of messy-repo fixture (pre-rename state)"

# Step 2: perform the rename that fixture defect #2 depends on.
git mv "$OLD_PATH" "$NEW_PATH"
git commit -q -m "Rename payments processor.ts -> charge-processor.ts"

# Step 3: a further commit touching the same covered path (src/payments/**),
# so this fixture has >= 3 commits touching a covered path.
printf '\n// fixture: post-rename null-check added\n' >> "$NEW_PATH"
git add "$NEW_PATH"
git commit -q -m "Add null-check to processCharge"

echo
echo "Seeded git history in: $TARGET"
echo
echo "git log --follow $NEW_PATH ->"
git log --follow --oneline -- "$NEW_PATH"

echo
echo "OK: fixture git history seeded at $TARGET"
exit 0