#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-selection-secondary] %s\n' "$*"; }
fail() { printf '\n[v3-s5-selection-secondary] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
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

ACTOR_ID='00000000-0000-4000-8000-000000009961'
EDITION_ID='00000000-0000-4000-8000-00000000e961'
ROUND_ID='00000000-0000-4000-8000-00000000a961'
SUBMISSION_ID='00000000-0000-4000-8000-00000000f961'
NOOP_SUBMISSION_ID='00000000-0000-4000-8000-00000000f962'
NF_ID='00000000-0000-4000-8000-00000000c961'
ENTRY_ID='00000000-0000-4000-8000-00000000d961'
REVIEW_OPERATION_ID='00000000-0000-4000-8000-00000000b961'
SUBMIT_OPERATION_ID='00000000-0000-4000-8000-00000000b962'
RESTORE_OPERATION_ID='00000000-0000-4000-8000-00000000b963'
NOOP_OPERATION_ID='00000000-0000-4000-8000-00000000b964'

log "Seeding an accepted National Final candidate under one canonical submission"
db_exec "
insert into auth.users(
  id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  '$ACTOR_ID','authenticated','authenticated','v3-s5-selection-secondary@solaris.invalid',
  '{}'::jsonb,'{}'::jsonb,now(),now()
) on conflict (id) do nothing;

insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('$EDITION_ID','S5 Selection Secondary',2026,'s5-selection-secondary',9961,'active',false);
insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled)
values ('$ROUND_ID','$EDITION_ID','S5 Selection secondary round','open',now()-interval '1 hour',now()+interval '1 hour',true);
insert into public.submissions(
  id,edition_id,round_id,instagram_username,country,participating,selection_method,
  editing_allowed,browser_session_id,reviewed,edit_count
) values (
  '$SUBMISSION_ID','$EDITION_ID','$ROUND_ID','selection_secondary','Secondary Country',true,
  'national_final',true,'selection-secondary-session',true,0
);
insert into public.national_finals(id,submission_id,nf_name,expected_entry_count)
values ('$NF_ID','$SUBMISSION_ID','Secondary NF',1);
insert into public.national_final_entries(
  id,national_final_id,artist,song_title,song_url,position,review_status,removed
) values (
  '$ENTRY_ID','$NF_ID','Secondary Artist','Secondary Song','https://example.invalid/secondary',1,'pending',false
);
insert into public.studio2_capability_grants(user_id,capability,edition_id) values
  ('$ACTOR_ID','confirmation.manage','$EDITION_ID'),
  ('$ACTOR_ID','delegation.manage',null);
"

ENTRY_VERSION="$(db_value "select current_version_id::text from public.national_final_entries where id='$ENTRY_ID'::uuid;")"
REVIEW_VERSION="$(db_value "select version::text from public.studio2_confirmation_review_versions where submission_id='$SUBMISSION_ID'::uuid;")"
actor_value "$ACTOR_ID" "
select public.studio2_apply_confirmation_entry_review(
  'national_final','$ENTRY_ID'::uuid,'accepted','Secondary candidate accepted',
  '$REVIEW_OPERATION_ID'::uuid,'selection-secondary-review',$REVIEW_VERSION,
  '$ENTRY_VERSION'::uuid,null
)::text;
" >/dev/null
[[ "$(db_value "select review_status || ':' || (reviewed_version_id=current_version_id)::text from public.national_final_entries where id='$ENTRY_ID'::uuid;")" == 'accepted:true' ]] || fail "Secondary candidate was not exact-version accepted"

log "Capturing the immutable pre-edit snapshot used by canonical Confirmation edit"
SNAPSHOT_ID="$(db_value "
insert into public.submission_versions(submission_id,version,snapshot)
select
  submission.id,
  1,
  jsonb_build_object(
    'submission',to_jsonb(submission),
    'internal',null,
    'national_final',to_jsonb(final),
    'nf_entries',(
      select coalesce(jsonb_agg(to_jsonb(entry) order by entry.position),'[]'::jsonb)
      from public.national_final_entries entry
      where entry.national_final_id=final.id
    )
  )
from public.submissions submission
join public.national_finals final on final.submission_id=submission.id
where submission.id='$SUBMISSION_ID'::uuid
returning id::text;
")"
[[ -n "$SNAPSHOT_ID" ]] || fail "pre-edit Selection snapshot was not captured"
[[ "$(db_value "select coalesce(snapshot #>> '{national_final,winning_entry_id}','NULL') from public.submission_versions where id='$SNAPSHOT_ID'::uuid;")" == 'NULL' ]] || fail "pre-edit snapshot unexpectedly contained a winner"

log "Simulating the durable tail of a canonical Confirmation edit that selects an accepted winner"
db_exec "
update public.submissions
set edit_count=1,updated_at=now()
where id='$SUBMISSION_ID'::uuid;
update public.national_finals
set winning_entry_id='$ENTRY_ID'::uuid
where id='$NF_ID'::uuid;

insert into public.studio2_operation_receipts(
  operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,
  command,risk_class,scope,status
)
select
  '$SUBMIT_OPERATION_ID'::uuid,
  '$ACTOR_ID'::uuid,
  'selection-secondary-submit',
  '$SUBMIT_OPERATION_ID'::uuid,
  private.studio2_request_fingerprint(
    'confirmation.submit','R1',
    jsonb_build_object('roundId','$ROUND_ID'::uuid,'editionId','$EDITION_ID'::uuid),
    jsonb_build_object('fixture','selection-secondary-submit')
  ),
  'confirmation.submit','R1',
  jsonb_build_object('roundId','$ROUND_ID'::uuid,'editionId','$EDITION_ID'::uuid),
  'processing';
update public.studio2_operation_receipts
set status='succeeded',
    result=jsonb_build_object(
      'ok',true,
      'submissionId','$SUBMISSION_ID'::uuid,
      'roundId','$ROUND_ID'::uuid,
      'editionId','$EDITION_ID'::uuid,
      'editCount',1
    ),
    completed_at=now(),updated_at=now()
where operation_id='$SUBMIT_OPERATION_ID'::uuid;
"

SUBMIT_SELECTION_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$SUBMIT_OPERATION_ID'::uuid and event_type='selection.winner_changed' and aggregate_id='$NF_ID';")"
[[ -n "$SUBMIT_SELECTION_EVENT" ]] || fail "Confirmation edit winner delta did not emit selection.winner_changed"
[[ "$(db_value "select (payload->>'source') || ':' || (payload->>'action') || ':' || (payload->>'winnerEntryId') from private.v3_domain_events where id='$SUBMIT_SELECTION_EVENT'::uuid;")" == "confirmation.submit:select:$ENTRY_ID" ]] || fail "Confirmation edit Selection event has wrong provenance"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$SUBMIT_SELECTION_EVENT'::uuid;")" == '0' ]] || fail "Confirmation edit winner delta fabricated task work"

log "Unrelated succeeded receipt update cannot duplicate the submit winner fact"
db_exec "update public.studio2_operation_receipts set updated_at=updated_at where operation_id='$SUBMIT_OPERATION_ID'::uuid;"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$SUBMIT_OPERATION_ID'::uuid and event_type='selection.winner_changed' and aggregate_id='$NF_ID';")" == '1' ]] || fail "Confirmation submit replay duplicated winner fact"

log "Canonical historical restore preview binds exact current review version"
RESTORE_PREVIEW="$(actor_value "$ACTOR_ID" "
select (preview->>'expectedVersion') || ':' || coalesce(preview->>'currentWinnerEntryId','NULL')
from (
  select public.studio2_confirmation_restore_preview(
    '$SUBMISSION_ID'::uuid,
    '$SNAPSHOT_ID'::uuid
  ) as preview
) q;
")"
CURRENT_REVIEW_VERSION="$(db_value "select version::text from public.studio2_confirmation_review_versions where submission_id='$SUBMISSION_ID'::uuid;")"
[[ "$RESTORE_PREVIEW" == "$CURRENT_REVIEW_VERSION:$ENTRY_ID" ]] || fail "restore preview did not bind current winner/version state"

log "Canonical R2 restore clears winner and emits Selection fact from its own operation"
actor_value "$ACTOR_ID" "
select public.studio2_apply_confirmation_restore(
  '$SUBMISSION_ID'::uuid,
  '$SNAPSHOT_ID'::uuid,
  'Restore the pre-winner historical Selection state',
  '$RESTORE_OPERATION_ID'::uuid,
  'selection-secondary-restore',
  $CURRENT_REVIEW_VERSION,
  '$RESTORE_OPERATION_ID'::uuid
)::text;
" >/dev/null

[[ "$(db_value "select coalesce(winning_entry_id::text,'NULL') from public.national_finals where submission_id='$SUBMISSION_ID'::uuid;")" == 'NULL' ]] || fail "historical restore retained authoritative winner"
[[ "$(db_value "select review_status from public.national_final_entries where national_final_id=(select id from public.national_finals where submission_id='$SUBMISSION_ID'::uuid) limit 1;")" == 'pending' ]] || fail "historical restore retained candidate review authority"
RESTORE_SELECTION_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$RESTORE_OPERATION_ID'::uuid and event_type='selection.winner_changed' order by occurred_at desc limit 1;")"
[[ -n "$RESTORE_SELECTION_EVENT" ]] || fail "historical restore winner clear did not emit selection.winner_changed"
[[ "$(db_value "select (payload->>'source') || ':' || (payload->>'action') from private.v3_domain_events where id='$RESTORE_SELECTION_EVENT'::uuid;")" == 'entry.restore_version:clear' ]] || fail "restore Selection event has wrong source/action"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$RESTORE_SELECTION_EVENT'::uuid;")" == '0' ]] || fail "restore winner clear fabricated task work"
[[ "$(db_value "select command || ':' || risk_class || ':' || status from public.studio2_operation_receipts where operation_id='$RESTORE_OPERATION_ID'::uuid;")" == 'entry.restore_version:R2:succeeded' ]] || fail "historical restore lacks canonical R2 operation receipt"

log "Exact restore operation replay does not repeat restore or Selection fact"
actor_value "$ACTOR_ID" "
select public.studio2_apply_confirmation_restore(
  '$SUBMISSION_ID'::uuid,
  '$SNAPSHOT_ID'::uuid,
  'Restore the pre-winner historical Selection state',
  '$RESTORE_OPERATION_ID'::uuid,
  'selection-secondary-restore',
  $CURRENT_REVIEW_VERSION,
  '$RESTORE_OPERATION_ID'::uuid
)::text;
" >/dev/null
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$RESTORE_OPERATION_ID'::uuid and event_type='selection.winner_changed';")" == '1' ]] || fail "restore replay duplicated Selection winner fact"

log "Legacy restore implementation is private while compatibility entrypoint remains canonical"
[[ "$(db_value "select has_function_privilege('authenticated','public.admin_restore_confirmation_version_legacy_impl(uuid,uuid,text)','EXECUTE');")" == 'f' ]] || fail "legacy restore implementation remains browser callable"
[[ "$(db_value "select has_function_privilege('authenticated','public.admin_restore_confirmation_version(uuid,uuid,text)','EXECUTE');")" == 't' ]] || fail "restore compatibility adapter is not available"

log "Confirmation submit without a winner transition stays outside Selection"
db_exec "
insert into public.submissions(
  id,edition_id,round_id,instagram_username,country,participating,selection_method,
  editing_allowed,browser_session_id,reviewed,edit_count
) values (
  '$NOOP_SUBMISSION_ID','$EDITION_ID','$ROUND_ID','selection_secondary_noop','Noop Country',true,
  'internal',true,'selection-secondary-noop-session',true,0
);

insert into public.studio2_operation_receipts(
  operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,
  command,risk_class,scope,status
)
select
  '$NOOP_OPERATION_ID'::uuid,
  '$ACTOR_ID'::uuid,
  'selection-secondary-noop-submit',
  '$NOOP_OPERATION_ID'::uuid,
  private.studio2_request_fingerprint(
    'confirmation.submit','R1',
    jsonb_build_object('roundId','$ROUND_ID'::uuid,'editionId','$EDITION_ID'::uuid),
    jsonb_build_object('fixture','selection-secondary-noop-submit')
  ),
  'confirmation.submit','R1',
  jsonb_build_object('roundId','$ROUND_ID'::uuid,'editionId','$EDITION_ID'::uuid),
  'processing';
update public.studio2_operation_receipts
set status='succeeded',
    result=jsonb_build_object(
      'ok',true,
      'submissionId','$NOOP_SUBMISSION_ID'::uuid,
      'roundId','$ROUND_ID'::uuid,
      'editionId','$EDITION_ID'::uuid,
      'editCount',0
    ),
    completed_at=now(),updated_at=now()
where operation_id='$NOOP_OPERATION_ID'::uuid;
"
[[ "$(db_value "select count(*) from public.studio2_confirmation_review_versions where submission_id='$NOOP_SUBMISSION_ID'::uuid;")" == '0' ]] || fail "non-Selection submit fabricated Selection review state"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$NOOP_OPERATION_ID'::uuid and event_type like 'selection.%';")" == '0' ]] || fail "non-Selection submit fabricated a Selection event"

log "System V3 S5 secondary Selection winner rehearsal passed"
