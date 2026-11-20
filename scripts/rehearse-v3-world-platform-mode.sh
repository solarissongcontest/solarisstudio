#!/usr/bin/env bash
# WORLD-01 TG2 rollback-only SQL check. Only disposable loopback Supabase.
set -euo pipefail
fail() { printf '[tg2-platform-mode] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v supabase >/dev/null 2>&1 || fail 'Supabase CLI unavailable'
command -v psql >/dev/null 2>&1 || fail 'psql unavailable'
command -v node >/dev/null 2>&1 || fail 'Node.js validator unavailable'

# Remove inherited libpq routing overrides, credentials and hosted targets.
# A valid local-looking URI is NOT sufficient if PGHOSTADDR/PGSERVICE survives.
for key in "${!PG@}"; do unset "$key"; done
unset API_URL DB_URL DATABASE_URL POSTGRES_URL SUPABASE_DB_URL

# Never eval shell code emitted by Supabase status.
status_output="$(supabase status -o env)" || fail 'Disposable local Supabase is not running'
read_status_url() {
  local requested="$1" line value found=0
  while IFS= read -r line; do
    case "$line" in
      "$requested"=*)
        [[ "$found" -eq 0 ]] || return 1
        found=1
        value="${line#*=}"
        if [[ "$value" == \"* ]]; then
          [[ "$value" == *\" && ${#value} -ge 2 ]] || return 1
          value="${value:1:${#value}-2}"
        fi
        [[ "$value" != *\"* && "$value" != *\'* && "$value" != *\\* ]] || return 1
        printf '%s' "$value"
        ;;
    esac
  done <<< "$status_output"
  [[ "$found" -eq 1 ]]
}
API_URL="$(read_status_url API_URL)" || fail 'Missing, repeated or malformed local API_URL'
DB_URL="$(read_status_url DB_URL)" || fail 'Missing, repeated or malformed local DB_URL'

# Exact textual grammar + URL authority parsing: libpq query host=, userinfo
# masquerading as port, nonlocal schemes and unexpected databases all fail.
if ! API_URL="$API_URL" DB_URL="$DB_URL" node <<'NODE'
const apiText = process.env.API_URL || '';
const dbText = process.env.DB_URL || '';
const apiGrammar = /^http:\/\/(127\.0\.0\.1|localhost):([0-9]{1,5})\/?$/;
const dbGrammar = /^postgres(?:ql)?:\/\/postgres:postgres@(127\.0\.0\.1|localhost):([0-9]{1,5})\/postgres$/;
const apiMatch = apiGrammar.exec(apiText);
const dbMatch = dbGrammar.exec(dbText);
if (!apiMatch || !dbMatch) process.exit(1);
const validPort = (text) => Number(text) >= 1 && Number(text) <= 65535;
if (!validPort(apiMatch[2]) || !validPort(dbMatch[2])) process.exit(1);
try {
  const api = new URL(apiText);
  const db = new URL(dbText);
  if (api.protocol !== 'http:' || db.protocol !== 'postgres:' && db.protocol !== 'postgresql:' ||
      api.hostname !== apiMatch[1] || db.hostname !== dbMatch[1] ||
      api.port !== String(Number(apiMatch[2])) || db.port !== String(Number(dbMatch[2])) ||
      api.pathname !== '/' || db.pathname !== '/postgres' ||
      api.username || api.password || db.username !== 'postgres' || db.password !== 'postgres' ||
      api.search || api.hash || db.search || db.hash) process.exit(1);
} catch {
  process.exit(1);
}
NODE
then
  fail 'Refusing hosted, ambiguous or non-disposable Supabase URL'
fi

psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-platform-mode.sql"
