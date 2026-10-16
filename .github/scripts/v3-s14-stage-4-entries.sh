#!/usr/bin/env bash
set -euo pipefail

review_internal_entry() {
  local token="$1" entry_id="$2" target_status="$3" reason="$4"
  local operation_id="$5" idempotency_key="$6" expected_review_version="$7" expected_entry_version="$8"
  rpc_request "$token" studio2_apply_confirmation_entry_review "{\"p_target_type\":\"internal\",\"p_entry_id\":\"$entry_id\",\"p_target_status\":\"$target_status\",\"p_reason\":\"$reason\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_version\":$expected_review_version,\"p_expected_entry_version\":\"$expected_entry_version\"}"
}

sync_confirmation_to_solaris() {
  local submission_id="$1" output
  output="$(bun run scripts/v3-s14-sync-confirmation-entry.ts "$submission_id")" || fail "canonical Confirmation sync failed for $submission_id"
  [[ "$(printf '%s' "$output" | json_value status)" == "synced" ]] || fail "canonical Confirmation sync did not report synced for $submission_id: $output"
}

run_s14_stage_4_entries() {
  log "Stage 4/10: entries, exact-version review, correction, concurrency, canonical sync, withdrawal and media replacement"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"
  sign_in 's14-organizer-b@solaris.invalid'
  ORGANIZER_B_TOKEN="$LAST_TOKEN"

  apply_confirmation_round_change status '{"status":"open"}' '14000000-0000-4004-8000-000000000001' 's14-entry-round-open'
  apply_confirmation_round_change editing '{"editingEnabled":false}' '14000000-0000-4004-8000-000000000002' 's14-entry-editing-reset'
  apply_confirmation_round_change editing '{"editingEnabled":true}' '14000000-0000-4004-8000-000000000003' 's14-entry-editing-open'

  for i in $(seq 1 64); do
    suffix="$(printf '%012d' "$i")"
    operation_id="14000000-0000-4004-8100-$suffix"
    session_id="s14-entry-$(printf '%02d' "$i")"
    country_name="S14 Delegation $(printf '%02d' "$i")"
    username="s14_hod_$(printf '%02d' "$i")"
    song_title="S14 Entry $(printf '%02d' "$i")"
    final_clip_end='00:03:00'
    if (( i == 2 )); then
      song_title='S14 Entry 02 · duration correction required'
      final_clip_end='00:04:15'
    fi

    body="$(python3 - "$CONFIRMATION_ROUND_ID" "$session_id" "$username" "$country_name" "$song_title" "$final_clip_end" "$operation_id" "$i" <<'PY'
import json, sys
round_id, session, username, country, song_title, final_clip_end, operation_id, index = sys.argv[1:]
payload = {
    "round_id": round_id,
    "browser_session_id": session,
    "instagram_username": username,
    "country": country,
    "country_account": country,
    "has_country_account": True,
    "participating": True,
    "selection_method": "internal",
    "entry_unknown": False,
    "nf_entries_unknown": False,
    "artist": f"S14 Artist {int(index):02d}",
    "song_title": song_title,
    "song_url": f"https://media.solaris.invalid/s14/{int(index):02d}.mp4",
    "preview_start": "00:00:00",
    "preview_end": "00:00:30",
    "final_clip_start": "00:00:00",
    "final_clip_end": final_clip_end,
    "replacement_video_required": False,
}
print(json.dumps({
    "payload": payload,
    "_idempotency_key": operation_id,
    "_request_hash": "caller-hash-is-not-authority",
    "_browser_session_id": session,
}, separators=(",", ":")))
PY
)"

    rpc_request "$ANON_KEY" v3_submit_confirmation "$body"
    expect_success "Entry submit $(printf '%02d' "$i")"
    expect_json "Entry submit $(printf '%02d' "$i") accepted" ok true
  done

  [[ "$(db_scalar "select count(*) from public.internal_entries i join public.submissions s on s.id=i.submission_id where s.round_id='$CONFIRMATION_ROUND_ID'::uuid and s.participating;")" == "64" ]] || fail "Entry stage did not create exactly 64 participating internal entries"
  [[ "$(db_scalar "select count(*) from public.internal_entries i join public.submissions s on s.id=i.submission_id where s.round_id='$CONFIRMATION_ROUND_ID'::uuid and (i.current_version_id is null or i.content_revision is null);")" == "0" ]] || fail "Entry submission bypassed immutable current-version binding"

  CONCURRENCY_MARKER_WRITTEN=0
  for i in $(seq 1 64); do
    country_name="S14 Delegation $(printf '%02d' "$i")"
    suffix="$(printf '%012d' "$i")"
    entry_id="$(db_scalar "select i.id from public.internal_entries i join public.submissions s on s.id=i.submission_id where s.round_id='$CONFIRMATION_ROUND_ID'::uuid and s.country='$country_name' limit 1;")"
    submission_id="$(db_scalar "select i.submission_id from public.internal_entries i where i.id='$entry_id'::uuid;")"
    entry_version="$(db_scalar "select current_version_id from public.internal_entries where id='$entry_id'::uuid;")"
    review_version="$(db_scalar "select version from public.studio2_confirmation_review_versions where submission_id='$submission_id'::uuid;")"
    [[ -n "$entry_id" && -n "$entry_version" && -n "$review_version" ]] || fail "Entry review authority missing for $country_name"

    target_status='accepted'
    reason='S14 valid Entry review'
    if (( i == 2 )); then
      target_status='declined'
      reason='Song duration exceeds the allowed rule limit; submit a corrected version'
    fi

    review_internal_entry "$ORGANIZER_A_TOKEN" "$entry_id" "$target_status" "$reason" "14000000-0000-4004-8200-$suffix" "s14-entry-review-$i" "$review_version" "$entry_version"
    expect_success "Organizer A Entry review $(printf '%02d' "$i")"

    if (( i == 3 )); then
      review_internal_entry "$ORGANIZER_B_TOKEN" "$entry_id" 'declined' 'Concurrent stale Organizer decision' '14000000-0000-4004-8300-000000000003' 's14-entry-stale-organizer-b' "$review_version" "$entry_version"
      expect_failure "stale concurrent Organizer Entry review"
      [[ "$HTTP_BODY" == *"VERSION_CONFLICT"* ]] || fail "stale Organizer conflict did not surface VERSION_CONFLICT: $HTTP_BODY"
      CONCURRENCY_MARKER_WRITTEN=1
      log "S14_FAILURE_TWO_ORGANIZERS_COMPLETE"
    fi
  done

  [[ "$CONCURRENCY_MARKER_WRITTEN" == "1" ]] || fail "two-Organizer concurrency case did not execute"
  [[ "$(db_scalar "select count(*) from public.internal_entries i join public.submissions s on s.id=i.submission_id where s.round_id='$CONFIRMATION_ROUND_ID'::uuid and i.review_status='accepted';")" == "63" ]] || fail "expected 63 initially accepted Entries"
  [[ "$(db_scalar "select count(*) from public.internal_entries i join public.submissions s on s.id=i.submission_id where s.round_id='$CONFIRMATION_ROUND_ID'::uuid and i.review_status='declined';")" == "1" ]] || fail "duration correction case was not the only declined Entry"

  apply_confirmation_round_change editing '{"editingEnabled":false}' '14000000-0000-4004-8000-000000000004' 's14-entry-correction-reset'
  apply_confirmation_round_change editing '{"editingEnabled":true}' '14000000-0000-4004-8000-000000000005' 's14-entry-correction-open'

  ENTRY_TWO_SUBMISSION="$(db_scalar "select id from public.submissions where round_id='$CONFIRMATION_ROUND_ID'::uuid and country='S14 Delegation 02' limit 1;")"
  ENTRY_TWO_ID="$(db_scalar "select id from public.internal_entries where submission_id='$ENTRY_TWO_SUBMISSION'::uuid;")"
  ENTRY_TWO_OLD_VERSION="$(db_scalar "select current_version_id from public.internal_entries where id='$ENTRY_TWO_ID'::uuid;")"
  CORRECTED_ENTRY_OPERATION='14000000-0000-4004-8400-000000000002'
  CORRECTED_ENTRY_SESSION='s14-entry-02-corrected'
  CORRECTED_ENTRY_BODY="$(python3 - "$CONFIRMATION_ROUND_ID" "$CORRECTED_ENTRY_SESSION" "$CORRECTED_ENTRY_OPERATION" <<'PY'
import json, sys
round_id, session, operation_id = sys.argv[1:]
payload = {
    "round_id": round_id,
    "browser_session_id": session,
    "instagram_username": "s14_hod_02",
    "country": "S14 Delegation 02",
    "country_account": "S14 Delegation 02",
    "has_country_account": True,
    "participating": True,
    "selection_method": "internal",
    "entry_unknown": False,
    "nf_entries_unknown": False,
    "artist": "S14 Artist 02",
    "song_title": "S14 Entry 02",
    "song_url": "https://media.solaris.invalid/s14/02-corrected.mp4",
    "preview_start": "00:00:00",
    "preview_end": "00:00:30",
    "final_clip_start": "00:00:00",
    "final_clip_end": "00:03:00",
    "replacement_video_required": False,
}
print(json.dumps({
    "payload": payload,
    "_idempotency_key": operation_id,
    "_request_hash": "caller-hash-is-not-authority",
    "_browser_session_id": session,
}, separators=(",", ":")))
PY
)"
  rpc_request "$ANON_KEY" v3_submit_confirmation "$CORRECTED_ENTRY_BODY"
  expect_success "corrected Entry resubmission"
  expect_json "corrected Entry resubmission accepted" ok true
  expect_json "corrected Entry preserves submission identity" submission_id "$ENTRY_TWO_SUBMISSION"

  ENTRY_TWO_NEW_VERSION="$(db_scalar "select current_version_id from public.internal_entries where id='$ENTRY_TWO_ID'::uuid;")"
  [[ "$ENTRY_TWO_NEW_VERSION" != "$ENTRY_TWO_OLD_VERSION" ]] || fail "Entry correction reused the old immutable version identity"
  [[ "$(db_scalar "select parent_version_id from private.v3_entry_versions where id='$ENTRY_TWO_NEW_VERSION'::uuid;")" == "$ENTRY_TWO_OLD_VERSION" ]] || fail "Entry correction did not link to its immutable parent version"
  [[ "$(db_scalar "select review_status || ':' || (reviewed_version_id is null)::text from public.internal_entries where id='$ENTRY_TWO_ID'::uuid;")" == "pending:true" ]] || fail "corrected Entry retained stale review authority"

  ENTRY_TWO_REVIEW_VERSION="$(db_scalar "select version from public.studio2_confirmation_review_versions where submission_id='$ENTRY_TWO_SUBMISSION'::uuid;")"
  review_internal_entry "$ORGANIZER_A_TOKEN" "$ENTRY_TWO_ID" 'accepted' 'Corrected duration reviewed against the new exact version' '14000000-0000-4004-8500-000000000002' 's14-entry-02-corrected-review' "$ENTRY_TWO_REVIEW_VERSION" "$ENTRY_TWO_NEW_VERSION"
  expect_success "corrected Entry exact-version approval"
  [[ "$(db_scalar "select reviewed_version_id from public.internal_entries where id='$ENTRY_TWO_ID'::uuid;")" == "$ENTRY_TWO_NEW_VERSION" ]] || fail "corrected Entry approval is not bound to its exact current version"

  # Drive one accepted Entry into the canonical Solaris projection through the
  # real Confirmation sync implementation. QA must not manufacture public.entries.
  ENTRY_ONE_SUBMISSION="$(db_scalar "select id from public.submissions where round_id='$CONFIRMATION_ROUND_ID'::uuid and country='S14 Delegation 01' limit 1;")"
  ENTRY_ONE_ID="$(db_scalar "select id from public.internal_entries where submission_id='$ENTRY_ONE_SUBMISSION'::uuid;")"
  sync_confirmation_to_solaris "$ENTRY_ONE_SUBMISSION"
  MEDIA_COUNTRY_ID='14000000-0000-4000-8000-000000000001'
  MEDIA_ENTRY_ID="$(db_scalar "select id from public.entries where edition_id='$EDITION_ID'::uuid and country_id='$MEDIA_COUNTRY_ID'::uuid and source='confirmations' and source_ref='$ENTRY_ONE_ID' and metadata ->> 'confirmation_submission_id'='$ENTRY_ONE_SUBMISSION';")"
  [[ -n "$MEDIA_ENTRY_ID" ]] || fail "canonical Confirmation sync did not create the Solaris Entry projection bound to the accepted internal Entry"
  MEDIA_SOURCE_ONE="$(db_scalar "select song_url from public.entries where id='$MEDIA_ENTRY_ID'::uuid;")"
  [[ "$MEDIA_SOURCE_ONE" == 'https://media.solaris.invalid/s14/01.mp4' ]] || fail "canonical Entry projection does not reference the accepted source media"
  MEDIA_ASSET_KEY="entry:$MEDIA_ENTRY_ID:performance_video"

  rpc_request "$ORGANIZER_A_TOKEN" studio2_review_media_assets "{\"p_edition_id\":\"$EDITION_ID\",\"p_reviews\":[{\"assetKey\":\"$MEDIA_ASSET_KEY\",\"assetType\":\"performance_video\",\"countryId\":\"$MEDIA_COUNTRY_ID\",\"entryId\":\"$MEDIA_ENTRY_ID\",\"sourceFingerprint\":\"$MEDIA_SOURCE_ONE\",\"decision\":\"approved\"}],\"p_reason\":\"S14 initial performance media review\"}"
  expect_success "initial canonical Media approval"
  [[ "$(db_scalar "select private.v3_media_asset_is_currently_accepted('$EDITION_ID'::uuid,'$MEDIA_ASSET_KEY','performance_video','$MEDIA_COUNTRY_ID'::uuid,'$MEDIA_ENTRY_ID'::uuid);")" == "t" ]] || fail "initial Media approval is not current"

  # Replace that source through another participant Entry revision, re-review the
  # exact immutable version, and run the same canonical sync. The old Media
  # approval must become stale because its source fingerprint is no longer true.
  MEDIA_SOURCE_TWO='https://media.solaris.invalid/s14/01-replacement.mp4'
  MEDIA_REPLACE_OPERATION='14000000-0000-4004-8800-000000000001'
  MEDIA_REPLACE_SESSION='s14-entry-01-media-replacement'
  rpc_request "$ANON_KEY" v3_submit_confirmation "{\"payload\":{\"round_id\":\"$CONFIRMATION_ROUND_ID\",\"browser_session_id\":\"$MEDIA_REPLACE_SESSION\",\"instagram_username\":\"s14_hod_01\",\"country\":\"S14 Delegation 01\",\"country_account\":\"S14 Delegation 01\",\"has_country_account\":true,\"participating\":true,\"selection_method\":\"internal\",\"entry_unknown\":false,\"nf_entries_unknown\":false,\"artist\":\"S14 Artist 01\",\"song_title\":\"S14 Entry 01\",\"song_url\":\"$MEDIA_SOURCE_TWO\",\"preview_start\":\"00:00:00\",\"preview_end\":\"00:00:30\",\"final_clip_start\":\"00:00:00\",\"final_clip_end\":\"00:03:00\",\"replacement_video_required\":false},\"_idempotency_key\":\"$MEDIA_REPLACE_OPERATION\",\"_request_hash\":\"caller-hash-is-not-authority\",\"_browser_session_id\":\"$MEDIA_REPLACE_SESSION\"}"
  expect_success "participant Media source replacement"
  expect_json "Media replacement preserves submission identity" submission_id "$ENTRY_ONE_SUBMISSION"

  ENTRY_ONE_NEW_VERSION="$(db_scalar "select current_version_id from public.internal_entries where id='$ENTRY_ONE_ID'::uuid;")"
  ENTRY_ONE_REVIEW_VERSION="$(db_scalar "select version from public.studio2_confirmation_review_versions where submission_id='$ENTRY_ONE_SUBMISSION'::uuid;")"
  review_internal_entry "$ORGANIZER_A_TOKEN" "$ENTRY_ONE_ID" 'accepted' 'Replacement media reviewed against the exact new Entry version' '14000000-0000-4004-8900-000000000001' 's14-entry-01-media-replacement-review' "$ENTRY_ONE_REVIEW_VERSION" "$ENTRY_ONE_NEW_VERSION"
  expect_success "replacement Entry exact-version approval"
  sync_confirmation_to_solaris "$ENTRY_ONE_SUBMISSION"

  [[ "$(db_scalar "select song_url from public.entries where id='$MEDIA_ENTRY_ID'::uuid;")" == "$MEDIA_SOURCE_TWO" ]] || fail "canonical Confirmation sync did not project replacement Media source"
  [[ "$(db_scalar "select private.v3_media_asset_is_currently_accepted('$EDITION_ID'::uuid,'$MEDIA_ASSET_KEY','performance_video','$MEDIA_COUNTRY_ID'::uuid,'$MEDIA_ENTRY_ID'::uuid);")" == "f" ]] || fail "stale Media approval survived canonical source replacement"
  [[ "$(db_scalar "select count(*) from public.studio2_media_asset_reviews where edition_id='$EDITION_ID'::uuid and asset_key='$MEDIA_ASSET_KEY' and source_fingerprint='$MEDIA_SOURCE_ONE' and superseded_at is not null;")" == "1" ]] || fail "old Media review was not explicitly superseded"

  rpc_request "$ORGANIZER_A_TOKEN" studio2_review_media_assets "{\"p_edition_id\":\"$EDITION_ID\",\"p_reviews\":[{\"assetKey\":\"$MEDIA_ASSET_KEY\",\"assetType\":\"performance_video\",\"countryId\":\"$MEDIA_COUNTRY_ID\",\"entryId\":\"$MEDIA_ENTRY_ID\",\"sourceFingerprint\":\"$MEDIA_SOURCE_TWO\",\"decision\":\"approved\"}],\"p_reason\":\"S14 replacement performance media review\"}"
  expect_success "replacement canonical Media approval"
  [[ "$(db_scalar "select private.v3_media_asset_is_currently_accepted('$EDITION_ID'::uuid,'$MEDIA_ASSET_KEY','performance_video','$MEDIA_COUNTRY_ID'::uuid,'$MEDIA_ENTRY_ID'::uuid);")" == "t" ]] || fail "replacement Media approval is not current"
  [[ "$(db_scalar "select count(*) from public.studio2_media_asset_reviews where edition_id='$EDITION_ID'::uuid and asset_key='$MEDIA_ASSET_KEY' and superseded_at is null and decision='approved';")" == "1" ]] || fail "Media replacement left more than one active approval"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where edition_id='$EDITION_ID'::uuid and event_type='media.reviewed';")" -ge 2 ]] || fail "Media review did not emit event-backed consequence evidence"
  log "S14_INVARIANT_MEDIA_COMPLETE"

  # Participant withdrawal first changes the Confirmation authority. Then the
  # existing canonical sync projects it, and the governed R2 status operation
  # reconciles every show-specific participant row. No direct canonical write.
  ENTRY_FOUR_SUBMISSION="$(db_scalar "select id from public.submissions where round_id='$CONFIRMATION_ROUND_ID'::uuid and country='S14 Delegation 04' limit 1;")"
  ENTRY_FOUR_EVIDENCE_COUNT="$(db_scalar "select count(*) from private.v3_entry_versions where submission_id='$ENTRY_FOUR_SUBMISSION'::uuid;")"
  WITHDRAW_OPERATION='14000000-0000-4004-8600-000000000004'
  WITHDRAW_SESSION='s14-entry-04-withdraw'
  rpc_request "$ANON_KEY" v3_submit_confirmation "{\"payload\":{\"round_id\":\"$CONFIRMATION_ROUND_ID\",\"browser_session_id\":\"$WITHDRAW_SESSION\",\"instagram_username\":\"s14_hod_04\",\"country\":\"S14 Delegation 04\",\"country_account\":\"S14 Delegation 04\",\"has_country_account\":true,\"participating\":false,\"selection_method\":\"\",\"entry_unknown\":false,\"nf_entries_unknown\":false},\"_idempotency_key\":\"$WITHDRAW_OPERATION\",\"_request_hash\":\"caller-hash-is-not-authority\",\"_browser_session_id\":\"$WITHDRAW_SESSION\"}"
  expect_success "participant Entry withdrawal"
  expect_json "participant Entry withdrawal accepted" ok true
  expect_json "participant withdrawal preserves submission identity" submission_id "$ENTRY_FOUR_SUBMISSION"
  [[ "$(db_scalar "select count(*) from public.internal_entries where submission_id='$ENTRY_FOUR_SUBMISSION'::uuid;")" == "0" ]] || fail "withdrawn delegation still exposes an active internal Entry"
  [[ "$(db_scalar "select count(*) from private.v3_entry_versions where submission_id='$ENTRY_FOUR_SUBMISSION'::uuid;")" -ge "$ENTRY_FOUR_EVIDENCE_COUNT" ]] || fail "withdrawal destroyed immutable Entry evidence"

  sync_confirmation_to_solaris "$ENTRY_FOUR_SUBMISSION"
  WITHDRAW_COUNTRY_ID='14000000-0000-4000-8000-000000000004'
  [[ "$(db_scalar "select status from public.entries where edition_id='$EDITION_ID'::uuid and country_id='$WITHDRAW_COUNTRY_ID'::uuid and source='confirmations';")" == "withdrawn" ]] || fail "canonical sync did not project participant withdrawal"

  rpc_request "$ORGANIZER_A_TOKEN" studio2_participation_status_change_preview "{\"p_edition_id\":\"$EDITION_ID\",\"p_country_id\":\"$WITHDRAW_COUNTRY_ID\",\"p_contest_entity_id\":null,\"p_status\":\"withdrawn\"}"
  expect_success "withdrawal reconciliation preview"
  WITHDRAW_EXPECTED_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
  rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_participation_status "{\"p_edition_id\":\"$EDITION_ID\",\"p_country_id\":\"$WITHDRAW_COUNTRY_ID\",\"p_contest_entity_id\":null,\"p_status\":\"withdrawn\",\"p_operation_id\":\"14000000-0000-4004-8700-000000000004\",\"p_idempotency_key\":\"s14-entry-04-withdrawal-reconcile\",\"p_expected_version\":$WITHDRAW_EXPECTED_VERSION}"
  expect_success "governed withdrawal reconciliation"
  expect_json "governed withdrawal status" status withdrawn
  [[ "$(db_scalar "select count(*) from public.participants where edition_id='$EDITION_ID'::uuid and country_id='$WITHDRAW_COUNTRY_ID'::uuid and participation_status<>'withdrawn';")" == "0" ]] || fail "withdrawal left confirmed show-specific participant state"

  [[ "$(db_scalar "select count(*) from public.internal_entries i join public.submissions s on s.id=i.submission_id left join private.v3_entry_versions v on v.id=i.current_version_id where s.round_id='$CONFIRMATION_ROUND_ID'::uuid and (v.id is null or v.entry_id is distinct from i.id or v.submission_id is distinct from s.id or v.revision is distinct from i.content_revision or i.review_status<>'accepted' or i.reviewed_version_id is distinct from i.current_version_id);")" == "0" ]] || fail "accepted Entry state is not bound to valid immutable exact-version evidence"
  [[ "$(db_scalar "select count(*) from public.internal_entries i join public.submissions s on s.id=i.submission_id where s.round_id='$CONFIRMATION_ROUND_ID'::uuid;")" == "63" ]] || fail "withdrawal did not leave the expected 63 active Entries"
  log "S14_INVARIANT_ENTRY_COMPLETE"

  apply_confirmation_round_change editing '{"editingEnabled":false}' '14000000-0000-4004-8000-000000000006' 's14-entry-correction-close'
  apply_confirmation_round_change status '{"status":"closed"}' '14000000-0000-4004-8000-000000000007' 's14-entry-round-close'

  log "S14_STAGE_4_ENTRIES_COMPLETE"
}
