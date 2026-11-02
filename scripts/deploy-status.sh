#!/bin/sh
# Usage: scripts/deploy-status.sh [sha]  → waits for Vercel on that commit (default HEAD)
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHA="${1:-$(git -C "$ROOT" rev-parse HEAD)}"
TOKEN="${GITHUB_TOKEN:-$(grep -E '^\| GITHUB_TOKEN \|' "$ROOT/LOCAL_SECRETS.md" | sed -E 's/.*`([^`]+)`.*/\1/')}"
for i in $(seq 1 15); do
  ST=$(curl -s -m 15 -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/jaydeepdive/conference-crm/commits/$SHA/status" | python3 -c "import sys,json;print(json.load(sys.stdin).get('state','?'))")
  [ "$ST" != "pending" ] && { echo "$SHA $ST"; exit 0; }
  sleep 12
done
echo "$SHA still pending"
