#!/usr/bin/env bash
# Apply a SQL file to the live Supabase DB via the Management API.
# Usage: SUPABASE_ACCESS_TOKEN=... scripts/supabase-sql.sh supabase/migrations/00NN_x.sql
set -euo pipefail
REF="${SUPABASE_PROJECT_REF:-zetiaccmsqamqhldjaps}"
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  SUPABASE_ACCESS_TOKEN=$(grep -E '^\| SUPABASE_ACCESS_TOKEN \|' "$ROOT/LOCAL_SECRETS.md" 2>/dev/null | sed -E 's/.*`([^`]+)`.*/\1/')
fi
: "${SUPABASE_ACCESS_TOKEN:?no token — see LOCAL_SECRETS.md}"
[ $# -eq 1 ] || { echo "usage: $0 <file.sql>" >&2; exit 2; }
payload=$(python3 -c "import json,sys;print(json.dumps({'query':open(sys.argv[1]).read()}))" "$1")
body=$(curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data "$payload")
if echo "$body" | grep -q '"message"'; then echo "SUPABASE ERROR: $body" >&2; exit 1; fi
echo "ok: applied $(basename "$1")"; echo "$body" | head -c 4000; echo
