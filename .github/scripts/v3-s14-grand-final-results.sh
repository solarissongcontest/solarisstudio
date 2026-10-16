#!/usr/bin/env bash
set -euo pipefail

review_s14_final_jury_ballots_valid() {
  log "Grand-final results: resolve all 66 submitted Jury ballots through governed review"
  local index=0 ballot_id expected_version operation_id

  while IFS= read -r ballot_id; do
    [[ -n "$ballot_id" ]] || continue
    index=$((index + 1))

    rpc_request "$ORGANIZER_A_TOKEN" studio2_jury_ballot_review_preview \
      "{\"p_ballot_id\":\"$ballot_id\",\"p_target_status\":\"valid\"}"
    expect_success "preview Grand Final Jury ballot $index as valid"
    expected_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
    [[ "$expected_version" =~ ^[0-9]+$ ]] || fail "Grand Final Jury review preview $index returned invalid expectedVersion: $HTTP_BODY"

    operation_id="14000000-0000-4011-8100-$(printf '%012d' "$index")"
    rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_jury_ballot_review \
      "{\"p_ballot_id\":\"$ballot_id\",\"p_target_status\":\"valid\",\"p_reason\":null,\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"s14-final-jury-valid-$index\",\"p_expected_version\":$expected_version}"
    expect_success "review Grand Final Jury ballot $index as valid"
    expect_json "Grand Final Jury ballot $index valid" status valid
  done < <(db_scalar "select id::text from public.jury_ballot_submissions where show_id='$FINAL_ID'::uuid and status='submitted' order by voter_country_id,id;")

  [[ "$index" == "66" ]] || fail "Grand Final results reviewed $index submitted Jury ballots instead of 66"
  [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$FINAL_ID'::uuid and status='valid';")" == "66" ]] || fail "not all 66 Grand Final Jury ballots are valid after review"
  [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$FINAL_ID'::uuid and status in ('submitted','needs_review');")" == "0" ]] || fail "pending Grand Final Jury review remains before result calculation"
}

publish_s14_final_televote_result_through_app() {
  log "Grand-final results: calculate, lock and publish final Televote truth through the real app runtime"

  export SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
  export VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
  export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
  export E2E_SUPABASE_URL="$API_URL"
  export E2E_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
  export S14_ORGANIZER_EMAIL='s14-organizer-a@solaris.invalid'
  export S14_ORGANIZER_PASSWORD="$PASSWORD"
  export S14_EDITION_ID="$EDITION_ID"
  export S14_FINAL_TELEVOTE_ROUND_ID="$S14_FINAL_TELEVOTE_ROUND_ID"

  bunx playwright test --config=playwright.s14-grand-final-results.config.ts

  [[ "$(db_scalar "select count(*) from televoting.rounds where id='$S14_FINAL_TELEVOTE_ROUND_ID'::uuid and results_status='published' and calculation_version > 0;")" == "1" ]] || fail "Grand Final Televote round was not published from a calculated version"
  [[ "$(db_scalar "select count(*) from public.televoting_round_bindings where remote_round_id='$S14_FINAL_TELEVOTE_ROUND_ID' and show_id='$FINAL_ID'::uuid and frozen_at is not null;")" == "1" ]] || fail "Grand Final Televote binding was not frozen after result publication"
  [[ "$(db_scalar "select count(*) from public.integration_events where service='televoting' and event_type='round.results.imported' and remote_id='$S14_FINAL_TELEVOTE_ROUND_ID' and status='completed';")" -ge "1" ]] || fail "Grand Final Televote publication did not record successful Solaris result-sync evidence"
  [[ "$(db_scalar "select count(*) from public.results where show_id='$FINAL_ID'::uuid;")" == "20" ]] || fail "Grand Final Televote sync did not produce 20 canonical Studio result rows"
}

run_s14_grand_final_results() {
  log "Grand-final results: review Jury truth, publish Televote truth, calculate reproducibly and finalize immutable version 2"

  for helper in result_snapshot result_snapshot_value execute_result_operation immutable_result_snapshot_hash current_result_snapshot_hash; do
    declare -F "$helper" >/dev/null || fail "Grand Final results require Stage 8 helper '$helper' to be sourced first"
  done

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  [[ "$(db_scalar "select count(*) from public.participants where show_id='$FINAL_ID'::uuid and qualified is true;")" == "20" ]] || fail "Grand Final results require exactly 20 canonical finalists"
  [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$FINAL_ID'::uuid and status='submitted';")" == "66" ]] || fail "Grand Final results require 66 submitted Jury ballots before review"
  [[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$S14_FINAL_TELEVOTE_ROUND_ID'::uuid and status<>'deleted';")" == "12" ]] || fail "Grand Final results require the prepared 12 public Televote ballots"

  review_s14_final_jury_ballots_valid
  publish_s14_final_televote_result_through_app

  # The same #651 cross-system contract applies to the final. Televote publication
  # must satisfy Studio's canonical readiness projection; QA must never backfill
  # public.televote_votes merely to make the result operation turn green.
  result_snapshot
  jury_ready="$(result_snapshot_value "$FINAL_ID" preconditions.juryReady)"
  televote_ready="$(result_snapshot_value "$FINAL_ID" preconditions.televoteReady)"
  calculation_ready="$(result_snapshot_value "$FINAL_ID" preconditions.calculationReady)"
  [[ "$jury_ready" == "true" ]] || fail "Grand Final Jury truth is not ready after 66 valid reviews"
  if [[ "$televote_ready" != "true" || "$calculation_ready" != "true" ]]; then
    fail "S14 Grand Final results blocked by #651: published Televote result did not satisfy canonical Studio Televote readiness"
  fi

  execute_result_operation "$FINAL_ID" calculate 0 '14000000-0000-4011-8200-000000000001' 'S14 Grand Final calculate canonical result'
  expect_json "Grand Final first result calculation version" calculationVersion 1
  final_v1_hash="$(immutable_result_snapshot_hash "$FINAL_ID" 1)"
  [[ -n "$final_v1_hash" ]] || fail "Grand Final first result calculation did not persist immutable version 1"
  [[ "$(db_scalar "select result_row_count from private.v3_result_versions where show_id='$FINAL_ID'::uuid and version=1;")" == "20" ]] || fail "Grand Final immutable result version 1 does not contain 20 rows"

  execute_result_operation "$FINAL_ID" calculate 1 '14000000-0000-4011-8200-000000000002' 'S14 Grand Final reproducibility recalculation'
  expect_json "Grand Final second result calculation version" calculationVersion 2
  final_v2_hash="$(immutable_result_snapshot_hash "$FINAL_ID" 2)"
  final_current_hash="$(current_result_snapshot_hash "$FINAL_ID")"
  [[ -n "$final_v2_hash" && -n "$final_current_hash" ]] || fail "Grand Final second result calculation lacks immutable/current evidence"
  [[ "$final_v1_hash" == "$final_v2_hash" ]] || fail "Grand Final immutable v1/v2 snapshots differ for identical inputs"
  [[ "$final_v2_hash" == "$final_current_hash" ]] || fail "Grand Final current result rows do not equal immutable result version 2"
  [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id='$FINAL_ID'::uuid and version in (1,2);")" == "2" ]] || fail "Grand Final recalculation did not retain both immutable versions"

  execute_result_operation "$FINAL_ID" review 2 '14000000-0000-4011-8300-000000000001' 'S14 Grand Final review canonical result'
  execute_result_operation "$FINAL_ID" lock 2 '14000000-0000-4011-8400-000000000001' 'S14 Grand Final lock canonical result'
  execute_result_operation "$FINAL_ID" mark_reveal_ready 2 '14000000-0000-4011-8500-000000000001' 'S14 Grand Final mark result reveal ready'

  [[ "$(db_scalar "select count(*) from public.results where show_id='$FINAL_ID'::uuid;")" == "20" ]] || fail "Grand Final does not retain exactly 20 finalized result rows"
  [[ "$(db_scalar "select count(*) from public.results where show_id='$FINAL_ID'::uuid and final_rank is null;")" == "0" ]] || fail "Grand Final has incomplete final ranks"
  [[ "$(db_scalar "select count(*) from public.results where show_id='$FINAL_ID'::uuid and total_points <> jury_points + televote_points;")" == "0" ]] || fail "Grand Final result totals do not reconcile"
  [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id='$FINAL_ID'::uuid and version=2 and result_row_count=20;")" == "1" ]] || fail "Grand Final immutable result version 2 is missing or incomplete"

  result_snapshot
  [[ "$(result_snapshot_value "$FINAL_ID" calculationVersion)" == "2" ]] || fail "Grand Final calculation version is not 2"
  [[ "$(result_snapshot_value "$FINAL_ID" reviewedVersion)" == "2" ]] || fail "Grand Final current result version is not reviewed"
  [[ "$(result_snapshot_value "$FINAL_ID" lockedVersion)" == "2" ]] || fail "Grand Final current result version is not locked"
  [[ "$(result_snapshot_value "$FINAL_ID" revealReadyVersion)" == "2" ]] || fail "Grand Final current result version is not reveal-ready"
  [[ "$(result_snapshot_value "$FINAL_ID" preconditions.resultReady)" == "true" ]] || fail "Grand Final result truth is not reconciled"

  log "S14_GRAND_FINAL_RESULT_REPRODUCIBLE"
  log "S14_GRAND_FINAL_RESULTS_COMPLETE"
}
