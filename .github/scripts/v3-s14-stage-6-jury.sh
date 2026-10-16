#!/usr/bin/env bash
set -euo pipefail

run_s14_stage_6_jury() {
  log "Stage 6/10: governed Jury window, draft conflicts, hostile ballots, receipts and missing-ballot evidence"

  # Build a bounded Grand Final from the same edition/countries already used by
  # Stages 1-5. Multiple show participation is canonical contest structure, so
  # the semi-final rows remain untouched and historically verifiable.
  db_exec "
update public.shows
set voting_config='{"juryEnabled":true,"allowSelfVote":false,"juryPoints":[12,10,8]}'::jsonb,
    published=false,
    updated_at=now()
where id='$FINAL_ID'::uuid;

delete from public.participants where show_id='$FINAL_ID'::uuid;
insert into public.participants(id,edition_id,show_id,country_id,artist,song,running_order,participation_status)
select
  ('14000000-0000-4006-8000-' || lpad(i::text,12,'0'))::uuid,
  '$EDITION_ID'::uuid,
  '$FINAL_ID'::uuid,
  $country_uuid_sql,
  'S14 Final Artist ' || lpad(i::text,2,'0'),
  'S14 Final Song ' || lpad(i::text,2,'0'),
  i,
  'confirmed'
from generate_series(1,12) i;

delete from public.voters where show_id='$FINAL_ID'::uuid;
insert into public.voters(edition_id,show_id,country_id,name,sort_order)
select '$EDITION_ID'::uuid, '$FINAL_ID'::uuid, $country_uuid_sql,
       'S14 Jury ' || lpad(i::text,2,'0'), i
from generate_series(1,3) i;
"

  [[ "$(db_scalar "select count(*) from public.participants where show_id='$FINAL_ID'::uuid and participation_status='confirmed';")" == "12" ]] || fail "Jury stage did not create the bounded 12-entry final"
  [[ "$(db_scalar "select count(*) from public.voters where show_id='$FINAL_ID'::uuid;")" == "3" ]] || fail "Jury stage did not create the three-delegation jury roster"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_jury_window_change_preview "{\"p_show_id\":\"$FINAL_ID\",\"p_status\":\"open\"}"
  expect_success "Jury open preflight"
  expect_json "Jury open preflight risk" riskClass R2
  jury_open_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
  JURY_OPEN_OPERATION_ID='14000000-0000-4006-8001-000000000001'
  rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_jury_voting_status "{\"p_show_id\":\"$FINAL_ID\",\"p_status\":\"open\",\"p_operation_id\":\"$JURY_OPEN_OPERATION_ID\",\"p_idempotency_key\":\"s14-jury-open\",\"p_expected_version\":$jury_open_version}"
  expect_success "governed Jury open"
  expect_json "Jury opened" status open
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$JURY_OPEN_OPERATION_ID'::uuid and event_type='jury.opened';")" == "1" ]] || fail "governed Jury open did not emit jury.opened"

  sign_in 's14-hod-01@solaris.invalid'; HOD1_TOKEN="$LAST_TOKEN"
  HOD1_ID="$(db_scalar "select id from auth.users where lower(email)='s14-hod-01@solaris.invalid';")"
  sign_in 's14-hod-02@solaris.invalid'; HOD2_TOKEN="$LAST_TOKEN"
  HOD2_ID="$(db_scalar "select id from auth.users where lower(email)='s14-hod-02@solaris.invalid';")"
  sign_in 's14-hod-03@solaris.invalid'; HOD3_TOKEN="$LAST_TOKEN"
  HOD3_ID="$(db_scalar "select id from auth.users where lower(email)='s14-hod-03@solaris.invalid';")"
  [[ -n "$HOD1_ID" && -n "$HOD2_ID" && -n "$HOD3_ID" ]] || fail "Jury HOD identity resolution failed"

  COUNTRY_1='14000000-0000-4000-8000-000000000001'
  COUNTRY_2='14000000-0000-4000-8000-000000000002'
  COUNTRY_3='14000000-0000-4000-8000-000000000003'
  COUNTRY_4='14000000-0000-4000-8000-000000000004'
  COUNTRY_5='14000000-0000-4000-8000-000000000005'
  COUNTRY_6='14000000-0000-4000-8000-000000000006'

  log "Proving multi-device draft CAS before any final ballot exists"
  rpc_request "$HOD3_TOKEN" v3_save_jury_draft "{\"_show_id\":\"$FINAL_ID\",\"_payload\":{\"selections\":[\"$COUNTRY_4\",\"$COUNTRY_5\",\"$COUNTRY_6\"]},\"_expected_revision\":0,\"_device_id\":\"s14-jury-device-a\",\"_session_id\":\"s14-jury-session-a\"}"
  expect_success "initial Jury draft"
  expect_json "initial Jury draft accepted" ok true
  expect_json "initial Jury draft revision" server_revision 1
  rpc_request "$HOD3_TOKEN" v3_save_jury_draft "{\"_show_id\":\"$FINAL_ID\",\"_payload\":{\"selections\":[\"$COUNTRY_6\",\"$COUNTRY_5\",\"$COUNTRY_4\"]},\"_expected_revision\":0,\"_device_id\":\"s14-jury-device-b\",\"_session_id\":\"s14-jury-session-b\"}"
  expect_success "stale second-device Jury draft"
  expect_json "multi-device conflict surfaced" conflict true
  expect_json "multi-device canonical revision preserved" server_revision 1

  # Hostile own-country ballot: integrity preflight deliberately matches the
  # submitted map so the canonical ballot authority, not a preflight mismatch,
  # must reject the self-vote.
  SELF_PREFLIGHT='14000000-0000-4006-8002-000000000001'
  db_exec "insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,channel,canonical_edition_id,show_id,account_user_id,expires_at)
values ('$SELF_PREFLIGHT',null,'s14-hod-01','AAX',jsonb_build_object('$COUNTRY_1',12,'$COUNTRY_4',10,'$COUNTRY_5',8),'jury','$EDITION_ID','$FINAL_ID','$HOD1_ID',now()+interval '20 minutes');"
  rpc_request "$HOD1_TOKEN" v3_submit_jury_ballot "{\"_show_id\":\"$FINAL_ID\",\"_entries\":[{\"target_country_id\":\"$COUNTRY_1\",\"points\":12},{\"target_country_id\":\"$COUNTRY_4\",\"points\":10},{\"target_country_id\":\"$COUNTRY_5\",\"points\":8}],\"_preflight_id\":\"$SELF_PREFLIGHT\",\"_operation_id\":\"14000000-0000-4006-8003-000000000001\",\"_request_hash\":\"ignored-by-authority\"}"
  expect_failure "own-country Jury ballot"
  [[ "$HTTP_BODY" == *"You cannot vote for your own country"* ]] || fail "own-country Jury rejection lost its canonical reason: $HTTP_BODY"

  # Invalid score scale is rejected before any canonical ballot exists.
  INVALID_PREFLIGHT='14000000-0000-4006-8002-000000000002'
  db_exec "insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,channel,canonical_edition_id,show_id,account_user_id,expires_at)
values ('$INVALID_PREFLIGHT',null,'s14-hod-02','ABX',jsonb_build_object('$COUNTRY_4',12,'$COUNTRY_5',10),'jury','$EDITION_ID','$FINAL_ID','$HOD2_ID',now()+interval '20 minutes');"
  rpc_request "$HOD2_TOKEN" v3_submit_jury_ballot "{\"_show_id\":\"$FINAL_ID\",\"_entries\":[{\"target_country_id\":\"$COUNTRY_4\",\"points\":12},{\"target_country_id\":\"$COUNTRY_5\",\"points\":10}],\"_preflight_id\":\"$INVALID_PREFLIGHT\",\"_operation_id\":\"14000000-0000-4006-8003-000000000002\",\"_request_hash\":\"ignored-by-authority\"}"
  expect_failure "incomplete Jury score scale"
  [[ "$HTTP_BODY" == *"Use every jury score exactly once"* ]] || fail "invalid Jury score-scale rejection lost its canonical reason: $HTTP_BODY"

  BALLOT='[{"target_country_id":"14000000-0000-4000-8000-000000000004","points":12},{"target_country_id":"14000000-0000-4000-8000-000000000005","points":10},{"target_country_id":"14000000-0000-4000-8000-000000000006","points":8}]'
  for voter_index in 1 2; do
    if [[ "$voter_index" == "1" ]]; then
      voter_token="$HOD1_TOKEN"; voter_id="$HOD1_ID"; voter_code='AAX'
    else
      voter_token="$HOD2_TOKEN"; voter_id="$HOD2_ID"; voter_code='ABX'
    fi
    preflight_id="14000000-0000-4006-8002-$(printf '%012d' $((100 + voter_index)))"
    operation_id="14000000-0000-4006-8003-$(printf '%012d' $((100 + voter_index)))"
    db_exec "insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,channel,canonical_edition_id,show_id,account_user_id,expires_at)
values ('$preflight_id',null,'s14-jury-valid-$voter_index','$voter_code',jsonb_build_object('$COUNTRY_4',12,'$COUNTRY_5',10,'$COUNTRY_6',8),'jury','$EDITION_ID','$FINAL_ID','$voter_id',now()+interval '20 minutes');"
    submit_body="{\"_show_id\":\"$FINAL_ID\",\"_entries\":$BALLOT,\"_preflight_id\":\"$preflight_id\",\"_operation_id\":\"$operation_id\",\"_request_hash\":\"caller-hash-is-not-authority\"}"
    rpc_request "$voter_token" v3_submit_jury_ballot "$submit_body"
    expect_success "Jury ballot $voter_index"
    expect_json "Jury ballot $voter_index accepted" ok true
    expect_json "Jury ballot $voter_index server receipt" receipt.authority authoritative_server
    ballot_id="$(printf '%s' "$HTTP_BODY" | json_value receipt.ballot_submission_id)"
    receipt_id="$(printf '%s' "$HTTP_BODY" | json_value receipt.receipt_id)"
    [[ -n "$ballot_id" && -n "$receipt_id" ]] || fail "Jury ballot $voter_index returned incomplete receipt evidence"

    if [[ "$voter_index" == "1" ]]; then
      rpc_request "$voter_token" v3_submit_jury_ballot "$submit_body"
      expect_success "exact Jury ballot replay"
      expect_json "Jury ballot replay explicit" receipt.replayed true
      expect_json "Jury ballot replay stable receipt" receipt.receipt_id "$receipt_id"
      rpc_request "$voter_token" v3_reconcile_jury_submission "{\"_operation_id\":\"$operation_id\"}"
      expect_success "Jury lost-response reconciliation"
      expect_json "Jury reconciliation found committed operation" found true
      expect_json "Jury reconciliation stable receipt" receipt.receipt_id "$receipt_id"
    fi
  done

  [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$FINAL_ID'::uuid and status='submitted';")" == "2" ]] || fail "Jury stage expected exactly two submitted ballots and one intentional missing ballot"
  [[ "$(db_scalar "select count(*) from public.voters v where v.show_id='$FINAL_ID'::uuid and not exists (select 1 from public.jury_ballot_submissions b where b.show_id=v.show_id and b.voter_country_id=v.country_id and b.status='submitted');")" == "1" ]] || fail "Jury stage did not preserve exactly one missing roster ballot"
  [[ "$(db_scalar "select count(*) from (select show_id,voter_country_id,count(*) from public.jury_ballot_submissions where show_id='$FINAL_ID'::uuid and status='submitted' group by show_id,voter_country_id having count(*)>1) duplicate_ballots;")" == "0" ]] || fail "Jury final-ballot uniqueness invariant failed"
  log "S14_INVARIANT_JURY_COMPLETE"

  # Close through the same governed operation contract. The intentionally
  # missing third ballot remains durable readiness evidence instead of being
  # fabricated into a completed vote.
  sign_in 's14-organizer-a@solaris.invalid'; ORGANIZER_A_TOKEN="$LAST_TOKEN"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_jury_window_change_preview "{\"p_show_id\":\"$FINAL_ID\",\"p_status\":\"closed\"}"
  expect_success "Jury close preflight"
  jury_close_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
  JURY_CLOSE_OPERATION_ID='14000000-0000-4006-8001-000000000002'
  rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_jury_voting_status "{\"p_show_id\":\"$FINAL_ID\",\"p_status\":\"closed\",\"p_operation_id\":\"$JURY_CLOSE_OPERATION_ID\",\"p_idempotency_key\":\"s14-jury-close\",\"p_expected_version\":$jury_close_version}"
  expect_success "governed Jury close"
  expect_json "Jury closed" status closed
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$JURY_CLOSE_OPERATION_ID'::uuid and event_type='jury.closed';")" == "1" ]] || fail "governed Jury close did not emit jury.closed"
  [[ "$(db_scalar "select count(*) from public.jury_votes where show_id='$FINAL_ID'::uuid;")" == "6" ]] || fail "two accepted Jury ballots did not persist exactly six score rows"

  log "S14_STAGE_6_JURY_COMPLETE"
}
