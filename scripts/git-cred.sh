#!/bin/sh
# Git credential helper for THIS repo only. Uses $GITHUB_TOKEN, or reads it
# from LOCAL_SECRETS.md next to this repo. Answers only for
# github.com/jaydeepdive/conference-crm (never any other repo).
[ "$1" = "get" ] || exit 0
input=$(cat)
echo "$input" | grep -q "host=github.com" || exit 0
echo "$input" | grep -q "path=jaydeepdive/conference-crm" || exit 0
TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  TOKEN=$(grep -E '^\| GITHUB_TOKEN \|' "$ROOT/LOCAL_SECRETS.md" 2>/dev/null | sed -E 's/.*`([^`]+)`.*/\1/')
fi
[ -n "$TOKEN" ] && printf "username=x-access-token\npassword=%s\n" "$TOKEN"
