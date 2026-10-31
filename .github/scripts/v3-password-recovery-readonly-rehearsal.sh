#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[password-recovery-readonly] %s\n' "$*"; }
fail() { printf '\n[password-recovery-readonly] FAIL: %s\n' "$*" >&2; exit 1; }

command -v psql >/dev/null || fail "psql is required"
command -v supabase >/dev/null || fail "Supabase CLI is required"

eval "$(supabase status -o env)"
: "${API_URL:?missing local API_URL}"
: "${DB_URL:?missing local DB_URL}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "refusing hosted Supabase API: $API_URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "refusing non-local database" ;;
esac

SCRIPT_ROOT="${GITHUB_WORKSPACE:-$(pwd -P)}"
GATE_CHECKS="$SCRIPT_ROOT/.github/scripts/v3-country-auth-readonly-gate-checks.sh"
RECOVERY_REHEARSAL="$SCRIPT_ROOT/.github/scripts/v3-password-recovery-rehearsal.sh"
[[ -f "$GATE_CHECKS" ]] || fail "read-only gate checks script is missing"
[[ -f "$RECOVERY_REHEARSAL" ]] || fail "password recovery rehearsal script is missing"

log "Entering read_only on the disposable local platform"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
update public.studio2_platform_operational_state
set mode = 'read_only'
where singleton = true;
SQL
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select mode from public.studio2_platform_operational_state where singleton = true;")" == "read_only" ]] \
  || fail "local platform did not enter read_only"

log "Running focused country-auth protection and global-gate checks"
bash "$GATE_CHECKS"

# The focused checks deliberately leave the platform in read_only. The existing
# recovery rehearsal now runs unchanged in that mode, preserving its local-only
# API/DB/Mailpit guards while proving the real recovery email, redirect, session,
# password replacement, new-password sign-in and old-password rejection path.
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select mode from public.studio2_platform_operational_state where singleton = true;")" == "read_only" ]] \
  || fail "focused checks did not preserve read_only for recovery rehearsal"

log "Running canonical password recovery rehearsal while read_only"
bash "$RECOVERY_REHEARSAL"

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select mode from public.studio2_platform_operational_state where singleton = true;")" == "read_only" ]] \
  || fail "password recovery rehearsal unexpectedly changed platform mode"

log "Password recovery read_only rehearsal passed"
