#!/usr/bin/env bash
set -euo pipefail

# This file is sourced after v3-s14-stage-7-public-voting.sh. It deliberately
# wraps the existing supported Stage 7 helpers instead of duplicating the whole
# voting stage. The same persistent S14 rounds, ballots and bindings are used.

eval "$(declare -f apply_televote_round_status | sed '1s/^apply_televote_round_status /s14_original_apply_televote_round_status /')"
eval "$(declare -f submit_supported_vote | sed '1s/^submit_supported_vote /s14_original_submit_supported_vote /')"

s14_set_canonical_round_deadline() {
  local round_id="$1" seconds_from_now="$2" operation_id="$3" idempotency_key="$4"
  local deadline global_version round_version blockers

  deadline="$(db_scalar "select (clock_timestamp() + make_interval(secs => $seconds_from_now))::text;")"
  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_round_deadline_set_preview \
    "{\"p_round_id\":\"$round_id\",\"p_deadline_at\":\"$deadline\"}"
  expect_success "preview canonical Televote deadline for $round_id"
  blockers="$(printf '%s' "$HTTP_BODY" | json_value blockers)"
  [[ "$blockers" == "[]" ]] || fail "canonical Televote deadline preview returned blockers: $HTTP_BODY"
  global_version="$(printf '%s' "$HTTP_BODY" | json_value expectedGlobalVersion)"
  round_version="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"

  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_set \
    "{\"p_round_id\":\"$round_id\",\"p_deadline_at\":\"$deadline\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_global_version\":$global_version,\"p_expected_round_version\":$round_version}"
  expect_success "apply canonical Televote deadline for $round_id"
  expect_json "canonical Televote deadline revision" deadlineRevision 1
  [[ "$(db_scalar "select voting_deadline_revision from televoting.rounds where id='$round_id'::uuid;")" == "1" ]] \
    || fail "Televote round $round_id did not enter canonical deadline authority"
}

apply_televote_round_status() {
  local round_id="$1" status="$2" operation_id="$3" idempotency_key="$4"
  s14_original_apply_televote_round_status "$round_id" "$status" "$operation_id" "$idempotency_key"

  if [[ "$status" != "open" ]]; then
    return
  fi

  if [[ "$round_id" == "$TV_ROUND_TWO_ID" ]]; then
    # Keep this genuinely short so the stateful contest proves a real expiry and
    # extension without turning the release rehearsal into a coffee break.
    s14_set_canonical_round_deadline \
      "$round_id" 8 \
      '14000000-0000-4007-8000-000000000005' \
      's14-televote-semi2-deadline'
  else
    # Other V3 rounds still enter the canonical deadline authority even when
    # their normal supported-case ballots finish well before close.
    s14_set_canonical_round_deadline \
      "$round_id" 600 \
      '14000000-0000-4007-8000-000000000006' \
      's14-televote-semi1-deadline'
  fi
}

s14_extend_second_semifinal_and_submit() {
  local round_id="$1" username="$2" country_code="$3" ballot_json="$4" preflight_id="$5"
  local risk_score="${6:-0}" severity="${7:-none}"
  local deadline_epoch now_epoch wait_seconds
  local global_version round_version blockers previous_deadline new_deadline opened_before

  seed_televote_preflight "$round_id" "$preflight_id" "$username" "$country_code" "$ballot_json" "$risk_score" "$severity"

  deadline_epoch="$(db_scalar "select extract(epoch from voting_deadline_at)::bigint from televoting.rounds where id='$round_id'::uuid;")"
  now_epoch="$(db_scalar "select extract(epoch from clock_timestamp())::bigint;")"
  wait_seconds=$(( deadline_epoch - now_epoch + 1 ))
  (( wait_seconds > 0 )) && sleep "$wait_seconds"

  log "Stage 7 genuine deadline case: server time has crossed the still-open Semi-final 2 deadline"
  opened_before="$(db_scalar "select opened_at::text from televoting.rounds where id='$round_id'::uuid;")"
  televote_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$round_id\",\"p_username\":\"$username\",\"p_country_code\":\"$country_code\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$preflight_id\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_failure "Semi-final 2 ballot after canonical deadline"
  [[ "$HTTP_BODY" == *"Voting deadline has passed"* ]] || fail "expired Stage 7 ballot was not rejected by canonical server time: $HTTP_BODY"
  [[ "$(db_scalar "select status::text from televoting.rounds where id='$round_id'::uuid;")" == "open" ]] || fail "deadline expiry incorrectly closed the round"
  [[ "$(db_scalar "select coalesce(closed_at::text,'') from televoting.rounds where id='$round_id'::uuid;")" == "" ]] || fail "deadline expiry wrote a lifecycle close timestamp"

  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_round_deadline_extension_preview \
    "{\"p_round_id\":\"$round_id\",\"p_extend_seconds\":120}"
  expect_success "preview genuine Stage 7 deadline extension"
  blockers="$(printf '%s' "$HTTP_BODY" | json_value blockers)"
  [[ "$blockers" == "[]" ]] || fail "Stage 7 deadline extension preview returned blockers: $HTTP_BODY"
  global_version="$(printf '%s' "$HTTP_BODY" | json_value expectedGlobalVersion)"
  round_version="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"
  previous_deadline="$(printf '%s' "$HTTP_BODY" | json_value previousDeadline)"
  new_deadline="$(printf '%s' "$HTTP_BODY" | json_value newDeadline)"

  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_extension \
    "{\"p_round_id\":\"$round_id\",\"p_extend_seconds\":120,\"p_operation_id\":\"14000000-0000-4007-8000-000000000007\",\"p_idempotency_key\":\"s14-televote-semi2-extension\",\"p_expected_global_version\":$global_version,\"p_expected_round_version\":$round_version}"
  expect_success "apply genuine Stage 7 deadline extension"
  expect_json "Stage 7 deadline extension revision" deadlineRevision 2
  [[ "$(printf '%s' "$HTTP_BODY" | json_value previousDeadline)" == "$previous_deadline" ]] || fail "extension receipt lost previous deadline provenance"
  [[ "$(printf '%s' "$HTTP_BODY" | json_value newDeadline)" == "$new_deadline" ]] || fail "extension receipt lost new deadline provenance"
  [[ "$(db_scalar "select status::text from televoting.rounds where id='$round_id'::uuid;")" == "open" ]] || fail "extension changed lifecycle status"
  [[ "$(db_scalar "select opened_at::text from televoting.rounds where id='$round_id'::uuid;")" == "$opened_before" ]] || fail "extension rewrote opened_at instead of extending the window"
  [[ "$(db_scalar "select coalesce(closed_at::text,'') from televoting.rounds where id='$round_id'::uuid;")" == "" ]] || fail "extension wrote closed_at instead of extending the window"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='14000000-0000-4007-8000-000000000007'::uuid and event_type='televote.extended' and payload->>'deadlineRevision'='2';")" == "1" ]] || fail "Stage 7 canonical televote.extended fact missing"

  # Exact replay is part of the same contest, not a focused substitute.
  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_extension \
    "{\"p_round_id\":\"$round_id\",\"p_extend_seconds\":120,\"p_operation_id\":\"14000000-0000-4007-8000-000000000007\",\"p_idempotency_key\":\"s14-televote-semi2-extension\",\"p_expected_global_version\":$global_version,\"p_expected_round_version\":$round_version}"
  expect_success "replay genuine Stage 7 deadline extension"
  [[ "$(db_scalar "select voting_deadline_revision from televoting.rounds where id='$round_id'::uuid;")" == "2" ]] || fail "extension replay advanced the deadline twice"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='14000000-0000-4007-8000-000000000007'::uuid and event_type='televote.extended';")" == "1" ]] || fail "extension replay duplicated the canonical fact"

  # A fresh operation holding the stale preview versions must fail closed.
  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_extension \
    "{\"p_round_id\":\"$round_id\",\"p_extend_seconds\":30,\"p_operation_id\":\"14000000-0000-4007-8000-000000000008\",\"p_idempotency_key\":\"s14-televote-semi2-stale-extension\",\"p_expected_global_version\":$global_version,\"p_expected_round_version\":$round_version}"
  expect_failure "stale Stage 7 deadline extension"
  [[ "$HTTP_BODY" == *"state changed"* ]] || fail "stale Stage 7 extension did not fail on optimistic concurrency: $HTTP_BODY"

  # Leave the helper exactly where its caller expects it: a successful ballot
  # response. The same preflight is still unused because expiry rejected before
  # ballot mutation.
  televote_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$round_id\",\"p_username\":\"$username\",\"p_country_code\":\"$country_code\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$preflight_id\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "ballot during genuinely extended window failed: $HTTP_BODY"

  S14_STAGE7_DEADLINE_EXTENSION_COMPLETE=1
  export S14_STAGE7_DEADLINE_EXTENSION_COMPLETE
  log "S14_FAILURE_TELEVOTE_DEADLINE_EXTENSION_COMPLETE"
}

submit_supported_vote() {
  local round_id="$1" username="$2" country_code="$3" ballot_json="$4" preflight_id="$5"
  local risk_score="${6:-0}" severity="${7:-none}"

  if [[ "$round_id" == "${TV_ROUND_TWO_ID:-}" && "$username" == "s14-semi2-public-03" ]]; then
    s14_extend_second_semifinal_and_submit \
      "$round_id" "$username" "$country_code" "$ballot_json" "$preflight_id" "$risk_score" "$severity"
    return
  fi

  s14_original_submit_supported_vote \
    "$round_id" "$username" "$country_code" "$ballot_json" "$preflight_id" "$risk_score" "$severity"
}

run_s14_stage_7_public_voting() {
  S14_STAGE7_DEADLINE_EXTENSION_COMPLETE=0
  export S14_STAGE7_DEADLINE_EXTENSION_COMPLETE
  run_s14_stage_7_public_voting_supported_cases
  [[ "$S14_STAGE7_DEADLINE_EXTENSION_COMPLETE" == "1" ]] || fail "Stage 7 never exercised the genuine deadline extension path"
  [[ "$(db_scalar "select count(*) from televoting.rounds where id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid) and voting_deadline_revision >= 1;")" == "2" ]] || fail "both S14 semifinal Televote rounds did not use canonical server deadlines"
  log "S14_STAGE_7_PUBLIC_VOTING_COMPLETE"
}
