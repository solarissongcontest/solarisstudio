#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-show-cue-authority] %s\n' "$*"; }
fail() { printf '\n[v3-show-cue-authority] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# Stateful authority verification is deliberately local-only. Never replace this
# guard with a hosted fallback when Docker/local Supabase is unavailable.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*|postgresql://postgres:postgres@\[::1\]:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AUTHORITY_TEST="$ROOT/.github/tests/v3-show-cue-authority.sql"
LOCK_TEST="$ROOT/.github/tests/v3-show-cue-lock-contract.sql"
[[ -f "$AUTHORITY_TEST" ]] || fail "Missing authority contract $AUTHORITY_TEST"
[[ -f "$LOCK_TEST" ]] || fail "Missing lock contract $LOCK_TEST"

# Keep SQLSTATE/source diagnostics visible. Authority failures are intentionally
# actionable; hiding the surfaced condition code turns one broken assertion into
# several rounds of interpretive dance with PostgreSQL.
PSQL=(psql "$DB_URL" -v ON_ERROR_STOP=1 -v VERBOSITY=verbose)

log "Running show lifecycle/cue authority contract against disposable local Supabase"
"${PSQL[@]}" -f "$AUTHORITY_TEST"
log "Running show cue lock/recovery contract against disposable local Supabase"
"${PSQL[@]}" -f "$LOCK_TEST"
log "PASS: canonical show lifecycle/cue authority, race, retry, authorization and lock recovery contracts"
