#!/usr/bin/env bash
set -euo pipefail

televoting_rpc_request() {
  local token="$1" function_name="$2" body="$3"
  local output
  output="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' -X POST "$API_URL/rest/v1/rpc/$function_name" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $token" \
    -H 'Content-Type: application/json' \
    -H 'Content-Profile: televoting' \
    -H 'Accept-Profile: televoting' \
    --data "$body")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

televote_ballot_map() {
  python3 -c '
import json, sys
entries=json.load(sys.stdin)
print(json.dumps({row["target_country_code"]: row["points"] for row in entries}, separators=(",", ":"), sort_keys=True))
'
}

seed_televote_preflight() {
  local preflight_id="$1" username="$2" country_code="$3" ballot_json="$4"
  local risk_score="${5:-0}" severity="${6:-none}" requires_attestation="${7:-false}"
  local ballot_map findings
  ballot_map="$(printf '%s' "$ballot_json" | televote_ballot_map)"
  findings='[]'
  if (( risk_score > 0 )); then
    findings='[{"targetCode":"AAX","targetName":"S14 Delegation 01","lens":"country","riskScore":42,"confidence":72,"uniqueEditions":2,"supportFrequency":80,"maximumFrequency":50,"reciprocalSupport":0,"crossChannelEditions":1,"reasons":["S14 deterministic integrity signal"],"recentRisk":42,"lifetimeRisk":30,"effectiveRecentEditions":2,"effectiveLifetimeEditions":2,"continuityRisk":25}]'
  fi
  db_exec "
insert into televoting.vote_preflight_checks(
  id, round_id, username_normalized, country_code, ballot_map,
  risk_score, severity, requires_attestation, findings, technical_signals,
  history_summary, expires_at
) values (
  '$preflight_id'::uuid, '$TV_ROUND_ID'::uuid, lower('$username'), '$country_code', '$ballot_map'::jsonb,
  $risk_score, '$severity', $requires_attestation, '$findings'::jsonb, '[]'::jsonb,
  '{\"s14Deterministic\":true}'::jsonb, now()+interval '30 minutes'
);
"
}

apply_televote_round_status() {
  local status="$1" operation_id="$2" idempotency_key="$3"
  local global_version round_version

  televoting_rpc_request "$ORGANIZER_A_TOKEN" studio2_round_status_change_preview \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_status\":\"$status\"}"
  expect_success "preview Televote round $status"
  [[ "$(printf '%s' "$HTTP_BODY" | json_value 'blockers')" == "[]" ]] || fail "Televote $status preview returned blockers: $HTTP_BODY"
  global_version="$(printf '%s' "$HTTP_BODY" | json_value expectedGlobalVersion)"
  round_version="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"
  [[ -n "$global_version" && -n "$round_version" ]] || fail "Televote $status preview omitted concurrency versions"

  televoting_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_status_change \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_status\":\"$status\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_global_version\":$global_version,\"p_expected_round_version\":$round_version}"
  expect_success "apply Televote round $status"
  expect_json "Televote round $status receipt" status "$status"
  [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$operation_id'::uuid and command='televote.round.$status' and status='succeeded';")" == "1" ]] || fail "Televote $status operation receipt missing"
}

run_s14_stage_7_public_voting() {
  log "Stage 7/10: governed public voting, duplicate protection, extension, uncertainty recovery and integrity signal"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  # The bounded setup intentionally seeds all 66 delegation identities. The
  # governed round contract allows at most 50 voting entries, so Stage 7 creates
  # the actual public-voting field before asking the R2 operation to open it.
  db_exec "
insert into public.integration_links(service,entity_type,solaris_id,remote_id,edition_id,sync_status,metadata,last_synced_at)
values ('televoting','edition','$EDITION_ID'::uuid,'$TV_EDITION_ID','$EDITION_ID'::uuid,'linked','{\"source\":\"s14\"}'::jsonb,now())
on conflict (service,entity_type,remote_id) do update set
  solaris_id=excluded.solaris_id, edition_id=excluded.edition_id,
  sync_status='linked', metadata=excluded.metadata, last_synced_at=now(), updated_at=now();

delete from televoting.round_entries
where round_id='$TV_ROUND_ID'::uuid and display_order > 50;
delete from televoting.round_countries
where round_id='$TV_ROUND_ID'::uuid and display_order > 50;
"
  [[ "$(db_scalar "select count(*) from televoting.round_entries where round_id='$TV_ROUND_ID'::uuid;")" == "50" ]] || fail "S14 public-voting field is not the governed 50-entry maximum"

  target_codes="$(db_scalar "
select jsonb_agg(entry_key order by display_order)::text
from (
  select entry_key, display_order
  from televoting.round_entries
  where round_id='$TV_ROUND_ID'::uuid
  order by display_order
  limit 5
) entries;
")"
  ballot_json="$(python3 -c '
import json,sys
codes=json.loads(sys.argv[1])
points=[6,5,4,3,2]
print(json.dumps([{"target_country_code":code,"points":points[i]} for i,code in enumerate(codes)], separators=(",", ":")))
' "$target_codes")"
  [[ "$(python3 -c 'import json,sys; rows=json.load(sys.stdin); print(sum(row["points"] for row in rows))' <<< "$ballot_json")" == "20" ]] || fail "S14 Televote ballot does not total 20 points"

  apply_televote_round_status open '14000000-0000-4007-8000-000000000001' 's14-televote-open'
  [[ "$(db_scalar "select status::text from televoting.rounds where id='$TV_ROUND_ID'::uuid;")" == "open" ]] || fail "S14 Televote did not open"

  accepted=0
  for i in $(seq 51 55); do
    index="$(printf '%02d' "$i")"
    suffix="$(printf '%012d' "$i")"
    username="s14-public-$index"
    country_code="$(db_scalar "select code from televoting.countries order by code offset $((i-1)) limit 1;")"
    preflight_id="14000000-0000-4007-8100-$suffix"
    [[ -n "$country_code" ]] || fail "S14 public voter $index has no country code"
    seed_televote_preflight "$preflight_id" "$username" "$country_code" "$ballot_json"

    televoting_rpc_request "$ANON_KEY" submit_vote_checked \
      "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$username\",\"p_country_code\":\"$country_code\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$preflight_id\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
    expect_success "public Televote $index"
    expect_json "public Televote $index status" status active
    accepted=$((accepted + 1))
  done

  # A fresh integrity token cannot bypass canonical duplicate-voter protection.
  duplicate_country="$(db_scalar "select country_code from televoting.vote_submissions where round_id='$TV_ROUND_ID'::uuid and username_normalized='s14-public-51' limit 1;")"
  duplicate_preflight='14000000-0000-4007-8200-000000000051'
  seed_televote_preflight "$duplicate_preflight" 's14-public-51' "$duplicate_country" "$ballot_json"
  televoting_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"s14-public-51\",\"p_country_code\":\"$duplicate_country\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$duplicate_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_failure "duplicate public Televote"
  [[ "$HTTP_BODY" == *"already voted"* ]] || fail "duplicate Televote did not surface canonical duplicate protection: $HTTP_BODY"

  # Model an operational extension using the real lifecycle Solaris actually
  # has: close the round, prove writes stop, then reopen it with a fresh R2
  # operation. There is intentionally no invented QA-only deadline column.
  extension_username='s14-public-56'
  extension_country="$(db_scalar "select code from televoting.countries order by code offset 55 limit 1;")"
  extension_preflight='14000000-0000-4007-8100-000000000056'
  seed_televote_preflight "$extension_preflight" "$extension_username" "$extension_country" "$ballot_json"

  apply_televote_round_status closed '14000000-0000-4007-8000-000000000002' 's14-televote-close-for-extension'
  first_closed_at="$(db_scalar "select closed_at::text from televoting.rounds where id='$TV_ROUND_ID'::uuid;")"
  televoting_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$extension_username\",\"p_country_code\":\"$extension_country\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$extension_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_failure "Televote while closed"
  [[ "$HTTP_BODY" == *"Round is not open"* ]] || fail "closed Televote did not reject writes: $HTTP_BODY"

  apply_televote_round_status open '14000000-0000-4007-8000-000000000003' 's14-televote-extension-reopen'
  reopened_at="$(db_scalar "select opened_at::text from televoting.rounds where id='$TV_ROUND_ID'::uuid;")"
  [[ -n "$first_closed_at" && -n "$reopened_at" ]] || fail "Televote extension lacks close/reopen timestamps"
  [[ "$(db_scalar "select (opened_at > closed_at)::text from televoting.rounds where id='$TV_ROUND_ID'::uuid;")" == "true" ]] || fail "Televote extension did not create a later reopened window"
  televoting_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$extension_username\",\"p_country_code\":\"$extension_country\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$extension_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_success "Televote after governed extension"
  accepted=$((accepted + 1))

  # Simulate response loss after commit. A separate read-only recovery handle is
  # created before submission; after the commit both exact-ballot reconciliation
  # and the low-privilege recovery capability must prove the same acceptance.
  uncertain_username='s14-public-57'
  uncertain_country="$(db_scalar "select code from televoting.countries order by code offset 56 limit 1;")"
  uncertain_preflight='14000000-0000-4007-8100-000000000057'
  seed_televote_preflight "$uncertain_preflight" "$uncertain_username" "$uncertain_country" "$ballot_json"
  rpc_request "$SERVICE_ROLE_KEY" v3_create_televote_recovery_handle "{\"p_preflight_token\":\"$uncertain_preflight\"}"
  expect_success "create Televote recovery capability"
  recovery_operation="$(printf '%s' "$HTTP_BODY" | json_value '0.operation_id')"
  recovery_secret="$(printf '%s' "$HTTP_BODY" | json_value '0.recovery_secret')"
  [[ -n "$recovery_operation" && -n "$recovery_secret" ]] || fail "Televote recovery capability is incomplete"

  televoting_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$uncertain_username\",\"p_country_code\":\"$uncertain_country\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$uncertain_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_success "commit Televote before simulated response loss"
  accepted=$((accepted + 1))
  # From here on, do not trust the submission response body. Reconciliation is
  # the authority after ambiguous transport completion.
  rpc_request "$ANON_KEY" v3_reconcile_televote \
    "{\"p_preflight_token\":\"$uncertain_preflight\",\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$uncertain_username\",\"p_country_code\":\"$uncertain_country\",\"p_entries\":$ballot_json}"
  expect_success "exact-ballot Televote reconciliation"
  expect_json "exact-ballot Televote reconciliation found" found true
  expect_json "exact-ballot Televote reconciliation authority" authority authoritative_server
  reconciled_submission="$(printf '%s' "$HTTP_BODY" | json_value id)"

  rpc_request "$SERVICE_ROLE_KEY" v3_reconcile_televote_recovery \
    "{\"p_operation_id\":\"$recovery_operation\",\"p_recovery_secret\":\"$recovery_secret\"}"
  expect_success "read-only Televote recovery"
  expect_json "read-only Televote recovery found" '0.found' true
  expect_json "read-only Televote recovery authority" '0.authority' authoritative_server
  [[ "$(printf '%s' "$HTTP_BODY" | json_value '0.id')" == "$reconciled_submission" ]] || fail "Televote recovery resolved a different canonical submission"

  # One accepted ballot carries a deterministic integrity signal. The checked
  # writer must preserve that signal in anti-abuse evidence while still
  # accepting the ballot because this fixture does not require attestation.
  integrity_username='s14-public-58'
  integrity_country="$(db_scalar "select code from televoting.countries order by code offset 57 limit 1;")"
  integrity_preflight='14000000-0000-4007-8100-000000000058'
  seed_televote_preflight "$integrity_preflight" "$integrity_username" "$integrity_country" "$ballot_json" 42 review false
  televoting_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$integrity_username\",\"p_country_code\":\"$integrity_country\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$integrity_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_success "integrity-signalled public Televote"
  expect_json "integrity-signalled Televote risk" risk_score 42
  [[ "$(db_scalar "select count(*) from televoting.anti_abuse_events where round_id='$TV_ROUND_ID'::uuid and username_normalized=lower('$integrity_username') and reason='pre_submit_integrity_check' and risk_score=42;")" == "1" ]] || fail "accepted integrity signal did not produce canonical anti-abuse evidence"
  accepted=$((accepted + 1))

  [[ "$accepted" == "8" ]] || fail "S14 Televote accepted $accepted ballots instead of 8"
  [[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$TV_ROUND_ID'::uuid and status<>'deleted';")" == "8" ]] || fail "canonical Televote submission count is not 8"
  [[ "$(db_scalar "select count(*) from televoting.vote_entries e join televoting.vote_submissions s on s.id=e.submission_id where s.round_id='$TV_ROUND_ID'::uuid and s.status<>'deleted';")" == "40" ]] || fail "canonical Televote entry rows are not eight complete five-entry ballots"
  [[ "$(db_scalar "select count(*) from (select username_normalized,count(*) from televoting.vote_submissions where round_id='$TV_ROUND_ID'::uuid and status<>'deleted' group by username_normalized having count(*)>1) d;")" == "0" ]] || fail "duplicate canonical Televote ballot detected"
  [[ "$(db_scalar "select count(*) from (select s.id,sum(e.points) as total,count(*) as entries from televoting.vote_submissions s join televoting.vote_entries e on e.submission_id=s.id where s.round_id='$TV_ROUND_ID'::uuid and s.status<>'deleted' group by s.id having sum(e.points)<>20 or count(*)<5) invalid;")" == "0" ]] || fail "accepted Televote ballot violates configured vote shape"
  log "S14_INVARIANT_TELEVOTE_COMPLETE"

  apply_televote_round_status closed '14000000-0000-4007-8000-000000000004' 's14-televote-final-close'
  [[ "$(db_scalar "select status::text from televoting.rounds where id='$TV_ROUND_ID'::uuid;")" == "closed" ]] || fail "S14 Televote did not close before results"

  log "S14_STAGE_7_PUBLIC_VOTING_COMPLETE"
}
