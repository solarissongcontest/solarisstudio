#!/usr/bin/env bash
set -euo pipefail

service_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "set \"request.jwt.claim.role\"='service_role'; set \"request.jwt.claims\"='{\"role\":\"service_role\"}'; $1"
}

service_exec() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; set \"request.jwt.claims\"='{\"role\":\"service_role\"}'; $1" >/dev/null
}

results_stage8_snapshot() {
  local phase="$1" show_id="${2:-}" expected_version="${3:-na}" operation_id="${4:-na}"
  local state receipt_count event_count outbox_state
  state="show_status=na publication_state=na result_state=na calculation_version=na reviewed_version=na locked_version=na reveal_ready_version=na calculation_ready=na participant_count=na jury_ballots=na jury_dnv=na televote_rows=na result_rows=na ranked_rows=na points_sum=na"
  receipt_count="na"
  event_count="na"
  outbox_state="na"

  if [[ -n "$show_id" ]]; then
    if ! state="$(service_value "
select concat_ws(' ',
  'show_status=' || coalesce((select to_jsonb(show_row)->>'status' from public.shows show_row where show_row.id='$show_id'::uuid), 'missing'),
  'publication_state=' || coalesce((select to_jsonb(show_row)->>'publication_status' from public.shows show_row where show_row.id='$show_id'::uuid), 'na'),
  'result_state=' || coalesce((
    select case
      when operation.reveal_ready_version is not null then 'reveal_ready'
      when operation.locked_version is not null then 'locked'
      when operation.reviewed_version is not null then 'reviewed'
      when operation.calculation_version > 0 then 'calculated'
      else 'uncalculated'
    end
    from public.studio2_result_operations operation
    where operation.show_id='$show_id'::uuid
  ), 'uncalculated'),
  'calculation_version=' || coalesce((select operation.calculation_version::text from public.studio2_result_operations operation where operation.show_id='$show_id'::uuid), '0'),
  'reviewed_version=' || coalesce((select operation.reviewed_version::text from public.studio2_result_operations operation where operation.show_id='$show_id'::uuid), 'null'),
  'locked_version=' || coalesce((select operation.locked_version::text from public.studio2_result_operations operation where operation.show_id='$show_id'::uuid), 'null'),
  'reveal_ready_version=' || coalesce((select operation.reveal_ready_version::text from public.studio2_result_operations operation where operation.show_id='$show_id'::uuid), 'null'),
  'calculation_ready=' || coalesce((private.studio2_result_preconditions('$show_id'::uuid)->>'calculationReady'), 'false'),
  'participant_count=' || (select count(*)::text from public.participants participant where participant.show_id='$show_id'::uuid and coalesce(participant.participation_status,'confirmed')='confirmed'),
  'jury_ballots=' || (select count(*)::text from public.jury_ballot_submissions ballot where ballot.show_id='$show_id'::uuid and ballot.status in ('submitted','needs_review','valid')),
  'jury_dnv=' || (select count(*)::text from public.jury_ballot_statuses status where status.show_id='$show_id'::uuid and status.status='did_not_vote'),
  'televote_rows=' || (select count(*)::text from public.televote_votes vote where vote.show_id='$show_id'::uuid),
  'result_rows=' || (select count(*)::text from public.results result where result.show_id='$show_id'::uuid),
  'ranked_rows=' || (select count(*)::text from public.results result where result.show_id='$show_id'::uuid and result.final_rank is not null),
  'points_sum=' || (select coalesce(sum(result.total_points),0)::text from public.results result where result.show_id='$show_id'::uuid)
);
")"; then
      state="snapshot_query_error=true"
    fi
  fi

  if [[ "$operation_id" =~ ^[0-9a-fA-F-]{36}$ ]]; then
    receipt_count="$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$operation_id'::uuid;" 2>/dev/null || printf 'query_error')"
    event_count="$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$operation_id'::uuid;" 2>/dev/null || printf 'query_error')"
    outbox_state="$(db_scalar "
select coalesce(string_agg(status || ':' || status_count::text, ',' order by status), 'none')
from (
  select outbox.status::text as status, count(*) as status_count
  from private.v3_domain_event_outbox outbox
  join private.v3_domain_events event on event.id=outbox.event_id
  where event.operation_id='$operation_id'::uuid
  group by outbox.status
) states;
" 2>/dev/null || printf 'query_error')"
  fi

  log "RESULTS_STAGE8 phase=$phase edition_id=$EDITION_ID show_id=${show_id:-na} actor=organizer capability=results.verify expectedVersion=$expected_version operation_id=$operation_id $state receipt_count=$receipt_count event_count=$event_count outbox=$outbox_state"
}

results_stage8_failure() {
  local phase="$1" show_id="$2" expected_version="$3" operation_id="$4" operation="$5" category="$6"
  local rpc_code="${7:-na}"
  results_stage8_snapshot "${phase}_failed" "$show_id" "$expected_version" "$operation_id"
  log "RESULTS_STAGE8 phase=${phase}_failed operation=$operation error_category=$category rpc_code=${rpc_code:-na} http_status=${HTTP_STATUS:-na} expectedVersion=$expected_version operation_id=$operation_id"
}

results_stage8_http_failure_if_needed() {
  local phase="$1" show_id="$2" expected_version="$3" operation_id="$4" operation="$5"
  local rpc_code
  if (( HTTP_STATUS < 200 || HTTP_STATUS >= 300 )); then
    rpc_code="$(printf '%s' "$HTTP_BODY" | json_value code 2>/dev/null || true)"
    results_stage8_failure "$phase" "$show_id" "$expected_version" "$operation_id" "$operation" "http_${HTTP_STATUS}" "${rpc_code:-na}"
  fi
}

resolve_missing_jury_ballot_as_dnv() {
  local show_id="$1" ordinal="$2"
  local voter_id voter_country_id preview_version op_id rpc_code
  results_stage8_snapshot "dnv_resolution_begin" "$show_id" "na" "na"
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
  if [[ -z "$voter_id" ]]; then
    results_stage8_failure "dnv_resolution" "$show_id" "na" "na" "resolve_missing_jury_ballot" "no_unresolved_ballot"
    fail "No unresolved missing Jury ballot exists for $show_id"
  fi
  voter_country_id="$(db_scalar "select country_id::text from public.voters where id='$voter_id'::uuid;")"
  if [[ -z "$voter_country_id" ]]; then
    results_stage8_failure "dnv_resolution" "$show_id" "na" "na" "resolve_missing_jury_ballot" "missing_country_identity"
    fail "Missing Jury voter $voter_id has no country identity"
  fi

  results_stage8_snapshot "dnv_preview_begin" "$show_id" "na" "na"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_jury_dnv_preview "{\"p_show_id\":\"$show_id\",\"p_voter_id\":\"$voter_id\",\"p_voter_country_id\":\"$voter_country_id\",\"p_voter_entity_id\":null,\"p_action\":\"set\"}"
  results_stage8_http_failure_if_needed "dnv_preview" "$show_id" "na" "na" "studio2_jury_dnv_preview"
  expect_success "DNV preview $show_id"
  expect_json "DNV preview risk $show_id" riskClass R2
  expect_json "DNV has no saved scores $show_id" savedVoteRows 0
  preview_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
  if [[ ! "$preview_version" =~ ^[0-9]+$ ]]; then
    results_stage8_failure "dnv_preview" "$show_id" "na" "na" "studio2_jury_dnv_preview" "invalid_expected_version"
    fail "DNV preview returned invalid version for $show_id"
  fi
  results_stage8_snapshot "dnv_preview_complete" "$show_id" "$preview_version" "na"

  op_id="14000000-0000-4008-8100-$(printf '%012d' "$ordinal")"
  results_stage8_snapshot "dnv_apply_begin" "$show_id" "$preview_version" "$op_id"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_jury_dnv "{\"p_show_id\":\"$show_id\",\"p_voter_id\":\"$voter_id\",\"p_voter_country_id\":\"$voter_country_id\",\"p_voter_entity_id\":null,\"p_action\":\"set\",\"p_reason\":\"S14 missing Jury ballot resolved as authorized DNV\",\"p_operation_id\":\"$op_id\",\"p_idempotency_key\":\"s14-results-dnv-$ordinal\",\"p_expected_version\":$preview_version}"
  results_stage8_http_failure_if_needed "dnv_apply" "$show_id" "$preview_version" "$op_id" "studio2_apply_jury_dnv"
  expect_success "authorize missing Jury ballot as DNV $show_id"
  expect_json "DNV action $show_id" action set
  if [[ "$(db_scalar "select count(*) from public.jury_ballot_statuses where show_id='$show_id'::uuid and voter_id='$voter_id'::uuid and status='did_not_vote';")" != "1" ]]; then
    results_stage8_failure "dnv_apply" "$show_id" "$preview_version" "$op_id" "studio2_apply_jury_dnv" "dnv_truth_missing"
    fail "DNV truth was not persisted for $show_id"
  fi
  results_stage8_snapshot "dnv_apply_complete" "$show_id" "$preview_version" "$op_id"
  results_stage8_snapshot "dnv_resolution_complete" "$show_id" "$preview_version" "$op_id"
}

exercise_result_timeout_before_commit() {
  local show_id="$1" expected_version="$2" ordinal="$3"
  local execution_id lock_pid timeout_log
  execution_id="14000000-0000-4008-8200-$(printf '%012d' "$ordinal")"
  timeout_log="$(mktemp)"
  results_stage8_snapshot "timeout_guard_begin" "$show_id" "$expected_version" "$execution_id"

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
    results_stage8_failure "timeout_guard" "$show_id" "$expected_version" "$execution_id" "studio2_execute_result_operation" "unexpected_commit"
    fail "Results timeout-before-commit injection unexpectedly committed"
  fi
  wait "$lock_pid" || true
  grep -Eqi 'statement timeout|canceling statement' "$timeout_log" || {
    cat "$timeout_log" >&2
    rm -f "$timeout_log"
    results_stage8_failure "timeout_guard" "$show_id" "$expected_version" "$execution_id" "studio2_execute_result_operation" "unexpected_database_error"
    fail "Results timeout injection failed for a reason other than the bounded database timeout"
  }
  rm -f "$timeout_log"
  if [[ "$(db_scalar "select count(*) from public.studio2_result_operation_executions where execution_id='$execution_id'::uuid;")" != "0" ]]; then
    results_stage8_failure "timeout_guard" "$show_id" "$expected_version" "$execution_id" "studio2_execute_result_operation" "execution_receipt_after_timeout"
    fail "timed-out Results operation left an execution receipt"
  fi
  if [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$execution_id'::uuid;")" != "0" ]]; then
    results_stage8_failure "timeout_guard" "$show_id" "$expected_version" "$execution_id" "studio2_execute_result_operation" "operation_receipt_after_timeout"
    fail "timed-out Results operation left an S2 receipt"
  fi
  if [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$execution_id'::uuid;")" != "0" ]]; then
    results_stage8_failure "timeout_guard" "$show_id" "$expected_version" "$execution_id" "studio2_execute_result_operation" "domain_event_after_timeout"
    fail "timed-out Results operation emitted a DomainEvent"
  fi
  results_stage8_snapshot "timeout_guard_complete" "$show_id" "$expected_version" "$execution_id"
  log "S14_FAILURE_DB_TIMEOUT_COMPLETE"
}

execute_result_action() {
  local show_id="$1" action="$2" execution_id="$3" expected_version="$4" reason="$5"
  local phase actual_show_id
  case "$action" in
    calculate) phase="calculate_results" ;;
    review) phase="review_results" ;;
    lock) phase="lock_results" ;;
    mark_reveal_ready) phase="reveal_results" ;;
    *) phase="result_action_${action}" ;;
  esac
  results_stage8_snapshot "${phase}_begin" "$show_id" "$expected_version" "$execution_id"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_execute_result_operation "{\"p_show_id\":\"$show_id\",\"p_action\":\"$action\",\"p_reason\":\"$reason\",\"p_execution_id\":\"$execution_id\",\"p_expected_version\":$expected_version}"
  results_stage8_http_failure_if_needed "$phase" "$show_id" "$expected_version" "$execution_id" "studio2_execute_result_operation:$action"
  expect_success "Results $action $show_id"
  actual_show_id="$(printf '%s' "$HTTP_BODY" | json_value showId 2>/dev/null || true)"
  if [[ "$actual_show_id" != "$show_id" ]]; then
    results_stage8_failure "$phase" "$show_id" "$expected_version" "$execution_id" "studio2_execute_result_operation:$action" "unexpected_show_identity"
  fi
  expect_json "Results $action show identity" showId "$show_id"
  results_stage8_snapshot "${phase}_complete" "$show_id" "$expected_version" "$execution_id"
}

verify_result_snapshot_matches_current() {
  local show_id="$1" version="$2"
  local matches
  results_stage8_snapshot "immutable_snapshot_begin" "$show_id" "$version" "na"
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
  if [[ "$matches" != "true" ]]; then
    results_stage8_failure "immutable_snapshot" "$show_id" "$version" "na" "verify_result_snapshot_matches_current" "snapshot_mismatch"
    fail "immutable Results version $version for $show_id is not reproducible from current canonical output"
  fi
  results_stage8_snapshot "immutable_snapshot_complete" "$show_id" "$version" "na"
}

recover_results_worker_after_crash() {
  local operation_id="$1"
  local event_id first_claim second_claim show_id
  show_id="$(db_scalar "select show_id::text from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='results.calculated';")"
  results_stage8_snapshot "event_outbox_recovery_begin" "$show_id" "na" "$operation_id"
  event_id="$(db_scalar "select id::text from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='results.calculated';")"
  if [[ -z "$event_id" ]]; then
    results_stage8_failure "event_outbox_recovery" "$show_id" "na" "$operation_id" "results.tasks" "missing_calculated_event"
    fail "Results worker-crash injection has no calculated DomainEvent"
  fi

  first_claim="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('results.tasks','s14-crash-worker',100,1);")"
  if ! printf '%s\n' "$first_claim" | grep -Fxq "$event_id"; then
    results_stage8_failure "event_outbox_recovery" "$show_id" "na" "$operation_id" "results.tasks" "initial_lease_missing"
    fail "crash worker did not lease Results event $event_id"
  fi
  # Deliberately do not process the lease. This models a worker dying after
  # claim. After expiry, the same durable outbox row must become claimable.
  sleep 2
  second_claim="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('results.tasks','s14-recovery-worker',100,60);")"
  if ! printf '%s\n' "$second_claim" | grep -Fxq "$event_id"; then
    results_stage8_failure "event_outbox_recovery" "$show_id" "na" "$operation_id" "results.tasks" "expired_lease_not_reclaimable"
    fail "expired Results lease was not reclaimable after worker crash"
  fi
  while IFS= read -r claimed; do
    [[ -n "$claimed" ]] || continue
    service_exec "select public.studio2_process_results_domain_event('$claimed'::uuid,'results.tasks','s14-recovery-worker');"
  done <<< "$second_claim"
  if [[ "$(db_scalar "select count(*) from private.v3_domain_event_outbox where event_id='$event_id'::uuid and consumer_key='results.tasks' and status='completed';")" != "1" ]]; then
    results_stage8_failure "event_outbox_recovery" "$show_id" "na" "$operation_id" "results.tasks" "delivery_not_completed"
    fail "recovered Results outbox delivery did not complete"
  fi
  if [[ "$(db_scalar "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$event_id'::uuid and consumer_key='results.tasks';")" != "1" ]]; then
    results_stage8_failure "event_outbox_recovery" "$show_id" "na" "$operation_id" "results.tasks" "consumer_receipt_missing"
    fail "recovered Results delivery has no consumer receipt"
  fi
  results_stage8_snapshot "event_outbox_recovery_complete" "$show_id" "na" "$operation_id"
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
  results_stage8_snapshot "televote_materialization_begin" "$SEMI_ONE_ID" "na" "na"
  if ! V3_VERIFICATION_TARGET=local V3_DESTRUCTIVE_VERIFICATION=1 API_URL="$API_URL" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    bun run scripts/v3-s14-materialize-televote-results.ts "$TV_ROUND_ID" "$SEMI_ONE_ID" "$EDITION_ID" >/tmp/s14-results-semi-one.json; then
    results_stage8_failure "televote_materialization" "$SEMI_ONE_ID" "na" "na" "v3-s14-materialize-televote-results" "adapter_failed"
    fail "Stage 8 Televote materialization failed for $SEMI_ONE_ID"
  fi
  results_stage8_snapshot "televote_materialization_complete" "$SEMI_ONE_ID" "na" "na"

  results_stage8_snapshot "televote_materialization_begin" "$SEMI_TWO_ID" "na" "na"
  if ! V3_VERIFICATION_TARGET=local V3_DESTRUCTIVE_VERIFICATION=1 API_URL="$API_URL" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    bun run scripts/v3-s14-materialize-televote-results.ts "$TV_ROUND_TWO_ID" "$SEMI_TWO_ID" "$EDITION_ID" >/tmp/s14-results-semi-two.json; then
    results_stage8_failure "televote_materialization" "$SEMI_TWO_ID" "na" "na" "v3-s14-materialize-televote-results" "adapter_failed"
    fail "Stage 8 Televote materialization failed for $SEMI_TWO_ID"
  fi
  results_stage8_snapshot "televote_materialization_complete" "$SEMI_TWO_ID" "na" "na"

  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    results_stage8_snapshot "source_completeness_begin" "$show_id" "na" "na"
    participant_count="$(db_scalar "select count(*) from public.participants where show_id='$show_id'::uuid and coalesce(participation_status,'confirmed')='confirmed';")"
    televote_count="$(db_scalar "select count(*) from public.televote_votes where show_id='$show_id'::uuid;")"
    if [[ "$televote_count" != "$participant_count" ]]; then
      results_stage8_failure "source_completeness" "$show_id" "na" "na" "canonical_televote_rows" "televote_participant_count_mismatch"
      fail "show $show_id has $televote_count canonical Televote rows for $participant_count participants"
    fi
    results_stage8_snapshot "source_completeness_complete" "$show_id" "na" "na"
  done

  # Calculation must fail while the two intentionally missing Jury ballots from
  # Stage 6 remain unresolved. This proves Results consumes canonical integrity
  # state rather than silently treating missing ballots as zero.
  initial_version="$(db_scalar "select coalesce((select calculation_version from public.studio2_result_operations where show_id='$SEMI_ONE_ID'::uuid),0);")"
  missing_input_id="14000000-0000-4008-8000-000000000001"
  results_stage8_snapshot "incomplete_input_rejection_begin" "$SEMI_ONE_ID" "$initial_version" "$missing_input_id"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_execute_result_operation "{\"p_show_id\":\"$SEMI_ONE_ID\",\"p_action\":\"calculate\",\"p_reason\":\"S14 must reject incomplete Jury input\",\"p_execution_id\":\"$missing_input_id\",\"p_expected_version\":$initial_version}"
  if (( HTTP_STATUS < 400 )); then
    results_stage8_failure "incomplete_input_rejection" "$SEMI_ONE_ID" "$initial_version" "$missing_input_id" "studio2_execute_result_operation:calculate" "unexpected_success"
  fi
  expect_failure "Results calculation with missing Jury ballot"
  if [[ "$HTTP_BODY" != *"validation is not ready"* ]]; then
    rpc_code="$(printf '%s' "$HTTP_BODY" | json_value code 2>/dev/null || true)"
    results_stage8_failure "incomplete_input_rejection" "$SEMI_ONE_ID" "$initial_version" "$missing_input_id" "studio2_execute_result_operation:calculate" "unexpected_error_contract" "${rpc_code:-na}"
    fail "missing-input Results failure lost its canonical reason: $HTTP_BODY"
  fi
  if [[ "$(db_scalar "select count(*) from public.studio2_result_operation_executions where execution_id='$missing_input_id'::uuid;")" != "0" ]]; then
    results_stage8_failure "incomplete_input_rejection" "$SEMI_ONE_ID" "$initial_version" "$missing_input_id" "studio2_execute_result_operation:calculate" "rejected_execution_persisted"
    fail "rejected missing-input calculation persisted an execution"
  fi
  results_stage8_snapshot "incomplete_input_rejection_complete" "$SEMI_ONE_ID" "$initial_version" "$missing_input_id"

  resolve_missing_jury_ballot_as_dnv "$SEMI_ONE_ID" 1
  resolve_missing_jury_ballot_as_dnv "$SEMI_TWO_ID" 2
  if [[ "$(db_scalar "select count(*) from public.jury_ballot_statuses where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and status='did_not_vote';")" != "2" ]]; then
    results_stage8_failure "dnv_resolution" "$SEMI_ONE_ID" "na" "na" "jury_ballot_statuses" "unexpected_dnv_total"
    fail "S14 did not preserve exactly two authorized DNV resolutions"
  fi

  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    version="$(db_scalar "select coalesce((select calculation_version from public.studio2_result_operations where show_id='$show_id'::uuid),0);")"
    results_stage8_snapshot "calculation_readiness_begin" "$show_id" "$version" "na"
    ready="$(service_value "select (private.studio2_result_preconditions('$show_id'::uuid)->>'calculationReady');")"
    if [[ "$ready" != "true" ]]; then
      results_stage8_failure "calculation_readiness" "$show_id" "$version" "na" "private.studio2_result_preconditions" "not_ready"
      fail "show $show_id is still not calculation-ready after integrity resolution"
    fi
    results_stage8_snapshot "calculation_readiness_complete" "$show_id" "$version" "na"
  done

  current_version="$(db_scalar "select coalesce((select calculation_version from public.studio2_result_operations where show_id='$SEMI_ONE_ID'::uuid),0);")"
  exercise_result_timeout_before_commit "$SEMI_ONE_ID" "$current_version" 1
  if [[ "$(db_scalar "select coalesce((select calculation_version from public.studio2_result_operations where show_id='$SEMI_ONE_ID'::uuid),0);")" != "$current_version" ]]; then
    results_stage8_failure "timeout_guard" "$SEMI_ONE_ID" "$current_version" "14000000-0000-4008-8200-000000000001" "studio2_execute_result_operation:calculate" "version_changed_after_timeout"
    fail "timed-out Results operation changed the calculation version"
  fi

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
    results_stage8_snapshot "calculation_artifact_validation_begin" "$show_id" "$version" "$calculate_id"
    if [[ ! "$version" =~ ^[1-9][0-9]*$ ]]; then
      results_stage8_failure "calculation_artifact_validation" "$show_id" "$version" "$calculate_id" "studio2_execute_result_operation:calculate" "invalid_calculation_version"
      fail "Results calculate returned invalid version for $show_id"
    fi
    if [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id='$show_id'::uuid and version=$version;")" != "1" ]]; then
      results_stage8_failure "calculation_artifact_validation" "$show_id" "$version" "$calculate_id" "private.v3_result_versions" "immutable_version_missing"
      fail "Results calculate did not capture immutable version $version"
    fi
    verify_result_snapshot_matches_current "$show_id" "$version"
    results_stage8_snapshot "calculation_artifact_validation_complete" "$show_id" "$version" "$calculate_id"

    execute_result_action "$show_id" review "$review_id" "$version" "S14 independent result validation completed"
    execute_result_action "$show_id" lock "$lock_id" "$version" "S14 lock verified result version"
    execute_result_action "$show_id" mark_reveal_ready "$reveal_id" "$version" "S14 result version approved for reveal"

    results_stage8_snapshot "event_outbox_assertions_begin" "$show_id" "$version" "$calculate_id"
    lifecycle="$(db_scalar "select calculation_version::text || ':' || reviewed_version::text || ':' || locked_version::text || ':' || reveal_ready_version::text from public.studio2_result_operations where show_id='$show_id'::uuid;")"
    if [[ "$lifecycle" != "$version:$version:$version:$version" ]]; then
      results_stage8_failure "event_outbox_assertions" "$show_id" "$version" "$calculate_id" "results_lifecycle" "lifecycle_pointer_mismatch"
      fail "Results lifecycle pointers for $show_id are not bound to exact version $version ($lifecycle)"
    fi
    if [[ "$(db_scalar "select count(*) from public.studio2_result_operation_executions where show_id='$show_id'::uuid and calculation_version=$version and action in ('calculate','review','lock','mark_reveal_ready');")" != "4" ]]; then
      results_stage8_failure "event_outbox_assertions" "$show_id" "$version" "$calculate_id" "studio2_result_operation_executions" "execution_history_incomplete"
      fail "Results lifecycle execution history for $show_id is incomplete"
    fi
    if [[ "$(db_scalar "select count(*) from private.v3_domain_events where show_id='$show_id'::uuid and aggregate_version=$version and event_type in ('results.calculated','results.verified','results.locked');")" != "3" ]]; then
      results_stage8_failure "event_outbox_assertions" "$show_id" "$version" "$calculate_id" "private.v3_domain_events" "domain_event_lifecycle_incomplete"
      fail "Results DomainEvent lifecycle for $show_id is incomplete"
    fi
    results_stage8_snapshot "event_outbox_assertions_complete" "$show_id" "$version" "$calculate_id"
  done

  results_stage8_snapshot "final_immutable_verification_begin" "$SEMI_ONE_ID" "$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$SEMI_ONE_ID'::uuid;")" "na"
  verify_result_snapshot_matches_current "$SEMI_ONE_ID" "$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$SEMI_ONE_ID'::uuid;")"
  results_stage8_snapshot "final_immutable_verification_complete" "$SEMI_ONE_ID" "$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$SEMI_ONE_ID'::uuid;")" "na"

  results_stage8_snapshot "final_immutable_verification_begin" "$SEMI_TWO_ID" "$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$SEMI_TWO_ID'::uuid;")" "na"
  verify_result_snapshot_matches_current "$SEMI_TWO_ID" "$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$SEMI_TWO_ID'::uuid;")"
  results_stage8_snapshot "final_immutable_verification_complete" "$SEMI_TWO_ID" "$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$SEMI_TWO_ID'::uuid;")" "na"
  log "S14_INVARIANT_RESULT_COMPLETE"

  recover_results_worker_after_crash "$first_calculate_id"
  rm -f /tmp/s14-results-semi-one.json /tmp/s14-results-semi-two.json
  results_stage8_snapshot "stage_complete" "$SEMI_TWO_ID" "$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$SEMI_TWO_ID'::uuid;")" "na"
  log "S14_STAGE_8_RESULTS_COMPLETE"
}
