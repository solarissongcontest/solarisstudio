#!/usr/bin/env bash
set -euo pipefail

publication_preview() {
  local show_id="$1" target_state="$2" config_json="$3"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_show_publication_change_preview \
    "{\"p_show_id\":\"$show_id\",\"p_target_state\":\"$target_state\",\"p_config\":$config_json,\"p_scheduled_for\":null}"
  expect_success "preview publication $show_id -> $target_state"
}

apply_publication_change() {
  local show_id="$1" target_state="$2" config_json="$3" operation_id="$4" idempotency_key="$5"
  local expected_version risk_class
  publication_preview "$show_id" "$target_state" "$config_json"
  expected_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
  risk_class="$(printf '%s' "$HTTP_BODY" | json_value riskClass)"
  [[ -n "$expected_version" ]] || fail "publication preview for $show_id -> $target_state omitted expected version"

  rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_show_publication_change \
    "{\"p_show_id\":\"$show_id\",\"p_target_state\":\"$target_state\",\"p_config\":$config_json,\"p_scheduled_for\":null,\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_version\":$expected_version}"
  expect_success "apply publication $show_id -> $target_state"
  expect_json "publication $show_id -> $target_state state" state "$target_state"
  [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$operation_id'::uuid and command='publication.show.change' and status='succeeded';")" == "1" ]] || fail "publication receipt missing for $show_id -> $target_state"
  if [[ "$target_state" == "public" ]]; then
    [[ "$risk_class" == "R3" ]] || fail "outcome publication for $show_id was not classified R3"
  fi
}

assert_anonymous_result_matches_version() {
  local show_id="$1" version="$2" public_json snapshot_json
  request GET "$API_URL/rest/v1/results?show_id=eq.$show_id&select=id,country_id,contest_entity_id,jury_points,televote_points,televote_components,total_points,final_rank&order=id.asc" "$ANON_KEY" "$ANON_KEY"
  expect_success "anonymous exact result lookup $show_id"
  public_json="$HTTP_BODY"
  snapshot_json="$(db_scalar "select result_rows::text from private.v3_result_versions where show_id='$show_id'::uuid and version=$version;")"
  [[ -n "$snapshot_json" ]] || fail "immutable result snapshot $show_id:$version is missing"

  printf '%s' "$public_json" | python3 -c '
import json,sys
show_id,version,snapshot_raw=sys.argv[1:4]
public_rows=json.load(sys.stdin)
snapshot=json.loads(snapshot_raw)
normalized=[]
for row in public_rows:
    normalized.append({
        "id": row.get("id"),
        "countryId": row.get("country_id"),
        "contestEntityId": row.get("contest_entity_id"),
        "juryPoints": row.get("jury_points"),
        "televotePoints": row.get("televote_points"),
        "televoteComponents": row.get("televote_components"),
        "totalPoints": row.get("total_points"),
        "finalRank": row.get("final_rank"),
    })
normalized.sort(key=lambda row: row["id"] or "")
snapshot.sort(key=lambda row: row["id"] or "")
if normalized != snapshot:
    raise SystemExit(f"anonymous public result for {show_id} does not equal immutable result version {version}")
' "$show_id" "$version" "$snapshot_json"
}

run_s14_stage_9_publication() {
  log "Stage 9/10: publish exact finalized result versions and verify anonymous public truth"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  # Stage 5 already made the semi-finals public for running-order layers. The
  # mature publication contract treats public -> public as already applied, so
  # outcome publication deliberately transitions public -> hidden -> public.
  hidden_config='{"participants":true,"artists":true,"songs":true,"semi_split":false,"running_order":true,"qualifiers":false,"results":false,"jury_results":false,"televote_results":false,"detailed_voting":false}'
  outcome_config='{"participants":true,"artists":true,"songs":true,"semi_split":false,"running_order":true,"qualifiers":false,"results":true,"jury_results":true,"televote_results":true,"detailed_voting":true}'

  show_index=0
  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    show_index=$((show_index + 1))
    suffix="$(printf '%012d' "$show_index")"

    [[ "$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$show_id'::uuid;")" == "2" ]] || fail "Stage 9 requires finalized result version 2 for $show_id"
    [[ "$(db_scalar "select (reviewed_version=2 and locked_version=2 and reveal_ready_version=2)::text from public.studio2_result_operations where show_id='$show_id'::uuid;")" == "true" ]] || fail "Stage 9 requires reviewed/locked/reveal-ready result version 2 for $show_id"

    apply_publication_change "$show_id" hidden "$hidden_config" \
      "14000000-0000-4009-8100-$suffix" "s14-hide-before-results-$show_index"
    [[ "$(db_scalar "select published::text from public.shows where id='$show_id'::uuid;")" == "false" ]] || fail "hidden publication state left $show_id public"

    # Fresh sign-in keeps the R3 publication inside the canonical fresh-auth
    # window rather than weakening the authentication contract for a rehearsal.
    sign_in 's14-organizer-a@solaris.invalid'
    ORGANIZER_A_TOKEN="$LAST_TOKEN"
    publication_preview "$show_id" public "$outcome_config"
    expect_json "publication $show_id exact source version" sourceResultVersion 2
    expect_json "publication $show_id release readiness" resultReleaseReady true
    expect_json "publication $show_id integrity readiness" integrityClear true
    expect_json "publication $show_id risk" riskClass R3

    expected_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
    operation_id="14000000-0000-4009-8200-$suffix"
    rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_show_publication_change \
      "{\"p_show_id\":\"$show_id\",\"p_target_state\":\"public\",\"p_config\":$outcome_config,\"p_scheduled_for\":null,\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"s14-publish-results-$show_index\",\"p_expected_version\":$expected_version}"
    expect_success "publish exact result version for $show_id"
    expect_json "publication $show_id is public" state public

    [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$operation_id'::uuid and command='publication.show.change' and status='succeeded';")" == "1" ]] || fail "R3 publication receipt missing for $show_id"
    [[ "$(db_scalar "select source_result_version::text from public.studio2_show_publication_controls where show_id='$show_id'::uuid;")" == "2" ]] || fail "public $show_id is not bound to immutable result version 2"
    [[ "$(db_scalar "select (state='public' and frozen_config->>'results'='true' and frozen_config->>'jury_results'='true' and frozen_config->>'televote_results'='true')::text from public.studio2_show_publication_controls where show_id='$show_id'::uuid;")" == "true" ]] || fail "public $show_id does not expose the intended result layers"
    [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='publication.changed' and aggregate_id='$show_id';")" == "1" ]] || fail "result publication.changed event missing for $show_id"

    request GET "$API_URL/rest/v1/shows?id=eq.$show_id&select=id,published,publication_config" "$ANON_KEY" "$ANON_KEY"
    expect_success "anonymous published show result config $show_id"
    expect_json "anonymous show $show_id published" '0.published' true
    expect_json "anonymous show $show_id result layer" '0.publication_config.results' true
    expect_json "anonymous show $show_id Jury layer" '0.publication_config.jury_results' true
    expect_json "anonymous show $show_id Televote layer" '0.publication_config.televote_results' true

    assert_anonymous_result_matches_version "$show_id" 2

    # Once version 2 is public, a recalculation must not silently create a new
    # current result version while Publication still points at version 2. The
    # exact-version publication invariant or locked result lifecycle must reject it.
    rpc_request "$ORGANIZER_A_TOKEN" studio2_execute_result_operation \
      "{\"p_show_id\":\"$show_id\",\"p_action\":\"calculate\",\"p_reason\":\"S14 stale public result mutation probe\",\"p_execution_id\":\"14000000-0000-4009-8300-$suffix\",\"p_expected_version\":2}"
    expect_failure "post-publication result recalculation $show_id"
    [[ "$(db_scalar "select calculation_version::text from public.studio2_result_operations where show_id='$show_id'::uuid;")" == "2" ]] || fail "failed post-publication mutation moved $show_id away from published result version 2"
  done

  [[ "$(db_scalar "select count(*) from public.studio2_show_publication_controls where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and state='public' and source_result_version=2;")" == "2" ]] || fail "both public semi-finals do not reference finalized result version 2"
  log "S14_INVARIANT_PUBLICATION_COMPLETE"
  log "S14_STAGE_9_PUBLICATION_COMPLETE"
}
