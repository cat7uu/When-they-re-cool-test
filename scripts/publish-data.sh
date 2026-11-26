#!/usr/bin/env bash
# Replaces the "data" branch with the JSON files in out/ (one small commit).
# Used by .github/workflows/headlines.yml; needs TOKEN and GITHUB_REPOSITORY.
set -euo pipefail
cd out
ls *.json
rm -rf .git
git init -q -b data
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add *.json
git commit -q -m "Update headlines and stocks"
git push -q -f "https://x-access-token:${TOKEN}@github.com/${GITHUB_REPOSITORY}.git" data
