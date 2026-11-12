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

log "Running focused country-auth protection and global-gate checks in read_only"
bash "$GATE_CHECKS"

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select mode from public.studio2_platform_operational_state where singleton = true;")" == "read_only" ]] \
  || fail "focused checks did not preserve read_only"

# Disposable country-signup fixtures are setup, not part of the maintenance
# behavior under test. Create them under normal mode, then let the canonical
# recovery rehearsal itself enter read_only immediately after fixture setup and
# before any recovery classification/request/session/password assertion.
log "Returning disposable setup to normal before canonical fixture creation"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
update public.studio2_platform_operational_state
set mode = 'normal'
where singleton = true;
SQL
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select mode from public.studio2_platform_operational_state where singleton = true;")" == "normal" ]] \
  || fail "local platform did not return to normal for fixture setup"

log "Running canonical password recovery rehearsal with read_only entered after fixtures"
RECOVERY_PLATFORM_MODE=read_only bash "$RECOVERY_REHEARSAL"

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select mode from public.studio2_platform_operational_state where singleton = true;")" == "read_only" ]] \
  || fail "password recovery rehearsal did not finish in read_only"

log "Password recovery read_only rehearsal passed"
