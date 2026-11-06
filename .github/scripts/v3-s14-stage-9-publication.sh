#!/usr/bin/env bash
set -euo pipefail

normalise_json() {
  python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin),sort_keys=True,separators=(",",":")))'
}

anonymous_result_snapshot() {
  local show_id="$1"
  request GET "$API_URL/rest/v1/results?show_id=eq.$show_id&select=id,country_id,jury_points,televote_points,total_points,final_rank&order=id.asc" "$ANON_KEY" "$ANON_KEY"
  expect_success "anonymous Results refresh $show_id" >&2
  printf '%s' "$HTTP_BODY" | normalise_json
}

immutable_result_snapshot() {
  local show_id="$1" version="$2"
  db_scalar "
select coalesce(jsonb_agg(
  jsonb_build_object(
    'id', item ->> 'id',
    'country_id', item ->> 'countryId',
    'jury_points', (item ->> 'juryPoints')::integer,
    'televote_points', (item ->> 'televotePoints')::integer,
    'total_points', (item ->> 'totalPoints')::integer,
    'final_rank', (item ->> 'finalRank')::integer
  ) order by item ->> 'id'
), '[]'::jsonb)::text
from private.v3_result_versions version_row
cross join lateral jsonb_array_elements(version_row.result_rows) item
where version_row.show_id='$show_id'::uuid and version_row.version=$version;
" | normalise_json
}

apply_publication_change() {
  local show_id="$1" target_state="$2" config="$3" operation_id="$4" idempotency_key="$5"
  local expected_version

  rpc_request "$ORGANIZER_A_TOKEN" studio2_show_publication_change_preview \
    "{\"p_show_id\":\"$show_id\",\"p_target_state\":\"$target_state\",\"p_config\":$config,\"p_scheduled_for\":null}"
  expect_success "Publication preview $show_id -> $target_state"
  expected_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
  [[ "$expected_version" =~ ^[1-9][0-9]*$ ]] || fail "Publication preview for $show_id returned invalid expectedVersion"

  rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_show_publication_change \
    "{\"p_show_id\":\"$show_id\",\"p_target_state\":\"$target_state\",\"p_config\":$config,\"p_scheduled_for\":null,\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_version\":$expected_version}"
  expect_success "Publication apply $show_id -> $target_state"
  expect_json "Publication state $show_id" state "$target_state"
}

run_s14_stage_9_publication() {
  log "Stage 9/10: exact-version outcome publication and disconnected-client authoritative refresh"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  result_config='{"participants":true,"artists":true,"songs":true,"semi_split":false,"running_order":true,"qualifiers":false,"results":true,"jury_results":false,"televote_results":false,"detailed_voting":false}'
  show_ordinal=0
  realtime_disconnect_proven=0

  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    show_ordinal=$((show_ordinal+1))
    result_version="$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$show_id'::uuid;")"
    lifecycle="$(db_scalar "select calculation_version::text || ':' || reviewed_version::text || ':' || locked_version::text || ':' || reveal_ready_version::text from public.studio2_result_operations where show_id='$show_id'::uuid;")"
    [[ "$result_version" =~ ^[1-9][0-9]*$ ]] || fail "Publication show $show_id has no finalized Results version"
    [[ "$lifecycle" == "$result_version:$result_version:$result_version:$result_version" ]] || fail "Publication show $show_id is not finalized on one exact Results version"
    [[ "$(db_scalar "select private.v3_publication_result_version_release_ready('$show_id'::uuid,$result_version)::text;")" == "true" ]] || fail "Results version $result_version is not publication-release-ready for $show_id"

    pre_refresh="$(anonymous_result_snapshot "$show_id")"
    [[ "$pre_refresh" == "[]" ]] || fail "anonymous Results leaked before outcome publication for $show_id"

    current_config="$(db_scalar "select frozen_config::text from public.studio2_show_publication_controls where show_id='$show_id'::uuid;")"
    hide_op="14000000-0000-4009-8100-$(printf '%012d' "$show_ordinal")"
    apply_publication_change "$show_id" hidden "$current_config" "$hide_op" "s14-publication-hide-$show_ordinal"
    [[ "$(db_scalar "select published::text from public.shows where id='$show_id'::uuid;")" == "false" ]] || fail "show $show_id did not become hidden before outcome release"
    [[ "$(anonymous_result_snapshot "$show_id")" == "[]" ]] || fail "hidden show $show_id exposed Results"

    rpc_request "$ORGANIZER_A_TOKEN" studio2_show_publication_change_preview \
      "{\"p_show_id\":\"$show_id\",\"p_target_state\":\"public\",\"p_config\":$result_config,\"p_scheduled_for\":null}"
    expect_success "outcome publication preview $show_id"
    expect_json "outcome publication risk $show_id" riskClass R3
    expect_json "outcome release-ready $show_id" resultReleaseReady true
    expect_json "outcome integrity-clear $show_id" integrityClear true
    expect_json "outcome source Result version $show_id" sourceResultVersion "$result_version"
    expected_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
    [[ "$expected_version" =~ ^[1-9][0-9]*$ ]] || fail "R3 outcome preview for $show_id returned invalid version"

    publish_op="14000000-0000-4009-8200-$(printf '%012d' "$show_ordinal")"
    rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_show_publication_change \
      "{\"p_show_id\":\"$show_id\",\"p_target_state\":\"public\",\"p_config\":$result_config,\"p_scheduled_for\":null,\"p_operation_id\":\"$publish_op\",\"p_idempotency_key\":\"s14-outcome-publish-$show_ordinal\",\"p_expected_version\":$expected_version}"
    expect_success "R3 outcome publication $show_id"
    expect_json "R3 outcome state $show_id" state public

    control_version="$(printf '%s' "$HTTP_BODY" | json_value version)"
    [[ "$control_version" =~ ^[1-9][0-9]*$ ]] || fail "R3 publication for $show_id returned invalid control version"
    [[ "$(db_scalar "select state || ':' || source_result_version::text || ':' || version::text from public.studio2_show_publication_controls where show_id='$show_id'::uuid;")" == "public:$result_version:$control_version" ]] || fail "publication control for $show_id is not pinned to Results version $result_version"
    [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$publish_op'::uuid and command='publication.show.change' and risk_class='R3' and status='succeeded' and auth_freshness_evidence is not null;")" == "1" ]] || fail "R3 outcome publication for $show_id lacks fresh-auth operation evidence"
    [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$publish_op'::uuid and event_type='publication.changed' and aggregate_id='$show_id' and aggregate_version=$control_version;")" == "1" ]] || fail "R3 outcome publication event for $show_id is missing"

    post_refresh="$(anonymous_result_snapshot "$show_id")"
    immutable="$(immutable_result_snapshot "$show_id" "$result_version")"
    [[ "$post_refresh" != "[]" ]] || fail "authoritative refresh after publication returned no Results for $show_id"
    [[ "$post_refresh" == "$immutable" ]] || fail "anonymous public Results for $show_id do not equal immutable version $result_version"
    [[ "$pre_refresh" == "[]" && "$post_refresh" != "$pre_refresh" ]] || fail "realtime-disconnect recovery did not demonstrate stale-to-authoritative refresh for $show_id"

    request GET "$API_URL/rest/v1/shows?id=eq.$show_id&select=id,published,publication_config" "$ANON_KEY" "$ANON_KEY"
    expect_success "anonymous publication state refresh $show_id"
    expect_json "anonymous show is published $show_id" '0.published' true
    expect_json "anonymous show exposes Results $show_id" '0.publication_config.results' true

    realtime_disconnect_proven=$((realtime_disconnect_proven+1))
  done

  [[ "$realtime_disconnect_proven" == "2" ]] || fail "realtime-disconnect recovery was not proven for both S14 shows"
  log "S14_FAILURE_REALTIME_DISCONNECT_COMPLETE"
  log "S14_INVARIANT_PUBLICATION_COMPLETE"
  log "S14_STAGE_9_PUBLICATION_COMPLETE"
}
