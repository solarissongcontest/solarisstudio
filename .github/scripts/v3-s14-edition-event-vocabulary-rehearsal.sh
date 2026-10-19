#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-edition-events] %s\n' "$*"; }
fail() { printf '\n[v3-s14-edition-events] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This verifier inspects the local fixtures created by
# v3-s14-archive-system-rehearsal.sh. Never let it become a hosted DB probe.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

export DATABASE_URL="$DB_URL"
export SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL"
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }

EDITION_ID='18900000-0000-4000-8000-000000000001'
RESULTS_OPERATION='18900000-0000-4000-8000-000000000006'
POST_OPERATION='18900000-0000-4000-8000-000000000007'
ARCHIVE_OPERATION='18900000-0000-4000-8000-000000000008'

log "Verify canonical S4 edition transition vocabulary"
CANONICAL_COUNT="$(db_value "
select count(*)
from private.v3_domain_events
where edition_id='$EDITION_ID'::uuid
  and event_type='edition.transitioned'
  and operation_id in (
    '$RESULTS_OPERATION'::uuid,
    '$POST_OPERATION'::uuid,
    '$ARCHIVE_OPERATION'::uuid
  );
")"
[[ "$CANONICAL_COUNT" == '3' ]] || fail "expected 3 canonical edition.transitioned events, got $CANONICAL_COUNT"

OLD_CANONICAL_COUNT="$(db_value "
select count(*)
from private.v3_domain_events
where edition_id='$EDITION_ID'::uuid
  and event_type='edition.state_changed'
  and operation_id in (
    '$RESULTS_OPERATION'::uuid,
    '$POST_OPERATION'::uuid,
    '$ARCHIVE_OPERATION'::uuid
  );
")"
[[ "$OLD_CANONICAL_COUNT" == '0' ]] || fail "legacy edition.state_changed leaked into canonical S4 DomainEvents"

log "Verify legacy contest audit vocabulary remains intact"
LEGACY_COUNT="$(db_value "
select count(*)
from public.studio2_contest_events
where edition_id='$EDITION_ID'::uuid
  and type='edition.state_changed'
  and payload->>'operationId' in (
    '$RESULTS_OPERATION',
    '$POST_OPERATION',
    '$ARCHIVE_OPERATION'
  );
")"
[[ "$LEGACY_COUNT" == '3' ]] || fail "expected 3 legacy edition.state_changed audit events, got $LEGACY_COUNT"

[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$ARCHIVE_OPERATION'::uuid and event_type='edition.archived';")" == '1' ]] || fail "semantic edition.archived event is missing"

log "S14 edition transition event vocabulary rehearsal passed"
