#!/usr/bin/env bash
set -euo pipefail

# Grand Final Publication deliberately reuses Stage 9's canonical publication
# and anonymous-result read paths. These adapters make the final leg explicit
# without introducing a second publication authority.
publication_preview() {
  local show_id="$1" target_state="$2" config="$3"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_show_publication_change_preview \
    "{\"p_show_id\":\"$show_id\",\"p_target_state\":\"$target_state\",\"p_config\":$config,\"p_scheduled_for\":null}"
  expect_success "Grand Final publication preview $show_id -> $target_state"
}

assert_anonymous_result_matches_version() {
  local show_id="$1" version="$2" actual immutable
  actual="$(anonymous_result_snapshot "$show_id")"
  immutable="$(immutable_result_snapshot "$show_id" "$version")"
  [[ "$actual" != "[]" ]] || fail "anonymous Grand Final Results are empty after publication"
  [[ "$actual" == "$immutable" ]] || fail "anonymous Grand Final Results do not equal immutable version $version"
}

run_s14_grand_final_publication() {
  log "Grand-final publication: publish the exact immutable recalculation version and verify anonymous public truth"

  for helper in anonymous_result_snapshot immutable_result_snapshot publication_preview assert_anonymous_result_matches_version; do
    declare -F "$helper" >/dev/null || fail "Grand Final publication requires canonical helper '$helper' to be sourced first"
  done

  [[ "${FINAL_RESULT_VERSION:-}" =~ ^[1-9][0-9]*$ ]] || fail "Grand Final publication requires an exact canonical result version"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  [[ "$(db_scalar "select calculation_version::text from public.studio2_result_operations where show_id='$FINAL_ID'::uuid;")" == "$FINAL_RESULT_VERSION" ]] || fail "Grand Final publication requires exact recalculation version"
  [[ "$(db_scalar "select (reviewed_version=$FINAL_RESULT_VERSION and locked_version=$FINAL_RESULT_VERSION and reveal_ready_version=$FINAL_RESULT_VERSION)::text from public.studio2_result_operations where show_id='$FINAL_ID'::uuid;")" == "true" ]] || fail "Grand Final publication requires reviewed/locked/reveal-ready exact recalculation version"
  [[ "$(db_scalar "select result_row_count::text from private.v3_result_versions where show_id='$FINAL_ID'::uuid and version=$FINAL_RESULT_VERSION;")" == "20" ]] || fail "Grand Final exact immutable recalculation version is missing or incomplete"
  [[ "$(db_scalar "select published::text from public.shows where id='$FINAL_ID'::uuid;")" == "false" ]] || fail "Grand Final must still be non-public before exact outcome publication"

  outcome_config='{"participants":true,"artists":true,"songs":true,"semi_split":false,"running_order":true,"qualifiers":false,"results":true,"jury_results":true,"televote_results":true,"detailed_voting":true}'

  # Fresh sign-in keeps the outcome release inside the canonical R3 fresh-auth
  # boundary. The final begins non-public, so unlike the semi-finals we can make
  # one deliberate exact-version draft/hidden -> public transition.
  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"
  publication_preview "$FINAL_ID" public "$outcome_config"
  expect_json "Grand Final publication exact source version" sourceResultVersion "$FINAL_RESULT_VERSION"
  expect_json "Grand Final publication release readiness" resultReleaseReady true
  expect_json "Grand Final publication integrity readiness" integrityClear true
  expect_json "Grand Final publication risk" riskClass R3

  expected_version="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
  [[ "$expected_version" =~ ^[0-9]+$ ]] || fail "Grand Final publication preview omitted a valid expected version"
  operation_id='14000000-0000-4012-8100-000000000001'

  rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_show_publication_change \
    "{\"p_show_id\":\"$FINAL_ID\",\"p_target_state\":\"public\",\"p_config\":$outcome_config,\"p_scheduled_for\":null,\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"s14-final-publish-results-exact\",\"p_expected_version\":$expected_version}"
  expect_success "publish exact Grand Final result version"
  expect_json "Grand Final publication is public" state public

  [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$operation_id'::uuid and command='publication.show.change' and status='succeeded';")" == "1" ]] || fail "Grand Final R3 publication receipt is missing"
  [[ "$(db_scalar "select source_result_version::text from public.studio2_show_publication_controls where show_id='$FINAL_ID'::uuid;")" == "$FINAL_RESULT_VERSION" ]] || fail "Grand Final public projection is not bound to exact immutable recalculation version"
  [[ "$(db_scalar "select (state='public' and frozen_config->>'results'='true' and frozen_config->>'jury_results'='true' and frozen_config->>'televote_results'='true' and frozen_config->>'detailed_voting'='true')::text from public.studio2_show_publication_controls where show_id='$FINAL_ID'::uuid;")" == "true" ]] || fail "Grand Final publication does not expose the intended result layers"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='publication.changed' and aggregate_id='$FINAL_ID';")" == "1" ]] || fail "Grand Final publication.changed DomainEvent is missing"

  request GET "$API_URL/rest/v1/shows?id=eq.$FINAL_ID&select=id,published,publication_config" "$ANON_KEY" "$ANON_KEY"
  expect_success "anonymous Grand Final publication lookup"
  expect_json "anonymous Grand Final published" '0.published' true
  expect_json "anonymous Grand Final result layer" '0.publication_config.results' true
  expect_json "anonymous Grand Final Jury layer" '0.publication_config.jury_results' true
  expect_json "anonymous Grand Final Televote layer" '0.publication_config.televote_results' true
  expect_json "anonymous Grand Final detailed voting layer" '0.publication_config.detailed_voting' true

  assert_anonymous_result_matches_version "$FINAL_ID" "$FINAL_RESULT_VERSION"

  # Exact-version publication freezes semantic truth. A later recalculation must
  # not silently move the current result version while Public still references the exact recalculation.
  rpc_request "$ORGANIZER_A_TOKEN" studio2_execute_result_operation \
    "{\"p_show_id\":\"$FINAL_ID\",\"p_action\":\"calculate\",\"p_reason\":\"S14 Grand Final stale public result mutation probe\",\"p_execution_id\":\"14000000-0000-4012-8200-000000000001\",\"p_expected_version\":$FINAL_RESULT_VERSION}"
  expect_failure "post-publication Grand Final result recalculation"
  [[ "$(db_scalar "select calculation_version::text from public.studio2_result_operations where show_id='$FINAL_ID'::uuid;")" == "$FINAL_RESULT_VERSION" ]] || fail "failed post-publication mutation moved Grand Final away from public exact recalculation version"
  [[ "$(db_scalar "select source_result_version::text from public.studio2_show_publication_controls where show_id='$FINAL_ID'::uuid;")" == "$FINAL_RESULT_VERSION" ]] || fail "failed post-publication mutation moved Grand Final publication pointer"

  log "S14_GRAND_FINAL_PUBLICATION_EXACT_VERSION_COMPLETE"
}
