#!/usr/bin/env bash
set -euo pipefail

service_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "set \"request.jwt.claim.role\"='service_role'; set \"request.jwt.claims\"='{\"role\":\"service_role\"}'; $1"
}

service_exec() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; set \"request.jwt.claims\"='{\"role\":\"service_role\"}'; $1" >/dev/null
}

resolve_missing_jury_ballot_as_dnv() {
  local show_id="$1" ordinal="$2"
  local voter_id voter_country_id preview_version op_id
  voter_id="$(db_scalar "
select voter.id::text
from public.voters voter
where voter.show_id='$show_id'::uuid
  and not exists (
    select 1 from public.jury_ballot_submissions ballot
    where ballot.show_id=voter.show_id
      and ballot.voter_country_id=voter.country_id
      and ballot.status in ('submitted','needs_review','valid')
  )
  and not exists (
    select 1 from public.jury_ballot_statuses status
    where status.show_id=voter.show_id
      and status.status='did_not_vote'
      and (status.voter_id=voter.id or status.voter_country_id=voter.country_id)
  )
order by voter.sort_order,voter.id
limit 1;
")"
  [[ -n "$voter_id" ]] || fail "No unresolved missing Jury ballot exists for $show_id"
  voter_country_id="$(db_scalar "select country_id::text from public.voters where id='$voter_id'::uuid;")"
  [[ -n "$voter_country_id" ]] || fail "Missing Jury voter $voter_id has no country identity"

  rpc_request "$ORGANIZER_A_TOKEN" studio2_jury_dnv_preview "{\"p_show_id\":\"$show_id\",\"p_voter_id\":\"$voter_id\",\"p_voter_country_id\":\"$voter_country_id\",\"p_voter_entity_id\":null,\"p_action\":\"set\"}"
  expect_success "DNV preview $show_id"
  expect_json "DNV preview risk $show_id" riskClass R2
  expect_json "DNV has no saved scores $show_id" savedVoteRows 0
  preview_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
  [[ "$preview_version" =~ ^[0-9]+$ ]] || fail "DNV preview returned invalid version for $show_id"

  op_id="14000000-0000-4008-8100-$(printf '%012d' "$ordinal")"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_jury_dnv "{\"p_show_id\":\"$show_id\",\"p_voter_id\":\"$voter_id\",\"p_voter_country_id\":\"$voter_country_id\",\"p_voter_entity_id\":null,\"p_action\":\"set\",\"p_reason\":\"S14 missing Jury ballot resolved as authorized DNV\",\"p_operation_id\":\"$op_id\",\"p_idempotency_key\":\"s14-results-dnv-$ordinal\",\"p_expected_version\":$preview_version}"
  expect_success "authorize missing Jury ballot as DNV $show_id"
  expect_json "DNV accepted $show_id" ok true
  expect_json "DNV state $show_id" dnv true
  expect_json "DNV show identity $show_id" showId "$show_id"
  expect_json "DNV operation identity $show_id" operationId "$op_id"
  [[ "$(db_scalar "select count(*) from public.jury_ballot_statuses where show_id='$show_id'::uuid and voter_id='$voter_id'::uuid and status='did_not_vote';")" == "1" ]] || fail "DNV truth was not persisted for $show_id"
}

review_s14_submitted_jury_ballots() {
  local ballot_id country_suffix preview_version review_id review_rows reviewed_count=0
  local votes_before votes_after
  votes_before="$(db_scalar "select md5(jsonb_agg(to_jsonb(v) order by v.id)::text) from public.jury_votes v where v.show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid);")"
  review_rows="$(db_scalar "select id::text || '|' || right(voter_country_id::text,12) from public.jury_ballot_submissions where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and status='submitted' order by show_id,voter_country_id;")"
  while IFS='|' read -r ballot_id country_suffix; do
    [[ -n "$ballot_id" ]] || continue
    rpc_request "$ORGANIZER_A_TOKEN" studio2_jury_ballot_review_preview "{\"p_ballot_id\":\"$ballot_id\",\"p_target_status\":\"valid\"}"
    expect_success "preview submitted Jury ballot review $ballot_id"
    expect_json "Jury review risk $ballot_id" riskClass R2
    expect_json "Jury review current state $ballot_id" currentStatus submitted
    expect_json "Jury review saved scores $ballot_id" voteRows 10
    preview_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
    [[ "$preview_version" =~ ^[0-9]+$ ]] || fail "Jury review preview omitted expected version"
    review_id="14000000-0000-4008-8700-$country_suffix"
    rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_jury_ballot_review "{\"p_ballot_id\":\"$ballot_id\",\"p_target_status\":\"valid\",\"p_reason\":\"S14 Organizer reviewed immutable submitted Jury evidence\",\"p_operation_id\":\"$review_id\",\"p_idempotency_key\":\"s14-results-jury-review-$ballot_id\",\"p_expected_version\":$preview_version}"
    expect_success "review submitted Jury ballot $ballot_id"
    expect_json "Jury review accepted $ballot_id" ok true
    expect_json "Jury review canonical state $ballot_id" status valid
    expect_json "Jury review ballot identity $ballot_id" ballotId "$ballot_id"
    expect_json "Jury review operation identity $ballot_id" operationId "$review_id"
    [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$review_id'::uuid and command='jury.ballot.review.valid' and status='succeeded';")" == "1" ]] || fail "Jury review omitted successful canonical receipt"
    reviewed_count=$((reviewed_count+1))
  done <<< "$review_rows"
  [[ "$reviewed_count" == "64" ]] || fail "S14 reviewed $reviewed_count submitted Jury ballots instead of 64"
  [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and status='valid';")" == "64" ]] || fail "Jury review did not persist all 64 valid states"
  votes_after="$(db_scalar "select md5(jsonb_agg(to_jsonb(v) order by v.id)::text) from public.jury_votes v where v.show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid);")"
  [[ "$votes_before" == "$votes_after" ]] || fail "Organizer review changed immutable Jury score evidence"
}

exercise_result_timeout_before_commit() {
  local show_id="$1" expected_version="$2" ordinal="$3"
  local execution_id lock_pid timeout_log
  execution_id="14000000-0000-4008-8200-$(printf '%012d' "$ordinal")"
  timeout_log="$(mktemp)"

  (
    psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq <<SQL >/dev/null
select pg_advisory_lock(hashtextextended('studio2-results:$show_id',0));
select pg_sleep(1.2);
select pg_advisory_unlock(hashtextextended('studio2-results:$show_id',0));
SQL
  ) &
  lock_pid=$!
  sleep 0.15

  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q >"$timeout_log" 2>&1 <<SQL
begin;
set local statement_timeout='150ms';
set local "request.jwt.claim.role"='service_role';
set local "request.jwt.claims"='{"role":"service_role"}';
select public.studio2_execute_result_operation(
  '$show_id'::uuid,
  'calculate',
  'S14 timeout-before-commit injection',
  '$execution_id'::uuid,
  $expected_version
);
commit;
SQL
  then
    wait "$lock_pid" || true
    cat "$timeout_log" >&2
    rm -f "$timeout_log"
    fail "Results timeout-before-commit injection unexpectedly committed"
  fi
  wait "$lock_pid" || true
  grep -Eqi 'statement timeout|canceling statement' "$timeout_log" || {
    cat "$timeout_log" >&2
    rm -f "$timeout_log"
    fail "Results timeout injection failed for a reason other than the bounded database timeout"
  }
  rm -f "$timeout_log"
  [[ "$(db_scalar "select count(*) from public.studio2_result_operation_executions where execution_id='$execution_id'::uuid;")" == "0" ]] || fail "timed-out Results operation left an execution receipt"
  [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$execution_id'::uuid;")" == "0" ]] || fail "timed-out Results operation left an S2 receipt"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$execution_id'::uuid;")" == "0" ]] || fail "timed-out Results operation emitted a DomainEvent"
  log "S14_FAILURE_DB_TIMEOUT_COMPLETE"
}

execute_result_action() {
  local show_id="$1" action="$2" execution_id="$3" expected_version="$4" reason="$5"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_execute_result_operation "{\"p_show_id\":\"$show_id\",\"p_action\":\"$action\",\"p_reason\":\"$reason\",\"p_execution_id\":\"$execution_id\",\"p_expected_version\":$expected_version}"
  expect_success "Results $action $show_id"
  expect_json "Results $action show identity" showId "$show_id"
}

verify_result_snapshot_matches_current() {
  local show_id="$1" version="$2"
  local matches
  matches="$(db_scalar "
select (
  version_row.result_rows = coalesce((
    select jsonb_agg(
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
    )
    from public.results result
    where result.show_id='$show_id'::uuid
  ), '[]'::jsonb)
)::text
from private.v3_result_versions version_row
where version_row.show_id='$show_id'::uuid and version_row.version=$version;
")"
  [[ "$matches" == "true" ]] || fail "immutable Results version $version for $show_id is not reproducible from current canonical output"
}

recover_results_worker_after_crash() {
  local operation_id="$1"
  local event_id first_claim second_claim
  event_id="$(db_scalar "select id::text from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='results.calculated';")"
  [[ -n "$event_id" ]] || fail "Results worker-crash injection has no calculated DomainEvent"

  first_claim="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('results.tasks','s14-crash-worker',100,5);")"
  printf '%s\n' "$first_claim" | grep -Fxq "$event_id" || fail "crash worker did not lease Results event $event_id"
  # Deliberately do not process the lease. This models a worker dying after
  # claim. After expiry, the same durable outbox row must become claimable.
  sleep 6
  second_claim="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('results.tasks','s14-recovery-worker',100,60);")"
  printf '%s\n' "$second_claim" | grep -Fxq "$event_id" || fail "expired Results lease was not reclaimable after worker crash"
  while IFS= read -r claimed; do
    [[ -n "$claimed" ]] || continue
    service_exec "select public.studio2_process_results_domain_event('$claimed'::uuid,'results.tasks','s14-recovery-worker');"
  done <<< "$second_claim"
  [[ "$(db_scalar "select count(*) from private.v3_domain_event_outbox where event_id='$event_id'::uuid and consumer_key='results.tasks' and status='completed';")" == "1" ]] || fail "recovered Results outbox delivery did not complete"
  [[ "$(db_scalar "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$event_id'::uuid and consumer_key='results.tasks';")" == "1" ]] || fail "recovered Results delivery has no consumer receipt"
  log "S14_FAILURE_WORKER_CRASH_COMPLETE"
}

run_s14_stage_8_results() {
  log "Stage 8/10: Results calculation, integrity resolution, immutable verification and finalization"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  # Convert the already-accepted Stage 7 ballots with Solaris' production
  # rank-weighted Televote math and project those official totals into the
  # canonical Results input. The adapter is local-only and validates exact
  # round/show lineup identity before writing anything.
  V3_VERIFICATION_TARGET=local V3_DESTRUCTIVE_VERIFICATION=1 API_URL="$API_URL" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    bun run scripts/v3-s14-materialize-televote-results.ts "$TV_ROUND_ID" "$SEMI_ONE_ID" "$EDITION_ID" >/tmp/s14-results-semi-one.json
  V3_VERIFICATION_TARGET=local V3_DESTRUCTIVE_VERIFICATION=1 API_URL="$API_URL" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    bun run scripts/v3-s14-materialize-televote-results.ts "$TV_ROUND_TWO_ID" "$SEMI_TWO_ID" "$EDITION_ID" >/tmp/s14-results-semi-two.json

  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    participant_count="$(db_scalar "select count(*) from public.participants where show_id='$show_id'::uuid and coalesce(participation_status,'confirmed')='confirmed';")"
    televote_count="$(db_scalar "select count(*) from public.televote_votes where show_id='$show_id'::uuid;")"
    [[ "$televote_count" == "$participant_count" ]] || fail "show $show_id has $televote_count canonical Televote rows for $participant_count participants"
  done

  # Calculation must fail while the two intentionally missing Jury ballots from
  # Stage 6 remain unresolved. This proves Results consumes canonical integrity
  # state rather than silently treating missing ballots as zero.
  initial_version="$(db_scalar "select coalesce((select calculation_version from public.studio2_result_operations where show_id='$SEMI_ONE_ID'::uuid),0);")"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_execute_result_operation "{\"p_show_id\":\"$SEMI_ONE_ID\",\"p_action\":\"calculate\",\"p_reason\":\"S14 must reject incomplete Jury input\",\"p_execution_id\":\"14000000-0000-4008-8000-000000000001\",\"p_expected_version\":$initial_version}"
  expect_failure "Results calculation with missing Jury ballot"
  [[ "$HTTP_BODY" == *"validation is not ready"* ]] || fail "missing-input Results failure lost its canonical reason: $HTTP_BODY"
  [[ "$(db_scalar "select count(*) from public.studio2_result_operation_executions where execution_id='14000000-0000-4008-8000-000000000001'::uuid;")" == "0" ]] || fail "rejected missing-input calculation persisted an execution"

  resolve_missing_jury_ballot_as_dnv "$SEMI_ONE_ID" 1
  resolve_missing_jury_ballot_as_dnv "$SEMI_TWO_ID" 2
  [[ "$(db_scalar "select count(*) from public.jury_ballot_statuses where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and status='did_not_vote';")" == "2" ]] || fail "S14 did not preserve exactly two authorized DNV resolutions"

  review_s14_submitted_jury_ballots

  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    readiness="$(service_value "select private.studio2_result_preconditions('$show_id'::uuid)::text;")"
    ready="$(printf '%s' "$readiness" | json_value calculationReady)"
    [[ "$ready" == "true" ]] || fail "show $show_id is still not calculation-ready after integrity resolution: $readiness"
  done

  current_version="$(db_scalar "select coalesce((select calculation_version from public.studio2_result_operations where show_id='$SEMI_ONE_ID'::uuid),0);")"
  exercise_result_timeout_before_commit "$SEMI_ONE_ID" "$current_version" 1
  [[ "$(db_scalar "select coalesce((select calculation_version from public.studio2_result_operations where show_id='$SEMI_ONE_ID'::uuid),0);")" == "$current_version" ]] || fail "timed-out Results operation changed the calculation version"

  first_calculate_id='14000000-0000-4008-8300-000000000001'
  show_ordinal=0
  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    show_ordinal=$((show_ordinal+1))
    version="$(db_scalar "select coalesce((select calculation_version from public.studio2_result_operations where show_id='$show_id'::uuid),0);")"
    calculate_id="14000000-0000-4008-8300-$(printf '%012d' "$show_ordinal")"
    review_id="14000000-0000-4008-8400-$(printf '%012d' "$show_ordinal")"
    lock_id="14000000-0000-4008-8500-$(printf '%012d' "$show_ordinal")"
    reveal_id="14000000-0000-4008-8600-$(printf '%012d' "$show_ordinal")"

    execute_result_action "$show_id" calculate "$calculate_id" "$version" "S14 calculate reconciled official show result"
    version="$(printf '%s' "$HTTP_BODY" | json_value calculationVersion)"
    [[ "$version" =~ ^[1-9][0-9]*$ ]] || fail "Results calculate returned invalid version for $show_id"
    [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id='$show_id'::uuid and version=$version;")" == "1" ]] || fail "Results calculate did not capture immutable version $version"
    verify_result_snapshot_matches_current "$show_id" "$version"

    execute_result_action "$show_id" review "$review_id" "$version" "S14 independent result validation completed"
    execute_result_action "$show_id" lock "$lock_id" "$version" "S14 lock verified result version"
    execute_result_action "$show_id" mark_reveal_ready "$reveal_id" "$version" "S14 result version approved for reveal"

    lifecycle="$(db_scalar "select calculation_version::text || ':' || reviewed_version::text || ':' || locked_version::text || ':' || reveal_ready_version::text from public.studio2_result_operations where show_id='$show_id'::uuid;")"
    [[ "$lifecycle" == "$version:$version:$version:$version" ]] || fail "Results lifecycle pointers for $show_id are not bound to exact version $version ($lifecycle)"
    [[ "$(db_scalar "select count(*) from public.studio2_result_operation_executions where show_id='$show_id'::uuid and calculation_version=$version and action in ('calculate','review','lock','mark_reveal_ready');")" == "4" ]] || fail "Results lifecycle execution history for $show_id is incomplete"
    [[ "$(db_scalar "select count(*) from private.v3_domain_events where show_id='$show_id'::uuid and aggregate_version=$version and event_type in ('results.calculated','results.verified','results.locked');")" == "3" ]] || fail "Results DomainEvent lifecycle for $show_id is incomplete"
  done

  verify_result_snapshot_matches_current "$SEMI_ONE_ID" "$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$SEMI_ONE_ID'::uuid;")"
  verify_result_snapshot_matches_current "$SEMI_TWO_ID" "$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$SEMI_TWO_ID'::uuid;")"
  log "S14_INVARIANT_RESULT_COMPLETE"

  recover_results_worker_after_crash "$first_calculate_id"
  rm -f /tmp/s14-results-semi-one.json /tmp/s14-results-semi-two.json
  log "S14_STAGE_8_RESULTS_COMPLETE"
}
