#!/usr/bin/env bash
set -euo pipefail

result_snapshot() {
  rpc_request "$ORGANIZER_A_TOKEN" studio2_results_operations_snapshot "{\"p_edition_id\":\"$EDITION_ID\"}"
  expect_success "load Studio result lifecycle snapshot"
}

result_snapshot_value() {
  local show_id="$1" key="$2"
  printf '%s' "$HTTP_BODY" | python3 -c '
import json,sys
show_id,key=sys.argv[1],sys.argv[2]
rows=json.load(sys.stdin)
row=next((item for item in rows if item.get("showId")==show_id), None)
if row is None:
    raise SystemExit(f"missing show {show_id} in result snapshot")
value=row
for part in key.split(".") if key else []:
    value=value[part]
if value is None: print("")
elif isinstance(value,bool): print("true" if value else "false")
else: print(value)
' "$show_id" "$key"
}

execute_result_operation() {
  local show_id="$1" action="$2" expected_version="$3" execution_id="$4" reason="$5"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_execute_result_operation \
    "{\"p_show_id\":\"$show_id\",\"p_action\":\"$action\",\"p_reason\":\"$reason\",\"p_execution_id\":\"$execution_id\",\"p_expected_version\":$expected_version}"
  expect_success "Studio results $action for $show_id"
  expect_json "Studio results $action action echo" action "$action"
}

immutable_result_snapshot_hash() {
  local show_id="$1" version="$2"
  db_scalar "
select md5(result_rows::text)
from private.v3_result_versions
where show_id='$show_id'::uuid and version=$version;
"
}

current_result_snapshot_hash() {
  local show_id="$1"
  db_scalar "
select md5(coalesce(
  jsonb_agg(
    jsonb_build_object(
      'id', result.id,
      'countryId', result.country_id,
      'contestEntityId', result.contest_entity_id,
      'juryPoints', result.jury_points,
      'televotePoints', result.televote_points,
      'televoteComponents', result.televote_components,
      'totalPoints', result.total_points,
      'finalRank', result.final_rank
    ) order by result.id
  ),
  '[]'::jsonb
)::text)
from public.results result
where result.show_id='$show_id'::uuid;
"
}

review_s14_jury_ballots_valid() {
  log "Stage 8: resolving the 64 submitted Jury ballots through canonical review authority"
  local index=0 ballot_id expected_version operation_id
  while IFS= read -r ballot_id; do
    [[ -n "$ballot_id" ]] || continue
    index=$((index + 1))
    rpc_request "$ORGANIZER_A_TOKEN" studio2_jury_ballot_review_preview \
      "{\"p_ballot_id\":\"$ballot_id\",\"p_target_status\":\"valid\"}"
    expect_success "preview Jury ballot $index as valid"
    expected_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
    operation_id="14000000-0000-4008-8100-$(printf '%012d' "$index")"
    rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_jury_ballot_review \
      "{\"p_ballot_id\":\"$ballot_id\",\"p_target_status\":\"valid\",\"p_reason\":null,\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"s14-jury-valid-$index\",\"p_expected_version\":$expected_version}"
    expect_success "review Jury ballot $index as valid"
    expect_json "Jury ballot $index valid" status valid
  done < <(db_scalar "select id::text from public.jury_ballot_submissions where edition_id='$EDITION_ID'::uuid and status='submitted' order by show_id,voter_country_id,id;")

  [[ "$index" == "64" ]] || fail "Stage 8 reviewed $index submitted Jury ballots instead of 64"
  [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where edition_id='$EDITION_ID'::uuid and status='valid';")" == "64" ]] || fail "not all 64 S14 Jury ballots are valid after review"
  [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where edition_id='$EDITION_ID'::uuid and status in ('submitted','needs_review');")" == "0" ]] || fail "pending Jury review remains before result calculation"
}

authorize_s14_missing_jury_dnv() {
  log "Stage 8: resolving the two intentional missing Jury ballots as canonical DNV evidence"
  local index=0 show_id country_id voter_id expected_version operation_id
  for pair in \
    "$SEMI_ONE_ID:14000000-0000-4000-8000-000000000033" \
    "$SEMI_TWO_ID:14000000-0000-4000-8000-000000000066"; do
    index=$((index + 1))
    show_id="${pair%%:*}"
    country_id="${pair##*:}"
    voter_id="$(db_scalar "select id::text from public.voters where show_id='$show_id'::uuid and country_id='$country_id'::uuid limit 1;")"
    [[ -n "$voter_id" ]] || fail "missing Jury voter identity for DNV $country_id"

    rpc_request "$ORGANIZER_A_TOKEN" studio2_jury_dnv_preview \
      "{\"p_show_id\":\"$show_id\",\"p_voter_id\":\"$voter_id\",\"p_voter_country_id\":\"$country_id\",\"p_voter_entity_id\":null,\"p_action\":\"set\"}"
    expect_success "preview S14 Jury DNV $index"
    expect_json "S14 Jury DNV $index has no saved scores" savedVoteRows 0
    expected_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
    operation_id="14000000-0000-4008-8200-$(printf '%012d' "$index")"

    rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_jury_dnv \
      "{\"p_show_id\":\"$show_id\",\"p_voter_id\":\"$voter_id\",\"p_voter_country_id\":\"$country_id\",\"p_voter_entity_id\":null,\"p_action\":\"set\",\"p_reason\":\"S14 intentional missing Jury ballot\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"s14-jury-dnv-$index\",\"p_expected_version\":$expected_version}"
    expect_success "apply S14 Jury DNV $index"
    expect_json "S14 Jury DNV $index applied" dnv true
  done

  [[ "$(db_scalar "select count(*) from public.jury_ballot_statuses where edition_id='$EDITION_ID'::uuid and status='did_not_vote';")" == "2" ]] || fail "S14 result readiness does not contain exactly two DNV records"
}

publish_s14_televote_results_through_app() {
  log "Stage 8: calculating, locking and publishing both Televote rounds through the real app runtime"
  export SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
  export VITE_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
  export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
  export E2E_SUPABASE_URL="$API_URL"
  export E2E_SUPABASE_PUBLISHABLE_KEY="$ANON_KEY"
  export S14_ORGANIZER_EMAIL='s14-organizer-a@solaris.invalid'
  export S14_ORGANIZER_PASSWORD="$PASSWORD"
  export S14_EDITION_ID="$EDITION_ID"
  export S14_TELEVOTE_ROUND_IDS="$TV_ROUND_ID,14000000-0000-4000-8000-000000000033"

  bunx playwright test --config=playwright.s14-results.config.ts

  [[ "$(db_scalar "select count(*) from televoting.rounds where id in ('$TV_ROUND_ID'::uuid,'14000000-0000-4000-8000-000000000033'::uuid) and results_status='published' and calculation_version > 0;")" == "2" ]] || fail "both S14 Televote rounds were not published from a calculated version"
  [[ "$(db_scalar "select count(*) from public.televoting_round_bindings where remote_round_id in ('$TV_ROUND_ID','14000000-0000-4000-8000-000000000033') and frozen_at is not null;")" == "2" ]] || fail "published S14 Televote bindings were not frozen"
  [[ "$(db_scalar "select count(*) from public.integration_events where service='televoting' and event_type='round.results.imported' and remote_id in ('$TV_ROUND_ID','14000000-0000-4000-8000-000000000033') and status='completed';")" -ge "2" ]] || fail "Televote publication did not record two successful Solaris result-sync events"
  [[ "$(db_scalar "select count(*) from public.results where show_id='$SEMI_ONE_ID'::uuid;")" == "33" ]] || fail "Semi-final 1 sync did not produce 33 canonical Studio result rows"
  [[ "$(db_scalar "select count(*) from public.results where show_id='$SEMI_TWO_ID'::uuid;")" == "33" ]] || fail "Semi-final 2 sync did not produce 33 canonical Studio result rows"
}

run_s14_stage_8_results() {
  log "Stage 8/10: resolve integrity, publish Televote truth, calculate reproducibly, review, lock and finalize results"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  review_s14_jury_ballots_valid
  authorize_s14_missing_jury_dnv
  publish_s14_televote_results_through_app

  # S14 issue #651 guards a real cross-system contract: the Televote publication
  # bridge must satisfy the same canonical Televote readiness truth consumed by
  # Studio result operations. Do not bypass this with QA-only table writes.
  result_snapshot
  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    jury_ready="$(result_snapshot_value "$show_id" preconditions.juryReady)"
    televote_ready="$(result_snapshot_value "$show_id" preconditions.televoteReady)"
    calculation_ready="$(result_snapshot_value "$show_id" preconditions.calculationReady)"
    [[ "$jury_ready" == "true" ]] || fail "S14 Stage 8 Jury truth is not ready for $show_id after valid reviews + DNV"
    if [[ "$televote_ready" != "true" || "$calculation_ready" != "true" ]]; then
      fail "S14 Stage 8 blocked by #651: published Televote result did not satisfy canonical Studio Televote readiness for $show_id"
    fi
  done

  show_index=0
  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    show_index=$((show_index + 1))
    suffix="$(printf '%012d' "$show_index")"

    execute_result_operation "$show_id" calculate 0 "14000000-0000-4008-8300-$suffix" "S14 calculate canonical result"
    expect_json "first result calculation version $show_id" calculationVersion 1
    version_one_hash="$(immutable_result_snapshot_hash "$show_id" 1)"
    [[ -n "$version_one_hash" ]] || fail "first result calculation for $show_id did not persist immutable version 1"
    [[ "$(db_scalar "select result_row_count from private.v3_result_versions where show_id='$show_id'::uuid and version=1;")" == "33" ]] || fail "immutable result version 1 for $show_id does not contain 33 rows"

    execute_result_operation "$show_id" calculate 1 "14000000-0000-4008-8400-$suffix" "S14 reproducibility recalculation"
    expect_json "second result calculation version $show_id" calculationVersion 2
    version_two_hash="$(immutable_result_snapshot_hash "$show_id" 2)"
    current_hash="$(current_result_snapshot_hash "$show_id")"
    [[ -n "$version_two_hash" && -n "$current_hash" ]] || fail "second result calculation for $show_id lacks immutable/current evidence"
    [[ "$version_one_hash" == "$version_two_hash" ]] || fail "immutable recalculation snapshots differ for identical S14 inputs on $show_id"
    [[ "$version_two_hash" == "$current_hash" ]] || fail "current result rows for $show_id do not equal immutable result version 2"
    [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id='$show_id'::uuid and version in (1,2);")" == "2" ]] || fail "result recalculation for $show_id did not retain both immutable versions"

    execute_result_operation "$show_id" review 2 "14000000-0000-4008-8500-$suffix" "S14 review canonical result"
    execute_result_operation "$show_id" lock 2 "14000000-0000-4008-8600-$suffix" "S14 lock canonical result"
    execute_result_operation "$show_id" mark_reveal_ready 2 "14000000-0000-4008-8700-$suffix" "S14 mark result reveal ready"

    [[ "$(db_scalar "select count(*) from public.results where show_id='$show_id'::uuid;")" == "33" ]] || fail "S14 $show_id does not retain exactly 33 finalized rows"
    [[ "$(db_scalar "select count(*) from public.results where show_id='$show_id'::uuid and final_rank is null;")" == "0" ]] || fail "S14 $show_id has incomplete final ranks"
    [[ "$(db_scalar "select count(*) from public.results where show_id='$show_id'::uuid and total_points <> jury_points + televote_points;")" == "0" ]] || fail "S14 $show_id result totals do not reconcile"
    [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id='$show_id'::uuid and version=2 and result_row_count=33;")" == "1" ]] || fail "finalized immutable result version 2 for $show_id is missing or incomplete"
  done

  result_snapshot
  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    [[ "$(result_snapshot_value "$show_id" calculationVersion)" == "2" ]] || fail "S14 $show_id calculation version is not 2"
    [[ "$(result_snapshot_value "$show_id" reviewedVersion)" == "2" ]] || fail "S14 $show_id current result version is not reviewed"
    [[ "$(result_snapshot_value "$show_id" lockedVersion)" == "2" ]] || fail "S14 $show_id current result version is not locked"
    [[ "$(result_snapshot_value "$show_id" revealReadyVersion)" == "2" ]] || fail "S14 $show_id current result version is not reveal-ready"
    [[ "$(result_snapshot_value "$show_id" preconditions.resultReady)" == "true" ]] || fail "S14 $show_id result truth is not reconciled"
  done

  log "S14_INVARIANT_RESULT_COMPLETE"
  log "S14_STAGE_8_RESULTS_COMPLETE"
}
