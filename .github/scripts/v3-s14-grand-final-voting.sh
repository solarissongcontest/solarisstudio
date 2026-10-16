#!/usr/bin/env bash
set -euo pipefail

final_televote_ballot_for_country() {
  local round_id="$1" country_code="$2" target_codes
  target_codes="$(db_scalar "
select coalesce(jsonb_agg(entry_key order by display_order), '[]'::jsonb)::text
from (
  select entry_key, display_order
  from televoting.round_entries
  where round_id='$round_id'::uuid
    and entry_key <> '$country_code'
  order by display_order
  limit 5
) entries;
")"
  python3 -c '
import json,sys
codes=json.loads(sys.argv[1])
if len(codes) != 5:
    raise SystemExit(f"expected five final Televote targets, got {len(codes)}")
points=[6,5,4,3,2]
print(json.dumps([{"target_country_code":code,"points":points[i]} for i,code in enumerate(codes)],separators=(",",":")))
' "$target_codes"
}

run_s14_grand_final_voting() {
  log "Grand-final leg: run canonical Jury and public Televote against the qualified final lineup"

  [[ "$(db_scalar "select count(*) from public.participants where show_id='$FINAL_ID'::uuid and qualified is true;")" == "20" ]] || fail "Grand Final voting requires exactly 20 canonical qualified participants"
  [[ "$(db_scalar "select count(*) from public.voters where show_id='$FINAL_ID'::uuid;")" == "66" ]] || fail "Grand Final voting requires the prepared 66-delegation Jury roster"
  [[ "$(db_scalar "select count(*) from televoting.round_entries where round_id='$S14_FINAL_TELEVOTE_ROUND_ID'::uuid;")" == "20" ]] || fail "Grand Final voting requires the prepared 20-entry Televote round"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"
  governed_jury_window_change "$ORGANIZER_A_TOKEN" "$FINAL_ID" open \
    '14000000-0000-4010-8100-000000000001' 's14-final-jury-open'

  final_jury_total=0
  for i in $(seq 1 66); do
    index="$(printf '%02d' "$i")"
    suffix="$(printf '%012d' "$i")"
    country_id="14000000-0000-4000-8000-$suffix"
    email="s14-hod-$index@solaris.invalid"
    username="s14_hod_$index"
    sign_in "$email"
    hod_token="$LAST_TOKEN"
    hod_id="$(db_scalar "select user_id from public.country_accounts where country_id='$country_id'::uuid and status='active' limit 1;")"
    country_code="$(db_scalar "select short_code from public.countries where id='$country_id'::uuid;")"
    [[ -n "$hod_id" && -n "$country_code" ]] || fail "Grand Final Jury identity missing for delegation $index"

    ballot_json="$(jury_ballot_for_country "$FINAL_ID" "$country_id")"
    [[ "$(python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' <<< "$ballot_json")" == "10" ]] || fail "Grand Final Jury ballot $index does not contain ten targets"

    preflight_id="14000000-0000-4010-8200-$suffix"
    operation_id="14000000-0000-4010-8300-$suffix"
    seed_jury_preflight "$preflight_id" "$FINAL_ID" "$hod_id" "$username" "$country_code" "$ballot_json"
    submit_body="{\"_show_id\":\"$FINAL_ID\",\"_entries\":$ballot_json,\"_preflight_id\":\"$preflight_id\",\"_operation_id\":\"$operation_id\",\"_request_hash\":\"caller-hash-is-not-authority\"}"

    rpc_request "$hod_token" v3_submit_jury_ballot "$submit_body"
    expect_success "Grand Final Jury ballot $index"
    expect_json "Grand Final Jury ballot $index accepted" ok true
    expect_json "Grand Final Jury ballot $index authority" receipt.authority authoritative_server
    expect_json "Grand Final Jury ballot $index first receipt" receipt.replayed false

    receipt_id="$(printf '%s' "$HTTP_BODY" | json_value receipt.receipt_id)"
    [[ -n "$receipt_id" ]] || fail "Grand Final Jury ballot $index returned no receipt"
    rpc_request "$hod_token" v3_reconcile_jury_submission "{\"_operation_id\":\"$operation_id\"}"
    expect_success "Grand Final Jury reconciliation $index"
    expect_json "Grand Final Jury reconciliation $index found" found true
    expect_json "Grand Final Jury reconciliation $index receipt" receipt.receipt_id "$receipt_id"
    final_jury_total=$((final_jury_total + 1))
  done

  [[ "$final_jury_total" == "66" ]] || fail "Grand Final Jury submitted $final_jury_total ballots instead of 66"
  [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$FINAL_ID'::uuid and status='submitted';")" == "66" ]] || fail "Grand Final canonical Jury submission count is not 66"
  [[ "$(db_scalar "select count(*) from public.jury_votes where show_id='$FINAL_ID'::uuid;")" == "660" ]] || fail "Grand Final Jury score rows are not 66 complete ten-score ballots"
  [[ "$(db_scalar "select count(*) from (select voter_country_id,count(*) from public.jury_ballot_submissions where show_id='$FINAL_ID'::uuid group by voter_country_id having count(*)>1) duplicates;")" == "0" ]] || fail "Grand Final contains duplicate final Jury ballots"
  [[ "$(db_scalar "select count(*) from public.jury_votes where show_id='$FINAL_ID'::uuid and voter_country_id=receiving_country_id;")" == "0" ]] || fail "Grand Final own-country Jury vote survived canonical validation"

  governed_jury_window_change "$ORGANIZER_A_TOKEN" "$FINAL_ID" closed \
    '14000000-0000-4010-8100-000000000002' 's14-final-jury-close'

  apply_televote_round_status "$S14_FINAL_TELEVOTE_ROUND_ID" open \
    '14000000-0000-4010-8400-000000000001' 's14-final-televote-open'

  final_televote_total=0
  for i in $(seq 1 12); do
    index="$(printf '%02d' "$i")"
    suffix="$(printf '%012d' "$i")"
    country_code="$(db_scalar "select short_code from public.countries where id='14000000-0000-4000-8000-$suffix'::uuid;")"
    username="s14-final-public-$index"
    ballot_json="$(final_televote_ballot_for_country "$S14_FINAL_TELEVOTE_ROUND_ID" "$country_code")"
    preflight_id="14000000-0000-4010-8500-$suffix"

    submit_supported_vote "$S14_FINAL_TELEVOTE_ROUND_ID" "$username" "$country_code" "$ballot_json" "$preflight_id"
    expect_success "Grand Final public Televote $index"
    expect_json "Grand Final public Televote $index status" status active
    final_televote_total=$((final_televote_total + 1))
  done

  [[ "$final_televote_total" == "12" ]] || fail "Grand Final accepted $final_televote_total public ballots instead of 12"
  [[ "$(db_scalar "select count(*) from televoting.vote_submissions where round_id='$S14_FINAL_TELEVOTE_ROUND_ID'::uuid and status<>'deleted';")" == "12" ]] || fail "Grand Final canonical Televote submission count is not 12"
  [[ "$(db_scalar "select count(*) from televoting.vote_entries e join televoting.vote_submissions s on s.id=e.submission_id where s.round_id='$S14_FINAL_TELEVOTE_ROUND_ID'::uuid and s.status<>'deleted';")" == "60" ]] || fail "Grand Final canonical Televote rows are not twelve complete five-entry ballots"
  [[ "$(db_scalar "select count(*) from (select username_normalized,count(*) from televoting.vote_submissions where round_id='$S14_FINAL_TELEVOTE_ROUND_ID'::uuid and status<>'deleted' group by username_normalized having count(*)>1) duplicates;")" == "0" ]] || fail "Grand Final contains duplicate canonical public ballots"
  [[ "$(db_scalar "select count(*) from private.v3_domain_events where event_type='televote.ballot_submitted' and payload ->> 'roundId'='$S14_FINAL_TELEVOTE_ROUND_ID';")" == "12" ]] || fail "Grand Final Televote submissions did not bridge to twelve canonical ballot events"

  apply_televote_round_status "$S14_FINAL_TELEVOTE_ROUND_ID" closed \
    '14000000-0000-4010-8400-000000000002' 's14-final-televote-close'

  log "S14_GRAND_FINAL_VOTING_COMPLETE"
}
