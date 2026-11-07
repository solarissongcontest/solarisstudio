#!/usr/bin/env bash
set -euo pipefail

fail() { printf '[tg10-world-notification-candidates] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable; isolated local verification required"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL client unavailable; isolated local verification required"

# Read only the two local connection addresses from the CLI. NEVER eval its
# output: URL validation would happen too late to stop injected shell commands.
status_output="$(supabase status -o env)" || fail "Local Supabase stack is unavailable"
API_URL=''
DB_URL=''
api_count=0
db_count=0
while IFS= read -r line; do
  case "$line" in
    API_URL=*)
      api_count=$((api_count + 1))
      API_URL="${line#API_URL=}"
      ;;
    DB_URL=*)
      db_count=$((db_count + 1))
      DB_URL="${line#DB_URL=}"
      ;;
  esac
done <<< "$status_output"

[[ "$api_count" -eq 1 && "$db_count" -eq 1 ]] ||
  fail "Local Supabase status must provide exactly one API_URL and DB_URL"

# Supabase may print either plain values or simple quoted values. No shell
# expansion or command substitution is performed on the contents.
strip_outer_quotes() {
  local value="$1"
  if [[ "$value" == \"*\" || "$value" == \'*\' ]]; then
    value="${value:1:-1}"
  fi
  printf '%s' "$value"
}
API_URL="$(strip_outer_quotes "$API_URL")"
DB_URL="$(strip_outer_quotes "$DB_URL")"

# Full-string matches reject user-info tricks, extra @hosts, non-numeric
# ports, query overrides and any other nonstandard connection target.
[[ "$API_URL" =~ ^http://127\.0\.0\.1:[0-9]{2,5}/?$ ]] || fail "Refusing non-loopback Supabase API URL"
[[ "$DB_URL" =~ ^postgres(ql)?://postgres:postgres@127\.0\.0\.1:[0-9]{2,5}(/postgres)?$ ]] || fail "Refusing non-loopback PostgreSQL URL"

# libpq can read connection attributes outside a URL. In particular PGHOSTADDR
# can replace the network destination even with a literal loopback URL host;
# PGSERVICE/PGSERVICEFILE and PGOPTIONS can redirect or alter the session.
# Fail closed on ANY inherited PG* variable rather than maintaining an
# incomplete allow/deny list. The developer must explicitly unset them before
# running this disposable local-only database fixture.
for pg_setting in "${!PG@}"; do
  fail "Refusing inherited libpq PG* setting: $pg_setting"
done

psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-follow-notification-candidates.sql"
