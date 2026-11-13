#!/usr/bin/env bash
# Release check: export exactly the files a public release would contain
# (tracked + untracked, minus .gitignore), commit them to a scratch repository,
# clone it, and run install, lint, build, tests and secret scans in the clone.
# The clone has no .env, no external/ components and no local database.
#
# Usage: scripts/release-check.sh [work-dir]   (default: a new mktemp directory)
# Nothing is pushed. The working repository is not modified.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$(mktemp -d)}"
rm -rf "$WORK/candidate" "$WORK/clone"
mkdir -p "$WORK/candidate"
cd "$ROOT"
git ls-files --cached --others --exclude-standard -z | while IFS= read -r -d '' f; do
  [ -f "$f" ] && mkdir -p "$WORK/candidate/$(dirname "$f")" && cp -p "$f" "$WORK/candidate/$f"
done
cd "$WORK/candidate"
git init -q -b main
git -c user.name=release-check -c user.email=release-check@example.invalid add -A
git -c user.name=release-check -c user.email=release-check@example.invalid commit -q -m "release candidate"
echo "candidate: $(git ls-files | wc -l) files"
if git ls-files | grep -E '(^|/)\.env$|^external/|\.sqlite|^demo/|\.mp4$|\.mp3$' ; then
  echo "FAIL: excluded files are present"; exit 1
fi
git clone -q "$WORK/candidate" "$WORK/clone"
cd "$WORK/clone"
env -u OPENCODE_API_KEY -u SERPER_API_KEY bash -c '
  set -e
  npm ci --no-audit --no-fund
  npm run lint
  npm run build
  npm test
  node scripts/secret-scan.mjs
  node scripts/secret-scan.mjs --history
'
echo "release check passed in $WORK/clone"
