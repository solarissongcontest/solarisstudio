#!/usr/bin/env bash
set -euo pipefail

run_s14_stage_7_deadline_extension_certification() {
  log "Stage 7 certification: server-authoritative Televote deadline expiry and genuine extension"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  initial_deadline="$(db_scalar "select (clock_timestamp()+interval '1 hour')::text;")"
  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_round_deadline_change_preview \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_new_deadline_at\":\"$initial_deadline\"}"
  expect_success "S14 initial Televote deadline preview"
  expect_json "S14 initial deadline action" action set
  expect_json "S14 initial deadline preview risk" riskClass R2
  expected_round_version="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"
  [[ "$expected_round_version" =~ ^[0-9]+$ ]] || fail "initial deadline preview omitted expected round version"

  deadline_set_op='14000000-0000-4007-8700-000000000001'
  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_change \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_new_deadline_at\":\"$initial_deadline\",\"p_operation_id\":\"$deadline_set_op\",\"p_idempotency_key\":\"s14-stage7-deadline-set\",\"p_expected_round_version\":$expected_round_version}"
  expect_success "S14 initial Televote deadline set"
  expect_json "S14 persisted deadline action" action set
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$deadline_set_op'::uuid and event_type='televote.deadline_set';")" == "1" ]] || fail "initial deadline set did not emit exactly one canonical event"

  apply_televote_round_status "$TV_ROUND_ID" open \
    '14000000-0000-4007-8700-000000000002' 's14-stage7-deadline-open'
  [[ "$(db_scalar "select status from televoting.rounds where id='$TV_ROUND_ID'::uuid;")" == "open" ]] || fail "deadline-certification round did not open"

  # Test-only fixture advancement: move only the server deadline into the past.
  # The round remains open so rejection proves database-time deadline authority,
  # not the already-covered closed-round rule.
  db_exec "update televoting.rounds set closes_at=clock_timestamp()-interval '1 second' where id='$TV_ROUND_ID'::uuid;"
  [[ "$(db_scalar "select status from televoting.rounds where id='$TV_ROUND_ID'::uuid;")" == "open" ]] || fail "deadline fixture accidentally changed round status"

  deadline_username='s14-public-deadline-60'
  deadline_country="$(db_scalar "select short_code from public.countries where id='14000000-0000-4000-8000-000000000060'::uuid;")"
  deadline_ballot="$(round_ballot "$TV_ROUND_ID")"
  deadline_preflight='14000000-0000-4007-8800-000000000060'
  seed_televote_preflight "$TV_ROUND_ID" "$deadline_preflight" "$deadline_username" "$deadline_country" "$deadline_ballot"

  televote_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$deadline_username\",\"p_country_code\":\"$deadline_country\",\"p_entries\":$deadline_ballot,\"p_preflight_token\":\"$deadline_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_failure "public Televote after authoritative server deadline"
  [[ "$HTTP_BODY" == *"Voting deadline has passed"* ]] || fail "expired open round was rejected for the wrong reason: $HTTP_BODY"
  [[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$TV_ROUND_ID'::uuid and username_normalized=lower('$deadline_username') and status<>'deleted';")" == "0" ]] || fail "expired Televote attempt created canonical state"

  expired_round_version="$(db_scalar "select version from public.studio2_televote_round_versions where round_id='$TV_ROUND_ID'::uuid;")"
  extended_deadline="$(db_scalar "select (clock_timestamp()+interval '2 hours')::text;")"
  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_round_deadline_change_preview \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_new_deadline_at\":\"$extended_deadline\"}"
  expect_success "S14 Televote deadline extension preview"
  expect_json "S14 extension keeps round open" status open
  expect_json "S14 genuine extension action" action extend
  expect_json "S14 extension expected version" expectedRoundVersion "$expired_round_version"
  extension_blockers="$(printf '%s' "$HTTP_BODY" | json_value blockers)"
  [[ "$extension_blockers" == "[]" ]] || fail "genuine deadline extension preview returned blockers: $HTTP_BODY"

  extend_op='14000000-0000-4007-8700-000000000003'
  extension_body="{\"p_round_id\":\"$TV_ROUND_ID\",\"p_new_deadline_at\":\"$extended_deadline\",\"p_operation_id\":\"$extend_op\",\"p_idempotency_key\":\"s14-stage7-genuine-extension\",\"p_expected_round_version\":$expired_round_version}"
  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_change "$extension_body"
  expect_success "S14 genuine Televote deadline extension"
  expect_json "S14 extension action applied" action extend
  expect_json "S14 extension preserves open status" status open
  extension_result="$HTTP_BODY"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$extend_op'::uuid and event_type='televote.extended';")" == "1" ]] || fail "genuine extension did not emit exactly one televote.extended event"
  [[ "$(db_scalar "select count(*) from private.v3_domain_event_outbox outbox join private.v3_domain_events event on event.id=outbox.event_id where event.operation_id='$extend_op'::uuid and outbox.consumer_key='televote.tasks';")" == "1" ]] || fail "genuine extension did not queue the canonical task consequence"

  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_deadline_change "$extension_body"
  expect_success "S14 exact Televote extension replay"
  [[ "$HTTP_BODY" == "$extension_result" ]] || fail "exact Televote extension replay changed canonical result"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$extend_op'::uuid and event_type='televote.extended';")" == "1" ]] || fail "extension replay duplicated DomainEvent evidence"

  # The previously rejected one-shot preflight remains unused. The identical
  # ballot must now commit exactly once without any close->reopen shortcut.
  televote_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$deadline_username\",\"p_country_code\":\"$deadline_country\",\"p_entries\":$deadline_ballot,\"p_preflight_token\":\"$deadline_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_success "public Televote inside genuinely extended deadline"
  expect_json "extended-window ballot status" status active
  [[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$TV_ROUND_ID'::uuid and username_normalized=lower('$deadline_username') and status<>'deleted';")" == "1" ]] || fail "extended-window ballot was not committed exactly once"

  apply_televote_round_status "$TV_ROUND_ID" closed \
    '14000000-0000-4007-8700-000000000004' 's14-stage7-deadline-final-close'
  [[ "$(db_scalar "select count(*) from (select round_id,username_normalized,count(*) from televoting.vote_submissions where round_id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid) and status<>'deleted' group by round_id,username_normalized having count(*)>1) duplicate_ballots;")" == "0" ]] || fail "Stage 7 certification introduced duplicate canonical ballots"
  [[ "$(db_scalar "select count(*) from televoting.rounds where id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid) and status='closed';")" == "2" ]] || fail "both Televote rounds must be closed before Results"

  log "S14_INVARIANT_TELEVOTE_COMPLETE"
  log "S14_STAGE_7_PUBLIC_VOTING_COMPLETE"
}
