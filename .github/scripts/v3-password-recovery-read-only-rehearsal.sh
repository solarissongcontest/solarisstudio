#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[password-recovery-read-only] %s\n' "$*"; }
fail() { printf '\n[password-recovery-read-only] FAIL: %s\n' "$1" >&2; exit 1; }

command -v psql >/dev/null || fail "psql is required"
command -v supabase >/dev/null || fail "Supabase CLI is required"

eval "$(supabase status -o env)"
: "${DB_URL:?missing local DB_URL}"
: "${API_URL:?missing local API_URL}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing read-only recovery rehearsal against non-local API URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@localhost:*/*) ;;
  *) fail "refusing read-only recovery rehearsal against non-local database" ;;
esac

set_mode() {
  local mode="$1" reason="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
update public.studio2_platform_operational_state
set mode = '$mode',
    version = version + 1,
    reason = '$reason',
    changed_at = now()
where singleton = true;
SQL
}

restore_normal() {
  set_mode normal 'Local password-recovery read-only rehearsal cleanup' >/dev/null 2>&1 || true
}
trap restore_normal EXIT

log "Entering read_only before the full local recovery cycle"
set_mode read_only 'Local password-recovery read-only rehearsal'
mode="$(psql "$DB_URL" -Atqc "select mode from public.studio2_platform_operational_state where singleton = true")"
[[ "$mode" == "read_only" ]] || fail "platform did not enter read_only"
printf '[recovery-platform-mode] mode=%s\n' "$mode"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
bash "$script_dir/v3-password-recovery-rehearsal.sh"

mode="$(psql "$DB_URL" -Atqc "select mode from public.studio2_platform_operational_state where singleton = true")"
[[ "$mode" == "read_only" ]] || fail "full recovery rehearsal changed platform mode unexpectedly"
printf '[recovery-platform-mode] completed_while=%s\n' "$mode"

restore_normal
trap - EXIT
log "Full password recovery cycle passed while Solaris was read_only"
