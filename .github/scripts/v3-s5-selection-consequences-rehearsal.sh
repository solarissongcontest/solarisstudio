#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-selection] %s\n' "$*"; }
fail() { printf '\n[v3-s5-selection] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"; }
service_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null; }
actor_value() {
  local actor_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    begin;
    select set_config('request.jwt.claim.sub', '$actor_id', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    $sql
    commit;
  " | tail -n 1
}
actor_expect_failure() {
  local actor_id="$1" label="$2" sql="$3"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
    begin;
    select set_config('request.jwt.claim.sub', '$actor_id', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    $sql
    commit;
  " >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  log "PASS: $label rejected"
}

ACTOR_ID='00000000-0000-4000-8000-000000009951'
OWNER_ID='00000000-0000-4000-8000-000000009952'
COUNTRY_ID='00000000-0000-4000-8000-00000000c951'
EDITION_ID='00000000-0000-4000-8000-00000000e951'
ROUND_ID='00000000-0000-4000-8000-00000000a951'
SUBMISSION_ID='00000000-0000-4000-8000-00000000f951'
NF_ID='00000000-0000-4000-8000-00000000c952'
ENTRY_ID='00000000-0000-4000-8000-00000000d951'
MANUAL_NF_ID='00000000-0000-4000-8000-00000000c953'
MANUAL_ENTRY_ID='00000000-0000-4000-8000-00000000d953'
REVIEW_OPERATION_ID='00000000-0000-4000-8000-00000000b951'
WINNER_OPERATION_ID='00000000-0000-4000-8000-00000000b952'
CLEAR_OPERATION_ID='00000000-0000-4000-8000-00000000b953'
CORRELATION_ID='00000000-0000-4000-8000-00000000c954'

log "Seeding one pending Confirmation NF, its country owner and one manual historical NF"
db_exec "
insert into auth.users(
  id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
(
  '$ACTOR_ID','authenticated','authenticated','v3-s5-selection-organizer@solaris.invalid',
  '{}'::jsonb,'{}'::jsonb,now(),now()
),
(
  '$OWNER_ID','authenticated','authenticated','v3-s5-selection-owner@solaris.invalid',
  '{}'::jsonb,'{}'::jsonb,now(),now()
)
on conflict (id) do nothing;

insert into public.countries(id,name,short_code)
values ('$COUNTRY_ID','Selection Country','SEL');
insert into public.country_accounts(user_id,country_id,status,display_name)
values ('$OWNER_ID','$COUNTRY_ID','active','Selection Owner');

insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('$EDITION_ID','S5 Selection',2026,'s5-selection',9951,'active',false);
insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled)
values ('$ROUND_ID','$EDITION_ID','S5 Selection round','open',now()-interval '1 hour',now()+interval '1 hour',true);
insert into public.submissions(
  id,edition_id,round_id,instagram_username,country,country_account,has_country_account,
  participating,selection_method,editing_allowed,browser_session_id,reviewed
) values (
  '$SUBMISSION_ID','$EDITION_ID','$ROUND_ID','s5_selection','Selection Country','SEL',true,
  true,'national_final',false,'s5-selection-session',true
);
insert into public.national_finals(id,submission_id,nf_name,expected_entry_count)
values ('$NF_ID','$SUBMISSION_ID','S5 National Final',1);
insert into public.national_final_entries(
  id,national_final_id,artist,song_title,song_url,position,review_status,removed
) values (
  '$ENTRY_ID','$NF_ID','Selection Artist','Selection Song','https://example.invalid/selection',1,'pending',false
);

insert into public.national_finals(
  id,submission_id,country_id,edition_id,nf_name,expected_entry_count,source
) values (
  '$MANUAL_NF_ID',null,'$COUNTRY_ID','$EDITION_ID','Historical Manual NF',1,'manual'
);
insert into public.national_final_entries(
  id,national_final_id,artist,song_title,position,review_status,removed
) values (
  '$MANUAL_ENTRY_ID','$MANUAL_NF_ID','Historical Artist','Historical Song',1,'accepted',false
);

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$ACTOR_ID','confirmation.manage','$EDITION_ID');
select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);
"

ENTRY_VERSION="$(db_value "select current_version_id::text from public.national_final_entries where id='$ENTRY_ID'::uuid;")"
EXPECTED_VERSION="$(db_value "select version::text from public.studio2_confirmation_review_versions where submission_id='$SUBMISSION_ID'::uuid;")"
[[ -n "$ENTRY_VERSION" && -n "$EXPECTED_VERSION" ]] || fail "Selection fixture lacks canonical Entry/review version"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where source_key='confirmation-review:$SUBMISSION_ID' and state='open';")" == '1' ]] || fail "pending National Final candidate did not create canonical review task"

log "Canonical NF Entry review emits both Entry and Selection facts"
actor_value "$ACTOR_ID" "
select public.studio2_apply_confirmation_entry_review(
  'national_final',
  '$ENTRY_ID'::uuid,
  'accepted',
  'Verified exact current NF candidate',
  '$REVIEW_OPERATION_ID'::uuid,
  's5-selection-review',
  $EXPECTED_VERSION,
  '$ENTRY_VERSION'::uuid,
  '$CORRELATION_ID'::uuid
)::text;
" >/dev/null

SELECTION_REVIEW_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$REVIEW_OPERATION_ID'::uuid and event_type='selection.reviewed';")"
ENTRY_REVIEW_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$REVIEW_OPERATION_ID'::uuid and event_type='entry.reviewed';")"
[[ -n "$SELECTION_REVIEW_EVENT" ]] || fail "selection.reviewed was not emitted"
[[ -n "$ENTRY_REVIEW_EVENT" ]] || fail "same NF review operation lost its Entry-domain fact"
[[ "$(db_value "select count(distinct operation_id) from private.v3_domain_events where id in ('$SELECTION_REVIEW_EVENT'::uuid,'$ENTRY_REVIEW_EVENT'::uuid);")" == '1' ]] || fail "Entry and Selection facts did not share one canonical operation"
[[ "$(db_value "select payload->>'nationalFinalId' from private.v3_domain_events where id='$SELECTION_REVIEW_EVENT'::uuid;")" == "$NF_ID" ]] || fail "selection.reviewed lost National Final provenance"
[[ "$(db_value "select payload->>'entryVersionId' from private.v3_domain_events where id='$SELECTION_REVIEW_EVENT'::uuid;")" == "$ENTRY_VERSION" ]] || fail "selection.reviewed lost exact Entry revision"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$SELECTION_REVIEW_EVENT'::uuid and consumer_key='selection.tasks';")" == '1' ]] || fail "selection.reviewed task delivery is missing"

log "Selection task consequence reuses canonical Organizer task reconciliation"
CLAIMED="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('selection.tasks','selection-worker',20,60);")"
printf '%s\n' "$CLAIMED" | grep -Fxq "$SELECTION_REVIEW_EVENT" || fail "selection.tasks could not claim selection.reviewed"
service_exec "select public.studio2_process_selection_domain_event('$SELECTION_REVIEW_EVENT'::uuid,'selection.tasks','selection-worker');"
[[ "$(db_value "select result_metadata->>'effect' from private.v3_domain_event_consumer_receipts where event_id='$SELECTION_REVIEW_EVENT'::uuid and consumer_key='selection.tasks';")" == 'selection-task-reconciliation' ]] || fail "Selection task consequence receipt is missing"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where source_key='confirmation-review:$SUBMISSION_ID' and state='open';")" == '0' ]] || fail "accepted NF candidate did not resolve canonical review task"
[[ "$(service_value "select public.studio2_process_selection_domain_event('$SELECTION_REVIEW_EVENT'::uuid,'selection.tasks','selection-replay-worker')->>'replayed';")" == 'true' ]] || fail "Selection task consequence replay was not idempotent"

log "Exact review-command replay does not duplicate Selection facts"
actor_value "$ACTOR_ID" "
select public.studio2_apply_confirmation_entry_review(
  'national_final',
  '$ENTRY_ID'::uuid,
  'accepted',
  'Verified exact current NF candidate',
  '$REVIEW_OPERATION_ID'::uuid,
  's5-selection-review',
  $EXPECTED_VERSION,
  '$ENTRY_VERSION'::uuid,
  '$CORRELATION_ID'::uuid
)::text;
" >/dev/null
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$REVIEW_OPERATION_ID'::uuid and event_type='selection.reviewed';")" == '1' ]] || fail "review replay duplicated selection.reviewed"

log "Country owner reaches the same canonical winner preview without confirmation.manage"
OWNER_PREVIEW="$(actor_value "$OWNER_ID" "
select (preview->>'expectedVersion') || ':' || (preview->>'currentVersionId')
from (
  select public.studio2_confirmation_winner_change_preview(
    '$NF_ID'::uuid,
    'select',
    '$ENTRY_ID'::uuid
  ) as preview
) q;
")"
CURRENT_WINNER_VERSION="$(db_value "select version::text from public.studio2_confirmation_review_versions where submission_id='$SUBMISSION_ID'::uuid;")"
[[ "$OWNER_PREVIEW" == "$CURRENT_WINNER_VERSION:$ENTRY_VERSION" ]] || fail "country owner preview did not resolve canonical winner state"

log "Legacy country winner writer rejects Confirmation-backed National Finals"
actor_expect_failure "$OWNER_ID" "legacy Confirmation-backed country winner writer" "
select public.set_country_national_final_winner(
  '$COUNTRY_ID'::uuid,
  '$NF_ID'::uuid,
  '$ENTRY_ID'::uuid
);
"

log "Manual historical National Final winner editing remains available"
MANUAL_RESULT="$(actor_value "$OWNER_ID" "
select public.set_country_national_final_winner(
  '$COUNTRY_ID'::uuid,
  '$MANUAL_NF_ID'::uuid,
  '$MANUAL_ENTRY_ID'::uuid
)->>'winning_entry_id';
")"
[[ "$MANUAL_RESULT" == "$MANUAL_ENTRY_ID" ]] || fail "manual historical winner writer was broken by Selection cutover"

log "Legacy same-database Confirmation sync writer is no longer executable"
[[ "$(db_value "select has_function_privilege('authenticated','public.set_confirmation_national_final_winner_from_solaris(uuid,uuid)','EXECUTE');")" == 'f' ]] || fail "legacy Confirmation winner sync writer remains callable"
[[ "$(db_value "select has_function_privilege('service_role','public.set_confirmation_national_final_winner_from_solaris(uuid,uuid)','EXECUTE');")" == 'f' ]] || fail "legacy Confirmation winner sync writer remains service-role callable"

log "Country-owner winner selection is exact-version bound and emits winner_changed"
WINNER_OPERATION_RESULT="$(actor_value "$OWNER_ID" "
select public.studio2_apply_confirmation_winner_change(
  '$NF_ID'::uuid,
  'select',
  '$ENTRY_ID'::uuid,
  'Country account updated the National Final winner.',
  '$WINNER_OPERATION_ID'::uuid,
  's5-selection-owner-winner',
  $CURRENT_WINNER_VERSION,
  '$ENTRY_VERSION'::uuid
)::text;
")"
[[ "$WINNER_OPERATION_RESULT" == *"$WINNER_OPERATION_ID"* ]] || fail "country owner canonical winner operation did not complete"

WINNER_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$WINNER_OPERATION_ID'::uuid and event_type='selection.winner_changed';")"
[[ -n "$WINNER_EVENT" ]] || fail "winner select did not emit selection.winner_changed"
[[ "$(db_value "select aggregate_type || ':' || aggregate_id from private.v3_domain_events where id='$WINNER_EVENT'::uuid;")" == "national_selection:$NF_ID" ]] || fail "winner event aggregate provenance is wrong"
[[ "$(db_value "select payload->>'winnerEntryId' from private.v3_domain_events where id='$WINNER_EVENT'::uuid;")" == "$ENTRY_ID" ]] || fail "winner event lost selected Entry identity"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$WINNER_EVENT'::uuid;")" == '0' ]] || fail "winner change fabricated Selection task work"

log "Repeated selected-winner preview reports alreadyApplied so the client can no-op"
ALREADY_APPLIED="$(actor_value "$OWNER_ID" "
select public.studio2_confirmation_winner_change_preview(
  '$NF_ID'::uuid,
  'select',
  '$ENTRY_ID'::uuid
)->>'alreadyApplied';
")"
[[ "$ALREADY_APPLIED" == 'true' ]] || fail "already-selected winner preview did not expose replay-safe no-op state"

log "Country-owner winner clear records authoritative null winner state and advances aggregate version"
CLEAR_EXPECTED_VERSION="$(db_value "select version::text from public.studio2_confirmation_review_versions where submission_id='$SUBMISSION_ID'::uuid;")"
actor_value "$OWNER_ID" "
select public.studio2_apply_confirmation_winner_change(
  '$NF_ID'::uuid,
  'clear',
  null,
  'Country account cleared the National Final winner.',
  '$CLEAR_OPERATION_ID'::uuid,
  's5-selection-owner-clear',
  $CLEAR_EXPECTED_VERSION,
  null
)::text;
" >/dev/null

CLEAR_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$CLEAR_OPERATION_ID'::uuid and event_type='selection.winner_changed';")"
[[ -n "$CLEAR_EVENT" ]] || fail "winner clear did not emit selection.winner_changed"
[[ "$(db_value "select coalesce(payload->>'winnerEntryId','NULL') from private.v3_domain_events where id='$CLEAR_EVENT'::uuid;")" == 'NULL' ]] || fail "winner clear event did not record authoritative null winner"
SELECT_VERSION="$(db_value "select aggregate_version from private.v3_domain_events where id='$WINNER_EVENT'::uuid;")"
CLEAR_VERSION="$(db_value "select aggregate_version from private.v3_domain_events where id='$CLEAR_EVENT'::uuid;")"
(( CLEAR_VERSION > SELECT_VERSION )) || fail "winner clear did not advance Selection aggregate version"

log "System V3 S5 Selection consequence rehearsal passed"
