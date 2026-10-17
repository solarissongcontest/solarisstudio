#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-media-consequences] %s\n' "$*"; }
fail() { printf '\n[v3-s5-media-consequences] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# Destructive fixtures. This rehearsal is deliberately local-only and must
# never acquire a hosted Supabase fallback.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
as_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set role authenticated; set request.jwt.claims='{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; set request.jwt.claim.role='authenticated'; $sql"
}
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set request.jwt.claim.role='service_role'; $1"; }
service_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set request.jwt.claim.role='service_role'; $1" >/dev/null; }
expect_denied() {
  local label="$1" sql="$2" output
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set role authenticated; set request.jwt.claim.role='authenticated'; $sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  rm -f "$output"
  log "PASS: $label rejected"
}

ORGANIZER_ID='00000000-0000-4000-8000-00000000a961'
EDITION_ID='00000000-0000-4000-8000-00000000e961'
LOGO_URL='https://media.invalid/s5-edition-logo.png'
ASSET_KEY="edition:${EDITION_ID}:logo"
REVIEWS="[{\"assetKey\":\"$ASSET_KEY\",\"assetType\":\"logo\",\"countryId\":null,\"entryId\":null,\"sourceFingerprint\":\"$LOGO_URL\",\"decision\":\"approved\"}]"

log "Seeding one canonical edition-logo media source and review authority"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$ORGANIZER_ID','authenticated','authenticated','s5-media-organizer@local.invalid',now(),now());
insert into public.editions(id,name,year,slug,edition_number,status,published,logo)
values ('$EDITION_ID','S5 Media Consequences',2026,'s5-media-consequences',9961,'active',false,'$LOGO_URL');
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$ORGANIZER_ID','entry.approve','$EDITION_ID');
"

log "Reviewing the real canonical media source through the compatibility command"
FIRST_RESULT="$(as_user "$ORGANIZER_ID" "select public.studio2_review_media_assets('$EDITION_ID'::uuid,'$REVIEWS'::jsonb,'Approve canonical edition logo')::text;")"
REVIEW_ID="$(python3 -c 'import json,sys; rows=json.loads(sys.argv[1]); print(rows[0]["id"])' "$FIRST_RESULT")"
[[ -n "$REVIEW_ID" ]] || fail "Media review returned no durable review id"
[[ "$(db_value "select count(*) from public.studio2_media_asset_reviews where id='$REVIEW_ID'::uuid and edition_id='$EDITION_ID'::uuid and asset_key='$ASSET_KEY' and decision='approved' and superseded_at is null;")" == '1' ]] || fail "Canonical media review evidence was not persisted"

OPERATION_ID="$(db_value "select operation_id::text from public.studio2_operation_receipts where command='media.review' and scope->>'editionId'='$EDITION_ID' order by created_at desc limit 1;")"
[[ -n "$OPERATION_ID" ]] || fail "Media review did not create an S2 operation receipt"
[[ "$(db_value "select status from public.studio2_operation_receipts where operation_id='$OPERATION_ID'::uuid;")" == 'succeeded' ]] || fail "Media review S2 receipt did not complete"
MEDIA_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='media.reviewed' and aggregate_id='$REVIEW_ID';")"
[[ -n "$MEDIA_EVENT" ]] || fail "Media review did not emit media.reviewed"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$MEDIA_EVENT'::uuid and consumer_key='media.tasks';")" == '1' ]] || fail "Media task consequence was not persisted"
[[ "$(db_value "select (payload ?| array['sourceFingerprint','reason','url','source'])::text from private.v3_domain_events where id='$MEDIA_EVENT'::uuid;")" == 'false' ]] || fail "Media DomainEvent payload leaked canonical source or review reason"

log "Retrying the identical semantic review replays instead of writing another review/event"
SECOND_RESULT="$(as_user "$ORGANIZER_ID" "select public.studio2_review_media_assets('$EDITION_ID'::uuid,'$REVIEWS'::jsonb,'Approve canonical edition logo')::text;")"
[[ "$SECOND_RESULT" == "$FIRST_RESULT" ]] || fail "Media review retry did not return the canonical original result"
[[ "$(db_value "select count(*) from public.studio2_media_asset_reviews where edition_id='$EDITION_ID'::uuid and asset_key='$ASSET_KEY';")" == '1' ]] || fail "Media review retry duplicated review evidence"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='media.reviewed';")" == '1' ]] || fail "Media review retry duplicated DomainEvents"

log "Claiming and completing the Media task consequence with a service lease"
CLAIMS="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('media.tasks','s5-media-worker',100,60);")"
printf '%s\n' "$CLAIMS" | grep -Fxq "$MEDIA_EVENT" || fail "media.tasks did not claim media.reviewed"
service_exec "select public.studio2_process_media_domain_event('$MEDIA_EVENT'::uuid,'media.tasks','s5-media-worker');"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$MEDIA_EVENT'::uuid and consumer_key='media.tasks' and result_metadata->>'effect'='media-task-reconciliation';")" == '1' ]] || fail "Media task consumer receipt is missing"
[[ "$(db_value "select status from private.v3_domain_event_outbox where event_id='$MEDIA_EVENT'::uuid and consumer_key='media.tasks';")" == 'completed' ]] || fail "Media consequence delivery did not complete"

log "Replay is idempotent and browser roles cannot run the Media consumer"
[[ "$(service_value "select public.studio2_process_media_domain_event('$MEDIA_EVENT'::uuid,'media.tasks','replay-worker')->>'replayed';")" == 'true' ]] || fail "Media consequence replay was not idempotent"
expect_denied "authenticated Media consequence processing" "select public.studio2_process_media_domain_event('$MEDIA_EVENT'::uuid,'media.tasks','browser-worker');"

log "System V3 S5 Media consequence rehearsal passed"
