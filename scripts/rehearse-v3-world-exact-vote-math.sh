#!/usr/bin/env bash
set -euo pipefail

# Disposable, local-only TG8 SQL rehearsal. Never use hosted project values.
fail() { printf '[tg8-vote-math] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI not installed"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL client not installed"

command -v node >/dev/null 2>&1 || fail "Node.js URL validator not installed"

# Do not eval Supabase CLI output. Read only the required KEY="value" records.
status_output="$(supabase status -o env)" || fail "No local Supabase stack"
read_status_url() {
  local key="$1" line value found=""
  while IFS= read -r line; do
    case "$line" in
      "$key"=*)
        [ -z "$found" ] || return 1
        value="${line#*=}"
        if [[ "$value" == \"* ]]; then
          [[ "$value" == *\" && ${#value} -ge 2 ]] || return 1
          value="${value:1:${#value}-2}"
        fi
        [[ "$value" != *\"* && "$value" != *\'* && "$value" != *\\* ]] || return 1
        found="$value"
        ;;
    esac
  done <<< "$status_output"
  [ -n "$found" ] || return 1
  printf '%s' "$found"
}
API_URL="$(read_status_url API_URL)" || fail "Missing or malformed local API URL"
DB_URL="$(read_status_url DB_URL)" || fail "Missing or malformed local database URL"

# A shell prefix match would accept http://localhost:54321@remote.example or
# postgres://postgres:postgres@127.0.0.1:54322@remote.example/postgres.
# URL authority, not a local-looking string prefix, determines network destination.
# Queries are forbidden because libpq ?host=... may override the actual host.
if ! API_URL="$API_URL" DB_URL="$DB_URL" node <<'NODE'
const localHost = (host) => host === '127.0.0.1' || host === 'localhost';
const validPort = (port) => /^[0-9]{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;
try {
  const api = new URL(process.env.API_URL);
  const db = new URL(process.env.DB_URL);
  const apiOK = api.protocol === 'http:' && localHost(api.hostname) && validPort(api.port) &&
    api.username === '' && api.password === '' && api.pathname === '/' &&
    api.search === '' && api.hash === '';
  const dbOK = ['postgres:', 'postgresql:'].includes(db.protocol) &&
    localHost(db.hostname) && validPort(db.port) &&
    db.username === 'postgres' && db.password === 'postgres' &&
    db.pathname === '/postgres' && db.search === '' && db.hash === '';
  if (!apiOK || !dbOK) process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
NODE
then
  fail "Refusing hosted/non-loopback database or malformed Supabase URL"
fi

psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-exact-vote-math.sql"
