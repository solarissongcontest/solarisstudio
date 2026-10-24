#!/usr/bin/env bash
set -euo pipefail

televote_rpc_request() {
  local token="$1" function_name="$2" body="$3" output
  output="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' \
    -X POST "$API_URL/rest/v1/rpc/$function_name" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -H "Content-Profile: televoting" \
    -H "Accept-Profile: televoting" \
    --data "$body")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

televote_ballot_map() {
  python3 -c '
import json,sys
rows=json.load(sys.stdin)
print(json.dumps({row["target_country_code"]:row["points"] for row in rows},separators=(",",":"),sort_keys=True))
'
}

seed_televote_preflight() {
  local round_id="$1" id="$2" username="$3" country_code="$4" ballot_json="$5"
  local risk_score="${6:-0}" severity="${7:-none}"
  local ballot_map
  ballot_map="$(printf '%s' "$ballot_json" | televote_ballot_map)"
  db_exec "
insert into televoting.vote_preflight_checks(
  id, round_id, username_normalized, country_code, ballot_map,
  risk_score, severity, requires_attestation, findings, technical_signals,
  channel, canonical_edition_id, expires_at
) values (
  '$id'::uuid, '$round_id'::uuid, lower('$username'), '$country_code', '$ballot_map'::jsonb,
  $risk_score, '$severity', false,
  case when $risk_score > 0 then '[{\"reason\":\"s14_integrity_signal\"}]'::jsonb else '[]'::jsonb end,
  case when $risk_score > 0 then '[{\"type\":\"s14_rehearsal_signal\"}]'::jsonb else '[]'::jsonb end,
  'televote', '$EDITION_ID'::uuid, now()+interval '30 minutes'
);
"
}

apply_televote_round_status() {
  local round_id="$1" status="$2" operation_id="$3" idempotency_key="$4"
  local global_version round_version blockers event_type

  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_round_status_change_preview \
    "{\"p_round_id\":\"$round_id\",\"p_status\":\"$status\"}"
  expect_success "preview Televote $round_id -> $status"
  blockers="$(printf '%s' "$HTTP_BODY" | json_value blockers)"
  [[ "$blockers" == "[]" ]] || fail "Televote $round_id -> $status preview returned blockers: $HTTP_BODY"
  global_version="$(printf '%s' "$HTTP_BODY" | json_value expectedGlobalVersion)"
  round_version="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"
  [[ -n "$global_version" && -n "$round_version" ]] || fail "Televote status preview omitted concurrency versions"

  televote_rpc_request "$ORGANIZER_A_TOKEN" studio2_apply_round_status_change \
    "{\"p_round_id\":\"$round_id\",\"p_status\":\"$status\",\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$idempotency_key\",\"p_expected_global_version\":$global_version,\"p_expected_round_version\":$round_version}"
  expect_success "apply Televote $round_id -> $status"
  expect_json "Televote $round_id -> $status receipt" status "$status"
  [[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='$operation_id'::uuid and command='televote.round.$status' and status='succeeded';")" == "1" ]] || fail "Televote $round_id -> $status operation receipt missing"
  if [[ "$status" == "open" ]]; then event_type='televote.opened'; else event_type='televote.closed'; fi
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='$operation_id'::uuid and event_type='$event_type';")" == "1" ]] || fail "Televote $round_id -> $status DomainEvent missing"
}

round_ballot() {
  local round_id="$1" target_codes
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
print(json.dumps([{"target_country_code":code,"points":points[i]} for i,code in enumerate(codes)],separators=(",",":")))
' "$target_codes"
}

submit_supported_vote() {
  local round_id="$1" username="$2" country_code="$3" ballot_json="$4" preflight_id="$5"
  local risk_score="${6:-0}" severity="${7:-none}"
  seed_televote_preflight "$round_id" "$preflight_id" "$username" "$country_code" "$ballot_json" "$risk_score" "$severity"
  televote_rpc_request "$ANON_KEY" submit_vote_checked \
    "{\"p_round_id\":\"$round_id\",\"p_username\":\"$username\",\"p_country_code\":\"$country_code\",\"p_entries\":$ballot_json,\"p_preflight_token\":\"$preflight_id\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
}

run_s14_stage_7_public_voting_supported_cases() {
  log "Stage 7 supported cases: two show-bound Televote rounds, duplicate protection, recovery and integrity evidence"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"
  TV_ROUND_TWO_ID='14000000-0000-4000-8000-000000000033'

  db_exec "
insert into public.integration_links(service,entity_type,solaris_id,remote_id,edition_id,sync_status,metadata,last_synced_at)
values ('televoting','edition','$EDITION_ID'::uuid,'$TV_EDITION_ID','$EDITION_ID'::uuid,'linked','{\"source\":\"s14-full-contest\"}'::jsonb,now())
on conflict (service,entity_type,remote_id) do update set
  solaris_id=excluded.solaris_id, edition_id=excluded.edition_id,
  sync_status='linked', metadata=excluded.metadata, last_synced_at=now(), updated_at=now();

insert into televoting.rounds(id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode)
values ('$TV_ROUND_TWO_ID'::uuid,'$TV_EDITION_ID'::uuid,'S14 Semi-final 2 Televote','draft',20,'countries','country_match')
on conflict (id) do update set
  name=excluded.name,status='draft',results_status='draft',calculation_version=0,
  total_points_to_distribute=20,participant_mode='countries',self_voting_mode='country_match';

update televoting.rounds
set name='S14 Semi-final 1 Televote', status='draft', results_status='draft', calculation_version=0,
    total_points_to_distribute=20, participant_mode='countries', self_voting_mode='country_match'
where id='$TV_ROUND_ID'::uuid;

delete from televoting.round_countries where round_id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid);
delete from televoting.round_entries where round_id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid);

insert into televoting.round_countries(round_id,country_code,display_order)
select '$TV_ROUND_ID'::uuid,c.short_code,p.running_order
from public.participants p
join public.countries c on c.id=p.country_id
where p.show_id='$SEMI_ONE_ID'::uuid
  and coalesce(p.participation_status,'confirmed')='confirmed'
order by p.running_order;
insert into televoting.round_countries(round_id,country_code,display_order)
select '$TV_ROUND_TWO_ID'::uuid,c.short_code,p.running_order
from public.participants p
join public.countries c on c.id=p.country_id
where p.show_id='$SEMI_TWO_ID'::uuid
  and coalesce(p.participation_status,'confirmed')='confirmed'
order by p.running_order;

insert into televoting.round_entries(round_id,entry_type,entry_key,country_code,short_name,entry_code,display_order)
select '$TV_ROUND_ID'::uuid,'country',c.short_code,c.short_code,'S14 '||c.short_code,c.short_code,p.running_order
from public.participants p
join public.countries c on c.id=p.country_id
where p.show_id='$SEMI_ONE_ID'::uuid
  and coalesce(p.participation_status,'confirmed')='confirmed'
order by p.running_order;
insert into televoting.round_entries(round_id,entry_type,entry_key,country_code,short_name,entry_code,display_order)
select '$TV_ROUND_TWO_ID'::uuid,'country',c.short_code,c.short_code,'S14 '||c.short_code,c.short_code,p.running_order
from public.participants p
join public.countries c on c.id=p.country_id
where p.show_id='$SEMI_TWO_ID'::uuid
  and coalesce(p.participation_status,'confirmed')='confirmed'
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
    # Stage 4 has canonically withdrawn a delegation. Preserve that lifecycle
    # outcome: the voting lineup is the current confirmed show, not the seed.
    expected_participants="$(db_scalar "select count(*) from public.participants where show_id='$show_id'::uuid and coalesce(participation_status,'confirmed')='confirmed';")"
    [[ "$expected_participants" -gt 0 ]] || fail "S14 bound show has no confirmed participants"
    [[ "$(db_scalar "select count(*) from televoting.round_entries where round_id='$round_id'::uuid;")" == "$expected_participants" ]] || fail "S14 Televote round $round_id differs from its confirmed lineup"
    [[ "$(db_scalar "select count(*) from televoting.round_entries re join public.countries c on c.short_code=re.country_code join public.participants p on p.country_id=c.id and p.show_id='$show_id'::uuid and coalesce(p.participation_status,'confirmed')='confirmed' where re.round_id='$round_id'::uuid;")" == "$expected_participants" ]] || fail "S14 Televote round $round_id does not exactly project its bound Solaris show"
    [[ "$(db_scalar "select total_points_to_distribute from televoting.rounds where id='$round_id'::uuid;")" == "20" ]] || fail "S14 Televote round $round_id metadata does not match the authoritative 20-point ballot contract"
  done

  ballot_one="$(round_ballot "$TV_ROUND_ID")"
  ballot_two="$(round_ballot "$TV_ROUND_TWO_ID")"
  for ballot_json in "$ballot_one" "$ballot_two"; do
    [[ "$(python3 -c 'import json,sys; rows=json.load(sys.stdin); print(len(rows))' <<< "$ballot_json")" == "5" ]] || fail "S14 Televote ballot does not contain five targets"
    [[ "$(python3 -c 'import json,sys; rows=json.load(sys.stdin); print(sum(row["points"] for row in rows))' <<< "$ballot_json")" == "20" ]] || fail "S14 Televote ballot does not total 20 points"
  done

  apply_televote_round_status "$TV_ROUND_ID" open '14000000-0000-4007-8000-000000000001' 's14-televote-semi1-open'

  semi_one_accepted=0
  for i in $(seq 51 56); do
    index="$(printf '%02d' "$i")"
    suffix="$(printf '%012d' "$i")"
    username="s14-public-$index"
    country_code="$(db_scalar "select short_code from public.countries where id=('14000000-0000-4000-8000-'||lpad('$i',12,'0'))::uuid;")"
    preflight_id="14000000-0000-4007-8100-$suffix"
    submit_supported_vote "$TV_ROUND_ID" "$username" "$country_code" "$ballot_one" "$preflight_id"
    expect_success "Semi-final 1 public Televote $index"
    expect_json "Semi-final 1 public Televote $index status" status active
    semi_one_accepted=$((semi_one_accepted + 1))
  done

  duplicate_country="$(db_scalar "select country_code from televoting.vote_submissions where round_id='$TV_ROUND_ID'::uuid and username_normalized='s14-public-51' limit 1;")"
  duplicate_preflight='14000000-0000-4007-8200-000000000051'
  submit_supported_vote "$TV_ROUND_ID" 's14-public-51' "$duplicate_country" "$ballot_one" "$duplicate_preflight"
  expect_failure "duplicate public Televote"
  [[ "$HTTP_BODY" == *"already voted"* ]] || fail "duplicate Televote did not surface canonical duplicate protection: $HTTP_BODY"

  uncertain_username='s14-public-57'
  uncertain_country="$(db_scalar "select short_code from public.countries where id='14000000-0000-4000-8000-000000000057'::uuid;")"
  uncertain_preflight='14000000-0000-4007-8100-000000000057'
  seed_televote_preflight "$TV_ROUND_ID" "$uncertain_preflight" "$uncertain_username" "$uncertain_country" "$ballot_one"
  rpc_request "$SERVICE_ROLE_KEY" v3_create_televote_recovery_handle "{\"p_preflight_token\":\"$uncertain_preflight\"}"
  expect_success "create Televote recovery capability"
  recovery_operation="$(printf '%s' "$HTTP_BODY" | json_value '0.operation_id')"
  recovery_secret="$(printf '%s' "$HTTP_BODY" | json_value '0.recovery_secret')"
  [[ -n "$recovery_operation" && -n "$recovery_secret" ]] || fail "Televote recovery capability is incomplete"

  televote_rpc_request "$ANON_KEY" submit_vote_checked \
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
  log "S14_FAILURE_TELEVOTE_NETWORK_UNCERTAINTY_COMPLETE"

  integrity_username='s14-public-58'
  integrity_country="$(db_scalar "select short_code from public.countries where id='14000000-0000-4000-8000-000000000058'::uuid;")"
  integrity_preflight='14000000-0000-4007-8100-000000000058'
  submit_supported_vote "$TV_ROUND_ID" "$integrity_username" "$integrity_country" "$ballot_one" "$integrity_preflight" 42 review
  expect_success "integrity-signalled public Televote"
  expect_json "integrity-signalled Televote risk" risk_score 42
  [[ "$(db_scalar "select count(*) from televoting.anti_abuse_events where round_id='$TV_ROUND_ID'::uuid and username_normalized=lower('$integrity_username') and reason='pre_submit_integrity_check' and risk_score=42;")" == "1" ]] || fail "accepted integrity signal did not produce canonical anti-abuse evidence"
  semi_one_accepted=$((semi_one_accepted + 1))
  [[ "$semi_one_accepted" == "8" ]] || fail "S14 Semi-final 1 Televote accepted $semi_one_accepted ballots instead of 8"

  apply_televote_round_status "$TV_ROUND_ID" closed '14000000-0000-4007-8000-000000000002' 's14-televote-semi1-close'

  closed_username='s14-public-59'
  closed_country="$(db_scalar "select short_code from public.countries where id='14000000-0000-4000-8000-000000000059'::uuid;")"
  closed_preflight='14000000-0000-4007-8100-000000000059'
  submit_supported_vote "$TV_ROUND_ID" "$closed_username" "$closed_country" "$ballot_one" "$closed_preflight"
  expect_failure "public Televote after round close"
  [[ "$HTTP_BODY" == *"Round is not open"* ]] || fail "closed Televote did not reject writes: $HTTP_BODY"

  apply_televote_round_status "$TV_ROUND_TWO_ID" open '14000000-0000-4007-8000-000000000003' 's14-televote-semi2-open'
  semi_two_accepted=0
  for i in $(seq 1 3); do
    voter_number=$((i + 10))
    suffix="$(printf '%012d' "$voter_number")"
    username="s14-semi2-public-$(printf '%02d' "$i")"
    country_code="$(db_scalar "select short_code from public.countries where id=('14000000-0000-4000-8000-'||lpad('$voter_number',12,'0'))::uuid;")"
    preflight_id="14000000-0000-4007-8400-$suffix"
    submit_supported_vote "$TV_ROUND_TWO_ID" "$username" "$country_code" "$ballot_two" "$preflight_id"
    expect_success "Semi-final 2 public Televote $i"
    expect_json "Semi-final 2 public Televote $i status" status active
    semi_two_accepted=$((semi_two_accepted + 1))
  done
  [[ "$semi_two_accepted" == "3" ]] || fail "S14 Semi-final 2 Televote accepted $semi_two_accepted ballots instead of 3"
  apply_televote_round_status "$TV_ROUND_TWO_ID" closed '14000000-0000-4007-8000-000000000004' 's14-televote-semi2-close'

  [[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$TV_ROUND_ID'::uuid and status<>'deleted';")" == "8" ]] || fail "Semi-final 1 canonical Televote submission count is not 8"
  [[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$TV_ROUND_TWO_ID'::uuid and status<>'deleted';")" == "3" ]] || fail "Semi-final 2 canonical Televote submission count is not 3"
  [[ "$(db_scalar "select count(*) from televoting.vote_entries e join televoting.vote_submissions s on s.id=e.submission_id where s.round_id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid) and s.status<>'deleted';")" == "55" ]] || fail "canonical Televote entry rows are not eleven complete five-entry ballots"
  [[ "$(db_scalar "select count(*) from (select round_id,username_normalized,count(*) from televoting.vote_submissions where round_id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid) and status<>'deleted' group by round_id,username_normalized having count(*)>1) d;")" == "0" ]] || fail "duplicate canonical Televote ballot detected"
  [[ "$(db_scalar "select count(*) from (select s.id,sum(e.points) as total,count(*) as entries from televoting.vote_submissions s join televoting.vote_entries e on e.submission_id=s.id where s.round_id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid) and s.status<>'deleted' group by s.id having sum(e.points)<>20 or count(*)<>5) invalid;")" == "0" ]] || fail "accepted Televote ballot violates authoritative vote shape"
  [[ "$(db_scalar "select count(*) from public.televoting_round_bindings where remote_round_id in ('$TV_ROUND_ID','$TV_ROUND_TWO_ID') and show_id is not null and source_mode='show';")" == "2" ]] || fail "both S14 Televote rounds are not bound to Solaris shows"
  [[ "$(db_scalar "select count(*) from televoting.rounds where id in ('$TV_ROUND_ID'::uuid,'$TV_ROUND_TWO_ID'::uuid) and status='closed';")" == "2" ]] || fail "both S14 Televote rounds must be closed before Results"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where event_type='televote.ballot_submitted' and payload ->> 'roundId' in ('$TV_ROUND_ID','$TV_ROUND_TWO_ID');")" == "11" ]] || fail "Televote submissions did not bridge to eleven canonical ballot events"
  log "S14_SUPPORTED_TELEVOTE_CANONICAL_BALLOT"

  log "S14_STAGE_7_PUBLIC_VOTING_SUPPORTED_CASES"
}
