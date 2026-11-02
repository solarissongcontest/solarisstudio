#!/usr/bin/env bash
set -euo pipefail

# QA-only integration adapter for the canonical System-owned Televote deadline
# contract. It keeps the Stage 7 fixture/ballot authority intact while forcing
# the same persistent contest through set -> expiry -> governed extension.

S14_STAGE7_DEADLINE_EXTENSION_DONE=0

eval "$(declare -f apply_televote_round_status | sed '1s/apply_televote_round_status/apply_televote_round_status_without_deadline/')"

s14_stage7_deadline_set_identity() {
  local round_id="$1"
  if [[ "$round_id" == "$TV_ROUND_ID" ]]; then
    printf '%s|%s\n' '14000000-0000-4007-8500-000000000001' 's14-televote-semi1-deadline-set'
  elif [[ -n "${TV_ROUND_TWO_ID:-}" && "$round_id" == "$TV_ROUND_TWO_ID" ]]; then
    printf '%s|%s\n' '14000000-0000-4007-8500-000000000004' 's14-televote-semi2-deadline-set'
  elif [[ -n "${S14_FINAL_TELEVOTE_ROUND_ID:-}" && "$round_id" == "$S14_FINAL_TELEVOTE_ROUND_ID" ]]; then
    printf '%s|%s\n' '14000000-0000-4010-8600-000000000001' 's14-final-televote-deadline-set'
  else
    fail "No deterministic S14 deadline operation identity for round $round_id"
  fi
}

s14_stage7_set_deadline_before_open() {
  local round_id="$1"
  local current_deadline desired_deadline identity operation_id idempotency_key persisted_deadline
  local preview expected_version blockers first_result replay_result receipt_command

  current_deadline="$(db_scalar "select coalesce(closes_at::text,'') from televoting.rounds where id='$round_id'::uuid;")"
  [[ -z "$current_deadline" ]] || return 0

  if [[ "$round_id" == "$TV_ROUND_ID" ]]; then
    desired_deadline="$(db_scalar "select (clock_timestamp() + interval '6 seconds')::text;")"
  else
    desired_deadline="$(db_scalar "select (clock_timestamp() + interval '10 minutes')::text;")"
  fi

  identity="$(s14_stage7_deadline_set_identity "$round_id")"
  operation_id="${identity%%|*}"
  idempotency_key="${identity#*|}"

  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_round_deadline_change_preview \
    "{\"p_round_id\":\"$round_id\",\"p_new_deadline_at\":\"$desired_deadline\"}"
  expect_success "preview initial Televote deadline for $round_id"
  preview="$HTTP_BODY"
  expected_version="$(printf '%s' "$preview" | json_value expectedRoundVersion)"
  blockers="$(printf '%s' "$preview" | json_value blockers)"
  [[ "$(printf '%s' "$preview" | json_value action)" == "set" ]] || fail "initial deadline preview did not resolve to action=set: $preview"
  [[ "$blockers" == "[]" ]] || fail "initial deadline preview returned blockers: $preview"
  [[ -n "$expected_version" ]] || fail "initial deadline preview omitted expected round version"

  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_change \
    "{\"p_round_id\":\"$round_id\",\"p_new_deadline_at\":\"$desired_deadline\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_round_version\":$expected_version}"
  expect_success "apply initial Televote deadline for $round_id"
  first_result="$HTTP_BODY"
  [[ "$(printf '%s' "$first_result" | json_value action)" == "set" ]] || fail "initial deadline apply did not persist action=set"
  persisted_deadline="$(db_scalar "select closes_at::text from televoting.rounds where id='$round_id'::uuid;")"
  log "S14_STAGE7_DEADLINE_SET round=$round_id actor=organizer-a capability=voting.manage requested=$desired_deadline persisted=$persisted_deadline expected_version=$expected_version"
  receipt_command="$(db_scalar "select command from public.studio2_operation_receipts where operation_id='$operation_id'::uuid;")"
  [[ "$receipt_command" == "televote.deadline.change" ]] || fail "deadline set receipt used '$receipt_command' instead of replay-stable canonical televote.deadline.change"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='televote.deadline_set';")" == "1" ]] || fail "initial deadline set did not emit exactly one canonical DomainEvent"

  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_change \
    "{\"p_round_id\":\"$round_id\",\"p_new_deadline_at\":\"$desired_deadline\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_round_version\":$expected_version}"
  expect_success "replay initial Televote deadline for $round_id"
  replay_result="$HTTP_BODY"
  python3 - "$first_result" "$replay_result" <<'PY'
import json,sys
assert json.loads(sys.argv[1]) == json.loads(sys.argv[2])
PY
}

apply_televote_round_status() {
  local round_id="$1" status="$2"
  if [[ "$status" == "open" ]]; then
    s14_stage7_set_deadline_before_open "$round_id"
  fi
  apply_televote_round_status_without_deadline "$@"
}

s14_stage7_extend_expired_semi_one() {
  local round_id="$1" username="$2" country_code="$3" ballot_json="$4" preflight_id="$5"
  local expired=0 previous_deadline stale_version extended_deadline preview blockers
  local operation_id idempotency_key extend_result replay_result stale_deadline
  local event_id process_result receipt_command
  local expiry_snapshot expiry_state db_now persisted_deadline seconds_remaining
  local poll_status round_version remote_edition_id results_status poll_iteration

  for poll_iteration in $(seq 1 80); do
    expiry_snapshot="$(db_scalar "
with sample as (select clock_timestamp() as db_now)
select concat_ws('|',
  case when r.closes_at is not null and sample.db_now >= r.closes_at then 'expired' else 'waiting' end,
  sample.db_now::text,
  coalesce(r.closes_at::text,''),
  coalesce(extract(epoch from (r.closes_at - sample.db_now))::text,''),
  r.status::text,
  coalesce(v.version,0)::text,
  r.edition_id::text,
  r.results_status::text
)
from televoting.rounds r
cross join sample
left join public.studio2_televote_round_versions v on v.round_id=r.id
where r.id='$round_id'::uuid;
")"
    IFS='|' read -r expiry_state db_now persisted_deadline seconds_remaining poll_status round_version remote_edition_id results_status <<<"$expiry_snapshot"
    log "S14_STAGE7_DEADLINE_POLL iteration=$poll_iteration round=$round_id state=$expiry_state db_now=$db_now closes_at=$persisted_deadline seconds_remaining=$seconds_remaining status=$poll_status round_version=$round_version remote_edition_id=$remote_edition_id results_status=$results_status"
    if [[ "$expiry_state" == "expired" ]]; then
      expired=1
      break
    fi
    sleep 0.25
  done
  [[ "$expired" == "1" ]] || fail "S14 Televote fixture never crossed the authoritative server deadline (last_state=$expiry_state db_now=$db_now closes_at=$persisted_deadline seconds_remaining=$seconds_remaining)"
  [[ "$(db_scalar "select status from televoting.rounds where id='$round_id'::uuid;")" == "open" ]] || fail "deadline expiry incorrectly closed the Televote round"
  [[ "$(db_scalar "select count(*) from televoting.rounds where id='$round_id'::uuid and closed_at is null;")" == "1" ]] || fail "deadline expiry fabricated a lifecycle close timestamp"

  televote_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$round_id\",\"p_username\":\"$username\",\"p_country_code\":\"$country_code\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$preflight_id\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_failure "public Televote after authoritative deadline"
  [[ "$HTTP_BODY" == *"Voting deadline has passed"* ]] || fail "expired open Televote was not rejected by server deadline authority: $HTTP_BODY"
  [[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$round_id'::uuid and username_normalized=lower('$username');")" == "0" ]] || fail "expired ballot created canonical submission state"

  previous_deadline="$(db_scalar "select closes_at::text from televoting.rounds where id='$round_id'::uuid;")"
  stale_version="$(db_scalar "select version from public.studio2_televote_round_versions where round_id='$round_id'::uuid;")"
  extended_deadline="$(db_scalar "select (closes_at + interval '2 minutes')::text from televoting.rounds where id='$round_id'::uuid;")"
  operation_id='14000000-0000-4007-8500-000000000002'
  idempotency_key='s14-televote-semi1-deadline-extend-2m'
  log "S14_STAGE7_SECOND_DEADLINE_RPC phase=preview round=$round_id actor=organizer-a capability=voting.manage status=$(db_scalar "select status from televoting.rounds where id='$round_id'::uuid;") previous_deadline=$previous_deadline requested_deadline=$extended_deadline expected_version=$stale_version operation_id=$operation_id idempotency_key=$idempotency_key"

  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_round_deadline_change_preview \
    "{\"p_round_id\":\"$round_id\",\"p_new_deadline_at\":\"$extended_deadline\"}"
  expect_success "preview genuine +2 minute Televote extension"
  preview="$HTTP_BODY"
  blockers="$(printf '%s' "$preview" | json_value blockers)"
  [[ "$(printf '%s' "$preview" | json_value action)" == "extend" ]] || fail "expired deadline preview did not resolve to action=extend: $preview"
  [[ "$(printf '%s' "$preview" | json_value status)" == "open" ]] || fail "deadline extension preview no longer sees an open round"
  [[ "$(printf '%s' "$preview" | json_value expectedRoundVersion)" == "$stale_version" ]] || fail "deadline extension preview returned a different concurrency version"
  [[ "$blockers" == "[]" ]] || fail "deadline extension preview returned blockers: $preview"

  log "S14_STAGE7_SECOND_DEADLINE_RPC phase=apply round=$round_id actor=organizer-a capability=voting.manage requested_deadline=$extended_deadline expected_version=$stale_version operation_id=$operation_id idempotency_key=$idempotency_key"
  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_change \
    "{\"p_round_id\":\"$round_id\",\"p_new_deadline_at\":\"$extended_deadline\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_round_version\":$stale_version}"
  expect_success "apply genuine +2 minute Televote extension"
  extend_result="$HTTP_BODY"
  python3 - "$extend_result" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['ok'] is True
assert r['status']=='open'
assert r['action']=='extend'
assert r['previousDeadline'] is not None
assert r['deadline'] is not None
assert r['roundVersion'] > r['previousRoundVersion']
PY
  log "S14_STAGE7_SECOND_DEADLINE_RPC phase=applied round=$round_id persisted_deadline=$(db_scalar "select closes_at::text from televoting.rounds where id='$round_id'::uuid;") round_version=$(db_scalar "select version from public.studio2_televote_round_versions where round_id='$round_id'::uuid;") event_count=$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='televote.extended';") outbox_count=$(db_scalar "select count(*) from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id where e.operation_id='$operation_id'::uuid and o.consumer_key='televote.tasks';")"
  [[ "$(db_scalar "select extract(epoch from (closes_at - '$previous_deadline'::timestamptz))::int from televoting.rounds where id='$round_id'::uuid;")" == "120" ]] || fail "S14 governed extension was not exactly +2 minutes"
  receipt_command="$(db_scalar "select command from public.studio2_operation_receipts where operation_id='$operation_id'::uuid;")"
  [[ "$receipt_command" == "televote.deadline.change" ]] || fail "deadline extension receipt used '$receipt_command' instead of replay-stable canonical televote.deadline.change"

  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_change \
    "{\"p_round_id\":\"$round_id\",\"p_new_deadline_at\":\"$extended_deadline\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_round_version\":$stale_version}"
  expect_success "replay genuine +2 minute Televote extension"
  replay_result="$HTTP_BODY"
  python3 - "$extend_result" "$replay_result" <<'PY'
import json,sys
assert json.loads(sys.argv[1]) == json.loads(sys.argv[2])
PY

  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='televote.extended';")" == "1" ]] || fail "genuine extension did not emit exactly one televote.extended event"
  [[ "$(db_scalar "select count(*) from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id where e.operation_id='$operation_id'::uuid and o.consumer_key='televote.tasks';")" == "1" ]] || fail "genuine extension did not queue its canonical task consequence"

  stale_deadline="$(db_scalar "select (closes_at + interval '1 minute')::text from televoting.rounds where id='$round_id'::uuid;")"
  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_change \
    "{\"p_round_id\":\"$round_id\",\"p_new_deadline_at\":\"$stale_deadline\",\"p_operation_id\":\"14000000-0000-4007-8500-000000000003\",\"p_idempotency_key\":\"s14-televote-stale-deadline-extension\",\"p_expected_round_version\":$stale_version}"
  expect_failure "stale competing Televote deadline extension"
  [[ "$HTTP_BODY" == *"changed since this preview"* ]] || fail "stale deadline extension did not surface canonical version conflict: $HTTP_BODY"

  televote_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$round_id\",\"p_username\":\"$username\",\"p_country_code\":\"$country_code\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$preflight_id\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_success "public Televote after governed deadline extension"

  event_id="$(db_scalar "select id from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='televote.extended';")"
  db_exec "set request.jwt.claim.role='service_role'; select * from public.studio2_claim_domain_event_deliveries('televote.tasks','s14-stage7-deadline-worker',25,300);"
  process_result="$(db_scalar "set request.jwt.claim.role='service_role'; select public.studio2_process_televote_domain_event('$event_id','televote.tasks','s14-stage7-deadline-worker')::text;")"
  python3 - "$process_result" <<'PY'
import json,sys
r=json.loads(sys.argv[1])
assert r['ok'] is True
assert r['status']=='completed'
PY

  S14_STAGE7_DEADLINE_EXTENSION_DONE=1
  log "S14_TELEVOTE_DEADLINE_EXTENSION_COMPLETE"
}

submit_supported_vote() {
  local round_id="$1" username="$2" country_code="$3" ballot_json="$4" preflight_id="$5"
  local risk_score="${6:-0}" severity="${7:-none}"
  seed_televote_preflight "$round_id" "$preflight_id" "$username" "$country_code" "$ballot_json" "$risk_score" "$severity"

  if [[ "$round_id" == "$TV_ROUND_ID" && "$username" == "s14-public-52" && "$S14_STAGE7_DEADLINE_EXTENSION_DONE" != "1" ]]; then
    s14_stage7_extend_expired_semi_one "$round_id" "$username" "$country_code" "$ballot_json" "$preflight_id"
    return
  fi

  televote_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$round_id\",\"p_username\":\"$username\",\"p_country_code\":\"$country_code\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$preflight_id\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
}

run_s14_stage_7_public_voting() {
  run_s14_stage_7_public_voting_supported_cases
  [[ "$S14_STAGE7_DEADLINE_EXTENSION_DONE" == "1" ]] || fail "Stage 7 completed supported cases without the genuine deadline-extension path"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='14000000-0000-4007-8500-000000000002'::uuid and event_type='televote.extended';")" == "1" ]] || fail "Stage 7 completion lost canonical Televote extension evidence"
  log "S14_INVARIANT_TELEVOTE_COMPLETE"
  log "S14_STAGE_7_PUBLIC_VOTING_COMPLETE"
}
