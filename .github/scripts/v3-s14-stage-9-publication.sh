#!/usr/bin/env bash
set -euo pipefail

run_s14_stage_9_publication() {
  log "Stage 9/10: publish exact finalized result versions and verify anonymous public projections"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  publication_config='{"participants":true,"artists":true,"songs":true,"semi_split":false,"running_order":true,"qualifiers":false,"results":true,"jury_results":true,"televote_results":true,"detailed_voting":false}'
  show_index=0

  for show_id in "$SEMI_ONE_ID" "$SEMI_TWO_ID"; do
    show_index=$((show_index + 1))
    suffix="$(printf '%012d' "$show_index")"

    [[ "$(db_scalar "select calculation_version from public.studio2_result_operations where show_id='$show_id'::uuid;")" == "2" ]] || fail "Stage 9 requires finalized calculation version 2 for $show_id"
    [[ "$(db_scalar "select count(*) from private.v3_result_versions where show_id='$show_id'::uuid and version=2;")" == "1" ]] || fail "immutable result version 2 missing for $show_id"
    [[ "$(db_scalar "select case when reviewed_version=2 and locked_version=2 and reveal_ready_version=2 then 'true' else 'false' end from public.studio2_result_operations where show_id='$show_id'::uuid;")" == "true" ]] || fail "result version 2 is not reviewed, locked and reveal-ready for $show_id"

    rpc_request "$ORGANIZER_A_TOKEN" studio2_show_publication_change_preview \
      "{\"p_show_id\":\"$show_id\",\"p_target_state\":\"public\",\"p_config\":$publication_config,\"p_scheduled_for\":null}"
    expect_success "preview exact-version outcome publication $show_id"
    expect_json "publication preview target $show_id" targetState public
    expect_json "publication preview result version $show_id" sourceResultVersion 2
    expect_json "publication preview result readiness $show_id" resultReleaseReady true
    expected_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
    [[ -n "$expected_version" ]] || fail "publication preview omitted expected control version for $show_id"

    operation_id="14000000-0000-4009-8000-$suffix"
    idempotency_key="s14-final-result-publication-$show_index"
    rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_show_publication_change \
      "{\"p_show_id\":\"$show_id\",\"p_target_state\":\"public\",\"p_config\":$publication_config,\"p_scheduled_for\":null,\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_version\":$expected_version}"
    expect_success "publish exact finalized result $show_id"
    expect_json "publication state $show_id" state public

    [[ "$(db_scalar "select source_result_version from public.studio2_show_publication_controls where show_id='$show_id'::uuid;")" == "2" ]] || fail "publication control for $show_id is not bound to exact result version 2"
    [[ "$(db_scalar "select count(*) from public.studio2_show_publication_controls where show_id='$show_id'::uuid and state='public' and source_result_version=2 and frozen_config->>'results'='true';")" == "1" ]] || fail "canonical publication control for $show_id lacks exact result provenance"
    [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$operation_id'::uuid and command='publication.show.change' and status='succeeded';")" == "1" ]] || fail "publication operation receipt missing for $show_id"
    [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='publication.changed' and aggregate_id='$show_id';")" == "1" ]] || fail "publication.changed DomainEvent missing for $show_id"

    request GET "$API_URL/rest/v1/shows?id=eq.$show_id&select=id,published,publication_config" "$ANON_KEY" "$ANON_KEY"
    expect_success "anonymous finalized show lookup $show_id"
    expect_json "anonymous show identity $show_id" '0.id' "$show_id"
    expect_json "anonymous finalized show is public $show_id" '0.published' true
    expect_json "anonymous finalized result layer visible $show_id" '0.publication_config.results' true

    request GET "$API_URL/rest/v1/results?show_id=eq.$show_id&select=country_id,jury_points,televote_points,total_points,final_rank&order=final_rank.asc" "$ANON_KEY" "$ANON_KEY"
    expect_success "anonymous finalized results lookup $show_id"
    public_rows="$(python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' <<< "$HTTP_BODY")"
    [[ "$public_rows" == "33" ]] || fail "anonymous finalized results for $show_id returned $public_rows rows instead of 33"
    [[ "$(python3 -c 'import json,sys; rows=json.load(sys.stdin); print("true" if rows and all(r.get("final_rank") is not None and r.get("total_points")==r.get("jury_points",0)+r.get("televote_points",0) for r in rows) else "false")' <<< "$HTTP_BODY")" == "true" ]] || fail "anonymous finalized results for $show_id contain incomplete ranks or unreconciled totals"
  done

  [[ "$(db_scalar "select count(*) from public.studio2_show_publication_controls where show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and state='public' and source_result_version=2;")" == "2" ]] || fail "both semi-final public projections are not bound to exact finalized version 2"
  log "S14_INVARIANT_PUBLICATION_COMPLETE"
  log "S14_STAGE_9_PUBLICATION_COMPLETE"
}
