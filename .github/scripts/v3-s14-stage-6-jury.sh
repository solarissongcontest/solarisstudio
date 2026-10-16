#!/usr/bin/env bash
set -euo pipefail

jury_ballot_for_country() {
  local voter_country_id="$1"
  db_scalar "
with ranked as (
  select
    participant.country_id,
    row_number() over (order by participant.running_order, participant.country_id) as rn
  from public.participants participant
  where participant.show_id='$SEMI_ONE_ID'::uuid
    and (participant.participation_status is null or participant.participation_status='confirmed')
    and participant.country_id <> '$voter_country_id'::uuid
  order by participant.running_order, participant.country_id
  limit 10
)
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'target_country_id', country_id,
      'points', (array[12,10,8,7,6,5,4,3,2,1])[rn::integer]
    ) order by rn
  ),
  '[]'::jsonb
)::text
from ranked;
"
}

create_jury_preflight_fixture() {
  local preflight_id="$1" user_id="$2" voter_country_id="$3" username="$4" ballot="$5"
  local country_code ballot_map
  country_code="$(db_scalar "select short_code from public.countries where id='$voter_country_id'::uuid;")"
  ballot_map="$(db_scalar "select coalesce(jsonb_object_agg(entry->>'target_country_id',(entry->>'points')::integer),'{}'::jsonb)::text from jsonb_array_elements('$ballot'::jsonb) entry;")"
  [[ -n "$country_code" && "$ballot_map" != "{}" ]] || fail "jury preflight fixture lacks canonical ballot identity"
  db_exec "
insert into televoting.vote_preflight_checks(
  id, round_id, username_normalized, country_code, ballot_map, channel,
  canonical_edition_id, show_id, account_user_id, expires_at
) values (
  '$preflight_id'::uuid, null, lower('$username'), '$country_code', '$ballot_map'::jsonb, 'jury',
  '$EDITION_ID'::uuid, '$SEMI_ONE_ID'::uuid, '$user_id'::uuid, now()+interval '20 minutes'
)
on conflict (id) do update set
  username_normalized=excluded.username_normalized,
  country_code=excluded.country_code,
  ballot_map=excluded.ballot_map,
  channel='jury',
  canonical_edition_id=excluded.canonical_edition_id,
  show_id=excluded.show_id,
  account_user_id=excluded.account_user_id,
  submitted_at=null,
  expires_at=excluded.expires_at;
"
}

apply_jury_window_status() {
  local status="$1" operation_id="$2" idempotency_key="$3"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_jury_window_change_preview "{\"p_show_id\":\"$SEMI_ONE_ID\",\"p_status\":\"$status\"}"
  expect_success "Jury window $status preview"
  local expected_version
  expected_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
  [[ -n "$expected_version" ]] || fail "Jury window $status preview returned no version"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_jury_voting_status "{\"p_show_id\":\"$SEMI_ONE_ID\",\"p_status\":\"$status\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_version\":$expected_version}"
  expect_success "governed Jury window $status"
  expect_json "Jury window $status result" status "$status"
}

run_s14_stage_6_jury() {
  log "Stage 6/10: governed Jury window, complete ballots, hostile cases, review and DNV"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  JURY_OPEN_OPERATION='14000000-0000-4006-8000-000000000001'
  JURY_CLOSE_OPERATION='14000000-0000-4006-8000-000000000002'
  apply_jury_window_status open "$JURY_OPEN_OPERATION" 's14-jury-open-semi-one'

  [[ "$(db_scalar "select status from public.jury_voting_windows where show_id='$SEMI_ONE_ID'::uuid;")" == "open" ]] || fail "governed Jury window did not open"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$JURY_OPEN_OPERATION'::uuid and event_type='jury.opened' and show_id='$SEMI_ONE_ID'::uuid;")" == "1" ]] || fail "Jury open did not emit its canonical DomainEvent"
  JURY_OPEN_EVENT="$(db_scalar "select id from private.v3_domain_events where operation_id='$JURY_OPEN_OPERATION'::uuid and event_type='jury.opened';")"
  [[ "$(db_scalar "select count(*) from private.v3_domain_event_outbox where event_id='$JURY_OPEN_EVENT'::uuid and consumer_key in ('jury.tasks','jury.notifications');")" == "2" ]] || fail "Jury open did not schedule both task and notification consequences"

  # Fan identity has no country account and must not be able to create Jury state.
  sign_in 's14-fan-01@solaris.invalid'
  FAN_TOKEN="$LAST_TOKEN"
  rpc_request "$FAN_TOKEN" v3_save_jury_draft "{\"_show_id\":\"$SEMI_ONE_ID\",\"_payload\":{\"selections\":[]},\"_expected_revision\":0,\"_device_id\":\"fan-device\",\"_session_id\":\"fan-session\"}"
  expect_failure "unauthorized fan Jury draft"

  # Country 01 exercises draft CAS across two devices before its final ballot.
  sign_in 's14-hod-01@solaris.invalid'
  HOD_ONE_TOKEN="$LAST_TOKEN"
  COUNTRY_ONE='14000000-0000-4000-8000-000000000001'
  HOD_ONE_BALLOT="$(jury_ballot_for_country "$COUNTRY_ONE")"
  HOD_ONE_SELECTIONS="$(python3 -c 'import json,sys; print(json.dumps([row["target_country_id"] for row in json.loads(sys.argv[1])],separators=(",",":")))' "$HOD_ONE_BALLOT")"
  rpc_request "$HOD_ONE_TOKEN" v3_save_jury_draft "{\"_show_id\":\"$SEMI_ONE_ID\",\"_payload\":{\"selections\":$HOD_ONE_SELECTIONS},\"_expected_revision\":0,\"_device_id\":\"s14-jury-device-a\",\"_session_id\":\"s14-jury-session-a\"}"
  expect_success "initial multi-device Jury draft"
  expect_json "initial Jury draft accepted" ok true
  expect_json "initial Jury draft revision" server_revision 1
  rpc_request "$HOD_ONE_TOKEN" v3_save_jury_draft "{\"_show_id\":\"$SEMI_ONE_ID\",\"_payload\":{\"selections\":$HOD_ONE_SELECTIONS},\"_expected_revision\":0,\"_device_id\":\"s14-jury-device-b\",\"_session_id\":\"s14-jury-session-b\"}"
  expect_success "stale second-device Jury draft response"
  expect_json "stale second-device Jury draft rejected" ok false
  expect_json "stale second-device conflict surfaced" conflict true
  expect_json "stale second-device canonical revision" server_revision 1

  # Independent server validation rejects an own-country ballot even when a
  # matching preflight record is presented. The fixture represents the already
  # server-created integrity snapshot; accepted writes still go through V3 Jury.
  OWN_COUNTRY_BALLOT="$(python3 - "$COUNTRY_ONE" "$HOD_ONE_BALLOT" <<'PY'
import json,sys
country=sys.argv[1]
rows=json.loads(sys.argv[2])
rows[0]["target_country_id"]=country
print(json.dumps(rows,separators=(",",":")))
PY
)"
  HOD_ONE_ID="$(db_scalar "select id from auth.users where email='s14-hod-01@solaris.invalid';")"
  OWN_PREFLIGHT='14000000-0000-4006-8100-000000000001'
  create_jury_preflight_fixture "$OWN_PREFLIGHT" "$HOD_ONE_ID" "$COUNTRY_ONE" 's14_hod_01' "$OWN_COUNTRY_BALLOT"
  rpc_request "$HOD_ONE_TOKEN" v3_submit_jury_ballot "{\"_show_id\":\"$SEMI_ONE_ID\",\"_entries\":$OWN_COUNTRY_BALLOT,\"_preflight_id\":\"$OWN_PREFLIGHT\",\"_operation_id\":\"14000000-0000-4006-8200-000000000001\",\"_request_hash\":\"ignored\"}"
  expect_failure "own-country Jury ballot"
  [[ "$HTTP_BODY" == *"own country"* ]] || fail "own-country Jury rejection lost its canonical reason: $HTTP_BODY"

  # A malformed point scale is rejected independently of the integrity token.
  INVALID_BALLOT="$(python3 - "$HOD_ONE_BALLOT" <<'PY'
import json,sys
rows=json.loads(sys.argv[1])
rows[0]["points"]=11
print(json.dumps(rows,separators=(",",":")))
PY
)"
  INVALID_PREFLIGHT='14000000-0000-4006-8101-000000000001'
  create_jury_preflight_fixture "$INVALID_PREFLIGHT" "$HOD_ONE_ID" "$COUNTRY_ONE" 's14_hod_01' "$INVALID_BALLOT"
  rpc_request "$HOD_ONE_TOKEN" v3_submit_jury_ballot "{\"_show_id\":\"$SEMI_ONE_ID\",\"_entries\":$INVALID_BALLOT,\"_preflight_id\":\"$INVALID_PREFLIGHT\",\"_operation_id\":\"14000000-0000-4006-8201-000000000001\",\"_request_hash\":\"ignored\"}"
  expect_failure "invalid Jury point scale"

  # Submit one complete canonical ballot for every eligible Semi-final 1 jury
  # except Country 33. Country 04 withdrew in Stage 4, so the active eligible
  # roster is 32 and this deliberately leaves exactly one missing responsibility.
  SUBMITTED_JURY_BALLOTS=0
  for i in $(seq 1 32); do
    if (( i == 4 )); then
      continue
    fi
    suffix="$(printf '%012d' "$i")"
    email="s14-hod-$(printf '%02d' "$i")@solaris.invalid"
    username="s14_hod_$(printf '%02d' "$i")"
    voter_country_id="14000000-0000-4000-8000-$suffix"
    user_id="$(db_scalar "select id from auth.users where email='$email';")"
    [[ -n "$user_id" ]] || fail "missing Jury auth identity for $email"
    sign_in "$email"
    voter_token="$LAST_TOKEN"
    ballot="$(jury_ballot_for_country "$voter_country_id")"
    [[ "$(python3 -c 'import json,sys; print(len(json.loads(sys.argv[1])))' "$ballot")" == "10" ]] || fail "Jury ballot $i does not contain ten ranked entries"

    preflight_id="14000000-0000-4006-8300-$suffix"
    operation_id="14000000-0000-4006-8400-$suffix"
    create_jury_preflight_fixture "$preflight_id" "$user_id" "$voter_country_id" "$username" "$ballot"
    submit_body="{\"_show_id\":\"$SEMI_ONE_ID\",\"_entries\":$ballot,\"_preflight_id\":\"$preflight_id\",\"_operation_id\":\"$operation_id\",\"_request_hash\":\"caller-hash-is-not-authority\"}"
    rpc_request "$voter_token" v3_submit_jury_ballot "$submit_body"
    expect_success "canonical Jury ballot $(printf '%02d' "$i")"
    expect_json "canonical Jury ballot $(printf '%02d' "$i") accepted" ok true
    expect_json "canonical Jury receipt authority $(printf '%02d' "$i")" receipt.authority authoritative_server
    ballot_id="$(printf '%s' "$HTTP_BODY" | json_value receipt.ballot_submission_id)"
    [[ -n "$ballot_id" ]] || fail "Jury ballot $i returned no canonical ballot id"

    if (( i == 1 )); then
      receipt_id="$(printf '%s' "$HTTP_BODY" | json_value receipt.receipt_id)"
      rpc_request "$voter_token" v3_submit_jury_ballot "$submit_body"
      expect_success "exact Jury operation replay"
      expect_json "Jury replay marker" receipt.replayed true
      expect_json "Jury replay receipt stable" receipt.receipt_id "$receipt_id"
      rpc_request "$voter_token" v3_reconcile_jury_submission "{\"_operation_id\":\"$operation_id\"}"
      expect_success "lost-response Jury reconciliation"
      expect_json "lost-response Jury operation found" found true
      expect_json "lost-response Jury ballot stable" receipt.ballot_submission_id "$ballot_id"
    fi

    review_version="$(db_scalar "select review_version from public.jury_ballot_submissions where id='$ballot_id'::uuid;")"
    review_operation="14000000-0000-4006-8500-$suffix"
    rpc_request "$ORGANIZER_A_TOKEN" studio2_jury_ballot_review_preview "{\"p_ballot_id\":\"$ballot_id\",\"p_target_status\":\"valid\"}"
    expect_success "Jury ballot review preview $(printf '%02d' "$i")"
    expect_json "Jury review preview exact version $(printf '%02d' "$i")" expectedVersion "$review_version"
    rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_jury_ballot_review "{\"p_ballot_id\":\"$ballot_id\",\"p_target_status\":\"valid\",\"p_reason\":\"S14 complete ballot verified\",\"p_operation_id\":\"$review_operation\",\"p_idempotency_key\":\"s14-jury-review-$i\",\"p_expected_version\":$review_version}"
    expect_success "Jury ballot review $(printf '%02d' "$i")"
    expect_json "Jury ballot valid $(printf '%02d' "$i")" status valid
    SUBMITTED_JURY_BALLOTS=$((SUBMITTED_JURY_BALLOTS + 1))
  done

  [[ "$SUBMITTED_JURY_BALLOTS" == "31" ]] || fail "S14 Jury submitted $SUBMITTED_JURY_BALLOTS ballots instead of 31"
  [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$SEMI_ONE_ID'::uuid and status='valid';")" == "31" ]] || fail "S14 Jury does not have 31 valid reviewed ballots"
  [[ "$(db_scalar "select count(*) from public.jury_votes where show_id='$SEMI_ONE_ID'::uuid;")" == "310" ]] || fail "S14 Jury valid ballots do not contain the expected 310 vote rows"

  MISSING_COUNTRY='14000000-0000-4000-8000-000000000033'
  [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$SEMI_ONE_ID'::uuid and voter_country_id='$MISSING_COUNTRY'::uuid;")" == "0" ]] || fail "the deliberate missing Jury ballot unexpectedly exists"

  rpc_request "$ORGANIZER_A_TOKEN" studio2_jury_dnv_preview "{\"p_show_id\":\"$SEMI_ONE_ID\",\"p_voter_id\":null,\"p_voter_country_id\":\"$MISSING_COUNTRY\",\"p_voter_entity_id\":null,\"p_action\":\"set\"}"
  expect_success "missing Jury ballot DNV preview"
  DNV_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_jury_dnv "{\"p_show_id\":\"$SEMI_ONE_ID\",\"p_voter_id\":null,\"p_voter_country_id\":\"$MISSING_COUNTRY\",\"p_voter_entity_id\":null,\"p_action\":\"set\",\"p_reason\":\"S14 deliberate missing ballot resolution\",\"p_operation_id\":\"14000000-0000-4006-8600-000000000033\",\"p_idempotency_key\":\"s14-jury-dnv-33\",\"p_expected_version\":$DNV_VERSION}"
  expect_success "governed missing Jury ballot DNV"
  expect_json "missing Jury ballot marked DNV" dnv true
  [[ "$(db_scalar "select count(*) from public.jury_ballot_statuses where show_id='$SEMI_ONE_ID'::uuid and voter_country_id='$MISSING_COUNTRY'::uuid and status='did_not_vote';")" == "1" ]] || fail "missing Jury responsibility did not become canonical DNV evidence"

  # Exactly one final canonical ballot may exist per submitted delegation/show.
  [[ "$(db_scalar "select count(*) - count(distinct voter_country_id) from public.jury_ballot_submissions where show_id='$SEMI_ONE_ID'::uuid and status in ('submitted','valid','needs_review');")" == "0" ]] || fail "duplicate final Jury ballot exists for a delegation"
  [[ "$(db_scalar "select count(*) from private.v3_jury_operations operation join public.jury_ballot_submissions ballot on ballot.id=operation.ballot_submission_id where ballot.show_id='$SEMI_ONE_ID'::uuid;")" == "31" ]] || fail "Jury authoritative operation ledger is not one-to-one with submitted ballots"
  log "S14_INVARIANT_JURY_COMPLETE"

  # Organizer review and DNV changes must produce canonical event-backed Jury facts.
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where edition_id='$EDITION_ID'::uuid and show_id='$SEMI_ONE_ID'::uuid and event_type='jury.ballot_changed';")" -ge "32" ]] || fail "Jury lifecycle changes did not emit expected ballot-change DomainEvents"

  apply_jury_window_status closed "$JURY_CLOSE_OPERATION" 's14-jury-close-semi-one'
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$JURY_CLOSE_OPERATION'::uuid and event_type='jury.closed' and show_id='$SEMI_ONE_ID'::uuid;")" == "1" ]] || fail "Jury close did not emit its canonical DomainEvent"
  [[ "$(db_scalar "select status from public.jury_voting_windows where show_id='$SEMI_ONE_ID'::uuid;")" == "closed" ]] || fail "governed Jury window did not close"

  log "S14_STAGE_6_JURY_COMPLETE"
}
