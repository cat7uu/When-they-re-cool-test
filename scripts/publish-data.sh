#!/usr/bin/env bash
# Replaces the "data" branch with the JSON files in out/ (one small commit).
# Used by .github/workflows/headlines.yml; needs TOKEN and GITHUB_REPOSITORY.
set -euo pipefail
cd out

# Only publish the two expected files, and only if each is valid JSON of a
# sensible size, so a broken or oversized file never reaches the site.
files=()
for f in headlines.json stocks.json; do
  [ -f "$f" ] || continue
  size=$(stat -c %s "$f")
  if [ "$size" -gt 10485760 ]; then echo "::warning::$f is too large ($size bytes); skipping"; continue; fi
  if ! node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "$f"; then
    echo "::warning::$f is not valid JSON; skipping"; continue
  fi
  files+=("$f")
done
if [ ${#files[@]} -eq 0 ]; then echo "::error::Nothing to publish"; exit 1; fi

rm -rf .git
git init -q -b data
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -- "${files[@]}"
git commit -q -m "Update headlines and stocks"
git push -q -f "https://x-access-token:${TOKEN}@github.com/${GITHUB_REPOSITORY}.git" data
