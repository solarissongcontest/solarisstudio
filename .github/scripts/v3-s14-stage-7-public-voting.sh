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
  local round_id="$1" preflight_id="$2" username="$3" country_code="$4" ballot_json="$5"
  local risk_score="${6:-0}" severity="${7:-none}" requires_attestation="${8:-false}"
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
  '$preflight_id'::uuid, '$round_id'::uuid, lower('$username'), '$country_code', '$ballot_map'::jsonb,
  $risk_score, '$severity', $requires_attestation, '$findings'::jsonb, '[]'::jsonb,
  '{\"s14Deterministic\":true}'::jsonb, now()+interval '30 minutes'
);
"
}

apply_televote_round_status() {
  local round_id="$1" status="$2" operation_id="$3" idempotency_key="$4"
  local global_version round_version

  televoting_rpc_request "$ORGANIZER_A_TOKEN" studio2_round_status_change_preview \
    "{\"p_round_id\":\"$round_id\",\"p_status\":\"$status\"}"
  expect_success "preview Televote round $round_id -> $status"
  [[ "$(printf '%s' "$HTTP_BODY" | json_value 'blockers')" == "[]" ]] || fail "Televote $round_id -> $status preview returned blockers: $HTTP_BODY"
  global_version="$(printf '%s' "$HTTP_BODY" | json_value expectedGlobalVersion)"
  round_version="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"
  [[ -n "$global_version" && -n "$round_version" ]] || fail "Televote $round_id -> $status preview omitted concurrency versions"

  televoting_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_status_change \
    "{\"p_round_id\":\"$round_id\",\"p_status\":\"$status\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_global_version\":$global_version,\"p_expected_round_version\":$round_version}"
  expect_success "apply Televote round $round_id -> $status"
  expect_json "Televote round $round_id -> $status receipt" status "$status"
  [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$operation_id'::uuid and command='televote.round.$status' and status='succeeded';")" == "1" ]] || fail "Televote $round_id -> $status operation receipt missing"
}

round_ballot() {
  local round_id="$1"
  local target_codes
  target_codes="$(db_scalar "
select jsonb_agg(entry_key order by display_order)::text
from (
  select entry_key, display_order
  from televoting.round_entries
  where round_id='$round_id'::uuid
  order by display_order
  limit 5
) entries;
")"
  python3 -c '
import json,sys
codes=json.loads(sys.argv[1])
points=[6,5,4,3,2]
print(json.dumps([{"target_country_code":code,"points":points[i]} for i,code in enumerate(codes)], separators=(",", ":")))
' "$target_codes"
}

run_s14_stage_7_public_voting() {
  log "Stage 7/10: governed public voting, duplicate protection, extension, uncertainty recovery and integrity signal"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"
  TV_ROUND_TWO_ID='14000000-0000-4000-8000-000000000033'

  # Public-voting publication later synchronizes only when a remote round is an
  # exact projection of one bound Solaris show. Build two 33-entry rounds from
  # the same semi-final lineups exercised by Stage 5/6; a generic edition-wide
  # field would correctly fail the canonical result-sync lineup check.
  db_exec "
insert into public.integration_links(service,entity_type,solaris_id,remote_id,edition_id,sync_status,metadata,last_synced_at)
values ('televoting','edition','$EDITION_ID'::uuid,'$TV_EDITION_ID','$EDITION_ID'::uuid,'linked','{\"source\":\"s14\"}'::jsonb,now())
on conflict (service,entity_type,remote_id) do update set
  solaris_id=excluded.solaris_id, edition_id=excluded.edition_id,
  sync_status='linked', metadata=excluded.metadata, last_synced_at=now(), updated_at=now();

insert into televoting.rounds(id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode)
values ('$TV_ROUND_TWO_ID'::uuid,'$TV_EDITION_ID'::uuid,'S14 Semi-final 2 Televote','draft',58,'countries','country_match')
on conflict (id) do update set
  name=excluded.name,status='draft',results_status='draft',calculation_version=0,
  total_points_to_distribute=58,participant_mode='countries',self_voting_mode='country_match';

update televoting.rounds
set name='S14 Semi-final 1 Televote', status='draft', results_status='draft', calculation_version=0,
    total_points_to_distribute=58, participant_mode='countries', self_voting_mode='country_match'
where id='$TV_ROUND_ID'::uuid;

delete from televoting.round_countries where round_id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid);
delete from televoting.round_entries where round_id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid);

insert into televoting.round_countries(round_id,country_code,display_order)
select '$TV_ROUND_ID'::uuid,c.short_code,p.running_order
from public.participants p
join public.countries c on c.id=p.country_id
where p.show_id='$SEMI_ONE_ID'::uuid
order by p.running_order;
insert into televoting.round_countries(round_id,country_code,display_order)
select '$TV_ROUND_TWO_ID'::uuid,c.short_code,p.running_order
from public.participants p
join public.countries c on c.id=p.country_id
where p.show_id='$SEMI_TWO_ID'::uuid
order by p.running_order;

insert into televoting.round_entries(round_id,entry_type,entry_key,country_code,short_name,entry_code,display_order)
select '$TV_ROUND_ID'::uuid,'country',c.short_code,c.short_code,'S14 '||c.short_code,c.short_code,p.running_order
from public.participants p
join public.countries c on c.id=p.country_id
where p.show_id='$SEMI_ONE_ID'::uuid
order by p.running_order;
insert into televoting.round_entries(round_id,entry_type,entry_key,country_code,short_name,entry_code,display_order)
select '$TV_ROUND_TWO_ID'::uuid,'country',c.short_code,c.short_code,'S14 '||c.short_code,c.short_code,p.running_order
from public.participants p
join public.countries c on c.id=p.country_id
where p.show_id='$SEMI_TWO_ID'::uuid
order by p.running_order;

insert into public.televoting_round_bindings(
  remote_round_id,remote_edition_id,edition_id,show_id,source_mode,last_synced_at,frozen_at,created_at,updated_at
) values
  ('$TV_ROUND_ID','$TV_EDITION_ID','$EDITION_ID'::uuid,'$SEMI_ONE_ID'::uuid,'show',now(),null,now(),now()),
  ('$TV_ROUND_TWO_ID','$TV_EDITION_ID','$EDITION_ID'::uuid,'$SEMI_TWO_ID'::uuid,'show',now(),null,now(),now())
on conflict (remote_round_id) do update set
  remote_edition_id=excluded.remote_edition_id,edition_id=excluded.edition_id,show_id=excluded.show_id,
  source_mode='show',last_synced_at=now(),frozen_at=null,updated_at=now();
"

  for pair in "$TV_ROUND_ID:$SEMI_ONE_ID" "$TV_ROUND_TWO_ID:$SEMI_TWO_ID"; do
    round_id="${pair%%:*}"
    show_id="${pair##*:}"
    [[ "$(db_scalar "select count(*) from televoting.round_entries where round_id='$round_id'::uuid;")" == "33" ]] || fail "S14 Televote round $round_id does not contain exactly 33 entries"
    [[ "$(db_scalar "select count(*) from televoting.round_entries re join public.countries c on c.short_code=re.country_code join public.participants p on p.country_id=c.id and p.show_id='$show_id'::uuid where re.round_id='$round_id'::uuid;")" == "33" ]] || fail "S14 Televote round $round_id does not exactly project its bound Solaris semi-final"
  done

  ballot_one="$(round_ballot "$TV_ROUND_ID")"
  ballot_two="$(round_ballot "$TV_ROUND_TWO_ID")"
  for ballot_json in "$ballot_one" "$ballot_two"; do
    [[ "$(python3 -c 'import json,sys; rows=json.load(sys.stdin); print(len(rows))' <<< "$ballot_json")" == "5" ]] || fail "S14 Televote ballot does not contain five targets"
    [[ "$(python3 -c 'import json,sys; rows=json.load(sys.stdin); print(sum(row["points"] for row in rows))' <<< "$ballot_json")" == "20" ]] || fail "S14 Televote ballot does not total 20 points"
  done

  apply_televote_round_status "$TV_ROUND_ID" open '14000000-0000-4007-8000-000000000001' 's14-televote-semi1-open'
  [[ "$(db_scalar "select status::text from televoting.rounds where id='$TV_ROUND_ID'::uuid;")" == "open" ]] || fail "S14 Semi-final 1 Televote did not open"

  semi_one_accepted=0
  for i in $(seq 51 55); do
    index="$(printf '%02d' "$i")"
    suffix="$(printf '%012d' "$i")"
    username="s14-public-$index"
    country_code="$(db_scalar "select short_code from public.countries where id=('14000000-0000-4000-8000-'||lpad('$i',12,'0'))::uuid;")"
    preflight_id="14000000-0000-4007-8100-$suffix"
    [[ -n "$country_code" ]] || fail "S14 public voter $index has no country code"
    seed_televote_preflight "$TV_ROUND_ID" "$preflight_id" "$username" "$country_code" "$ballot_one"

    televoting_rpc_request "$ANON_KEY" submit_vote_checked \
      "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$username\",\"p_country_code\":\"$country_code\",\"p_entries\":$ballot_one,\"p_preflight_token\":\"$preflight_id\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
    expect_success "Semi-final 1 public Televote $index"
    expect_json "Semi-final 1 public Televote $index status" status active
    semi_one_accepted=$((semi_one_accepted + 1))
  done

  duplicate_country="$(db_scalar "select country_code from televoting.vote_submissions where round_id='$TV_ROUND_ID'::uuid and username_normalized='s14-public-51' limit 1;")"
  duplicate_preflight='14000000-0000-4007-8200-000000000051'
  seed_televote_preflight "$TV_ROUND_ID" "$duplicate_preflight" 's14-public-51' "$duplicate_country" "$ballot_one"
  televoting_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"s14-public-51\",\"p_country_code\":\"$duplicate_country\",\"p_entries\":$ballot_one,\"p_preflight_token\":\"$duplicate_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_failure "duplicate public Televote"
  [[ "$HTTP_BODY" == *"already voted"* ]] || fail "duplicate Televote did not surface canonical duplicate protection: $HTTP_BODY"

  extension_username='s14-public-56'
  extension_country="$(db_scalar "select short_code from public.countries where id='14000000-0000-4000-8000-000000000056'::uuid;")"
  extension_preflight='14000000-0000-4007-8100-000000000056'
  seed_televote_preflight "$TV_ROUND_ID" "$extension_preflight" "$extension_username" "$extension_country" "$ballot_one"

  apply_televote_round_status "$TV_ROUND_ID" closed '14000000-0000-4007-8000-000000000002' 's14-televote-semi1-close-for-extension'
  first_closed_at="$(db_scalar "select closed_at::text from televoting.rounds where id='$TV_ROUND_ID'::uuid;")"
  televoting_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$extension_username\",\"p_country_code\":\"$extension_country\",\"p_entries\":$ballot_one,\"p_preflight_token\":\"$extension_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_failure "Televote while closed"
  [[ "$HTTP_BODY" == *"Round is not open"* ]] || fail "closed Televote did not reject writes: $HTTP_BODY"

  apply_televote_round_status "$TV_ROUND_ID" open '14000000-0000-4007-8000-000000000003' 's14-televote-extension-reopen'
  reopened_at="$(db_scalar "select opened_at::text from televoting.rounds where id='$TV_ROUND_ID'::uuid;")"
  [[ -n "$first_closed_at" && -n "$reopened_at" ]] || fail "Televote extension lacks close/reopen timestamps"
  [[ "$(db_scalar "select (opened_at > closed_at)::text from televoting.rounds where id='$TV_ROUND_ID'::uuid;")" == "true" ]] || fail "Televote extension did not create a later reopened window"
  televoting_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$extension_username\",\"p_country_code\":\"$extension_country\",\"p_entries\":$ballot_one,\"p_preflight_token\":\"$extension_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_success "Televote after governed extension"
  semi_one_accepted=$((semi_one_accepted + 1))

  uncertain_username='s14-public-57'
  uncertain_country="$(db_scalar "select short_code from public.countries where id='14000000-0000-4000-8000-000000000057'::uuid;")"
  uncertain_preflight='14000000-0000-4007-8100-000000000057'
  seed_televote_preflight "$TV_ROUND_ID" "$uncertain_preflight" "$uncertain_username" "$uncertain_country" "$ballot_one"
  rpc_request "$SERVICE_ROLE_KEY" v3_create_televote_recovery_handle "{\"p_preflight_token\":\"$uncertain_preflight\"}"
  expect_success "create Televote recovery capability"
  recovery_operation="$(printf '%s' "$HTTP_BODY" | json_value '0.operation_id')"
  recovery_secret="$(printf '%s' "$HTTP_BODY" | json_value '0.recovery_secret')"
  [[ -n "$recovery_operation" && -n "$recovery_secret" ]] || fail "Televote recovery capability is incomplete"

  televoting_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$uncertain_username\",\"p_country_code\":\"$uncertain_country\",\"p_entries\":$ballot_one,\"p_preflight_token\":\"$uncertain_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_success "commit Televote before simulated response loss"
  semi_one_accepted=$((semi_one_accepted + 1))
  rpc_request "$ANON_KEY" v3_reconcile_televote \
    "{\"p_preflight_token\":\"$uncertain_preflight\",\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$uncertain_username\",\"p_country_code\":\"$uncertain_country\",\"p_entries\":$ballot_one}"
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

  integrity_username='s14-public-58'
  integrity_country="$(db_scalar "select short_code from public.countries where id='14000000-0000-4000-8000-000000000058'::uuid;")"
  integrity_preflight='14000000-0000-4007-8100-000000000058'
  seed_televote_preflight "$TV_ROUND_ID" "$integrity_preflight" "$integrity_username" "$integrity_country" "$ballot_one" 42 review false
  televoting_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$TV_ROUND_ID\",\"p_username\":\"$integrity_username\",\"p_country_code\":\"$integrity_country\",\"p_entries\":$ballot_one,\"p_preflight_token\":\"$integrity_preflight\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
  expect_success "integrity-signalled public Televote"
  expect_json "integrity-signalled Televote risk" risk_score 42
  [[ "$(db_scalar "select count(*) from televoting.anti_abuse_events where round_id='$TV_ROUND_ID'::uuid and username_normalized=lower('$integrity_username') and reason='pre_submit_integrity_check' and risk_score=42;")" == "1" ]] || fail "accepted integrity signal did not produce canonical anti-abuse evidence"
  semi_one_accepted=$((semi_one_accepted + 1))
  [[ "$semi_one_accepted" == "8" ]] || fail "S14 Semi-final 1 Televote accepted $semi_one_accepted ballots instead of 8"
  apply_televote_round_status "$TV_ROUND_ID" closed '14000000-0000-4007-8000-000000000004' 's14-televote-semi1-final-close'

  # Exercise the second canonical semi-final as well so Stage 8 can calculate
  # both show results rather than syncing one remote round and inventing the
  # other half of the contest later.
  apply_televote_round_status "$TV_ROUND_TWO_ID" open '14000000-0000-4007-8000-000000000005' 's14-televote-semi2-open'
  semi_two_accepted=0
  for i in $(seq 1 3); do
    voter_number=$((i + 10))
    suffix="$(printf '%012d' "$voter_number")"
    username="s14-semi2-public-$(printf '%02d' "$i")"
    country_code="$(db_scalar "select short_code from public.countries where id=('14000000-0000-4000-8000-'||lpad('$voter_number',12,'0'))::uuid;")"
    preflight_id="14000000-0000-4007-8400-$suffix"
    seed_televote_preflight "$TV_ROUND_TWO_ID" "$preflight_id" "$username" "$country_code" "$ballot_two"
    televoting_rpc_request "$ANON_KEY" submit_vote_checked \
      "{\"p_round_id\":\"$TV_ROUND_TWO_ID\",\"p_username\":\"$username\",\"p_country_code\":\"$country_code\",\"p_entries\":$ballot_two,\"p_preflight_token\":\"$preflight_id\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
    expect_success "Semi-final 2 public Televote $i"
    semi_two_accepted=$((semi_two_accepted + 1))
  done
  [[ "$semi_two_accepted" == "3" ]] || fail "S14 Semi-final 2 Televote accepted $semi_two_accepted ballots instead of 3"
  apply_televote_round_status "$TV_ROUND_TWO_ID" closed '14000000-0000-4007-8000-000000000006' 's14-televote-semi2-close'

  [[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$TV_ROUND_ID'::uuid and status<>'deleted';")" == "8" ]] || fail "Semi-final 1 canonical Televote submission count is not 8"
  [[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$TV_ROUND_TWO_ID'::uuid and status<>'deleted';")" == "3" ]] || fail "Semi-final 2 canonical Televote submission count is not 3"
  [[ "$(db_scalar "select count(*) from televoting.vote_entries e join televoting.vote_submissions s on s.id=e.submission_id where s.round_id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid) and s.status<>'deleted';")" == "55" ]] || fail "canonical Televote entry rows are not eleven complete five-entry ballots"
  [[ "$(db_scalar "select count(*) from (select round_id,username_normalized,count(*) from televoting.vote_submissions where round_id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid) and status<>'deleted' group by round_id,username_normalized having count(*)>1) d;")" == "0" ]] || fail "duplicate canonical Televote ballot detected"
  [[ "$(db_scalar "select count(*) from (select s.id,sum(e.points) as total,count(*) as entries from televoting.vote_submissions s join televoting.vote_entries e on e.submission_id=s.id where s.round_id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid) and s.status<>'deleted' group by s.id having sum(e.points)<>20 or count(*)<>5) invalid;")" == "0" ]] || fail "accepted Televote ballot violates configured vote shape"
  [[ "$(db_scalar "select count(*) from public.televoting_round_bindings where remote_round_id in ('$TV_ROUND_ID','$TV_ROUND_TWO_ID') and show_id is not null and source_mode='show';")" == "2" ]] || fail "both S14 Televote rounds are not bound to Solaris shows"
  [[ "$(db_scalar "select count(*) from televoting.rounds where id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid) and status='closed';")" == "2" ]] || fail "both S14 Televote rounds must be closed before results"
  log "S14_INVARIANT_TELEVOTE_COMPLETE"
  log "S14_STAGE_7_PUBLIC_VOTING_COMPLETE"
}
