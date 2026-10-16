#!/usr/bin/env bash
set -euo pipefail

jury_ballot_for_country() {
  local show_id="$1" country_id="$2"
  db_scalar "
with ranked as (
  select p.country_id,
         row_number() over (order by p.running_order nulls last, p.country_id) as rn
  from public.participants p
  where p.show_id='$show_id'::uuid
    and p.country_id <> '$country_id'::uuid
    and (p.participation_status is null or p.participation_status='confirmed')
  order by p.running_order nulls last, p.country_id
  limit 10
)
select coalesce(jsonb_agg(jsonb_build_object(
  'target_country_id', country_id,
  'points', case rn
    when 1 then 12 when 2 then 10 when 3 then 8 when 4 then 7 when 5 then 6
    when 6 then 5 when 7 then 4 when 8 then 3 when 9 then 2 when 10 then 1
  end
) order by rn), '[]'::jsonb)::text
from ranked;
"
}

jury_ballot_map() {
  python3 -c '
import json, sys
entries=json.load(sys.stdin)
print(json.dumps({row["target_country_id"]: row["points"] for row in entries}, separators=(",", ":"), sort_keys=True))
'
}

seed_jury_preflight() {
  local preflight_id="$1" show_id="$2" user_id="$3" username="$4" country_code="$5" ballot_json="$6"
  local ballot_map
  ballot_map="$(printf '%s' "$ballot_json" | jury_ballot_map)"
  db_exec "
insert into televoting.vote_preflight_checks(
  id, round_id, username_normalized, country_code, ballot_map, channel,
  canonical_edition_id, show_id, account_user_id, expires_at
) values (
  '$preflight_id'::uuid, null, '$username', '$country_code', '$ballot_map'::jsonb, 'jury',
  '$EDITION_ID'::uuid, '$show_id'::uuid, '$user_id'::uuid, now()+interval '30 minutes'
);
"
}

run_s14_stage_6_jury() {
  log "Stage 6/10: Jury eligibility, drafts, preflight, authoritative ballots, missing votes and conflicts"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  # Explicit jury rosters keep eligibility deterministic. Each delegation juries
  # the semi-final in which its canonical participant row appears.
  db_exec "delete from public.voters where edition_id='$EDITION_ID'::uuid and show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid);"
  db_exec "
insert into public.voters(edition_id,show_id,country_id,name,sort_order)
select '$EDITION_ID'::uuid,
       case when i <= 33 then '$SEMI_ONE_ID'::uuid else '$SEMI_TWO_ID'::uuid end,
       $country_uuid_sql,
       'S14 Jury ' || lpad(i::text,2,'0'),
       case when i <= 33 then i else i-33 end
from generate_series(1,66) i;
"
  [[ "$(db_scalar "select count(*) from public.voters where edition_id='$EDITION_ID'::uuid and show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid);")" == "66" ]] || fail "Jury roster does not contain all 66 delegations"

  # The real Organizer authority opens one Jury round at a time.
  rpc_request "$ORGANIZER_A_TOKEN" admin_set_jury_voting_status "{\"_show_id\":\"$SEMI_ONE_ID\",\"_status\":\"open\"}"
  expect_success "open semi-final 1 Jury"
  expect_json "semi-final 1 Jury opened" status open

  # A non-authenticated caller must not be able to fabricate a Jury result.
  rpc_request "$ANON_KEY" v3_submit_jury_ballot "{\"_show_id\":\"$SEMI_ONE_ID\",\"_entries\":[],\"_preflight_id\":\"14000000-0000-4006-8000-000000000001\",\"_operation_id\":\"14000000-0000-4006-8001-000000000001\",\"_request_hash\":\"caller-hash-is-not-authority\"}"
  expect_failure "anonymous Jury submission"

  submitted_total=0
  for i in $(seq 1 66); do
    if (( i == 34 )); then
      rpc_request "$ORGANIZER_A_TOKEN" admin_set_jury_voting_status "{\"_show_id\":\"$SEMI_TWO_ID\",\"_status\":\"open\"}"
      expect_success "open semi-final 2 Jury"
      expect_json "semi-final 2 Jury opened" status open
      [[ "$(db_scalar "select status from public.jury_voting_windows where show_id='$SEMI_ONE_ID'::uuid;")" == "closed" ]] || fail "opening semi-final 2 did not close the previous Jury window"
    fi

    show_id="$SEMI_ONE_ID"
    if (( i > 33 )); then show_id="$SEMI_TWO_ID"; fi

    # Leave exactly one missing ballot per semi-final. Missing state is evidence,
    # not something QA should conceal by auto-completing every delegation.
    if (( i == 33 || i == 66 )); then
      continue
    fi

    index="$(printf '%02d' "$i")"
    suffix="$(printf '%012d' "$i")"
    country_id="14000000-0000-4000-8000-$suffix"
    email="s14-hod-$index@solaris.invalid"
    username="s14_hod_$index"
    sign_in "$email"
    hod_token="$LAST_TOKEN"
    hod_id="$(db_scalar "select user_id from public.country_accounts where country_id='$country_id'::uuid and status='active' limit 1;")"
    country_code="$(db_scalar "select short_code from public.countries where id='$country_id'::uuid;")"
    [[ -n "$hod_id" && -n "$country_code" ]] || fail "Jury identity missing for delegation $index"

    ballot_json="$(jury_ballot_for_country "$show_id" "$country_id")"
    [[ "$(python3 -c 'import json,sys; print(len(json.load(sys.stdin)))' <<< "$ballot_json")" == "10" ]] || fail "delegation $index did not receive a complete 10-entry Jury ballot"

    # Multi-device conflict is proven on the real CAS draft before the final
    # submission. The stale desktop write must return the newer phone revision.
    if (( i == 1 )); then
      rpc_request "$hod_token" v3_save_jury_draft "{\"_show_id\":\"$show_id\",\"_payload\":{\"entries\":$ballot_json},\"_expected_revision\":0,\"_device_id\":\"s14-phone\",\"_session_id\":\"s14-phone-session\"}"
      expect_success "initial Jury draft from phone"
      expect_json "initial Jury draft accepted" ok true
      expect_json "initial Jury draft revision" server_revision 1

      rpc_request "$hod_token" v3_save_jury_draft "{\"_show_id\":\"$show_id\",\"_payload\":{\"entries\":$ballot_json},\"_expected_revision\":0,\"_device_id\":\"s14-desktop\",\"_session_id\":\"s14-desktop-stale\"}"
      expect_success "stale Jury draft returns structured conflict"
      expect_json "stale Jury draft rejected" ok false
      expect_json "stale Jury draft conflict" conflict true
      expect_json "stale Jury draft keeps server revision" server_revision 1
      log "S14_FAILURE_JURY_MULTI_DEVICE_COMPLETE"
    fi

    # Prove own-country validation with a preflight that matches the invalid
    # payload. The server must reject the ballot before any canonical vote row
    # exists, even though the integrity snapshot itself is internally coherent.
    if (( i == 2 )); then
      own_ballot="$(python3 -c '
import json,sys
country_id=sys.argv[1]
rows=json.load(sys.stdin)
rows[0]["target_country_id"]=country_id
print(json.dumps(rows,separators=(",",":")))
' "$country_id" <<< "$ballot_json")"
      own_preflight="14000000-0000-4006-8100-$suffix"
      seed_jury_preflight "$own_preflight" "$show_id" "$hod_id" "$username" "$country_code" "$own_ballot"
      rpc_request "$hod_token" v3_submit_jury_ballot "{\"_show_id\":\"$show_id\",\"_entries\":$own_ballot,\"_preflight_id\":\"$own_preflight\",\"_operation_id\":\"14000000-0000-4006-8101-$suffix\",\"_request_hash\":\"caller-hash-is-not-authority\"}"
      expect_failure "own-country Jury ballot"
      [[ "$HTTP_BODY" == *"cannot vote for your own country"* ]] || fail "own-country Jury rejection did not surface the canonical rule: $HTTP_BODY"
      [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$show_id'::uuid and voter_country_id='$country_id'::uuid;")" == "0" ]] || fail "rejected own-country ballot created canonical submission state"
    fi

    preflight_id="14000000-0000-4006-8200-$suffix"
    operation_id="14000000-0000-4006-8300-$suffix"
    seed_jury_preflight "$preflight_id" "$show_id" "$hod_id" "$username" "$country_code" "$ballot_json"
    submit_body="{\"_show_id\":\"$show_id\",\"_entries\":$ballot_json,\"_preflight_id\":\"$preflight_id\",\"_operation_id\":\"$operation_id\",\"_request_hash\":\"caller-hash-is-not-authority\"}"

    rpc_request "$hod_token" v3_submit_jury_ballot "$submit_body"
    expect_success "Jury ballot $index"
    expect_json "Jury ballot $index accepted" ok true
    expect_json "Jury ballot $index server authority" receipt.authority authoritative_server
    expect_json "Jury ballot $index initial receipt" receipt.replayed false
    receipt_id="$(printf '%s' "$HTTP_BODY" | json_value receipt.receipt_id)"
    ballot_id="$(printf '%s' "$HTTP_BODY" | json_value receipt.ballot_submission_id)"
    [[ -n "$receipt_id" && -n "$ballot_id" ]] || fail "Jury ballot $index returned incomplete receipt evidence"

    if (( i == 3 )); then
      rpc_request "$hod_token" v3_submit_jury_ballot "$submit_body"
      expect_success "exact Jury operation replay"
      expect_json "exact Jury replay receipt stable" receipt.receipt_id "$receipt_id"
      expect_json "exact Jury replay ballot stable" receipt.ballot_submission_id "$ballot_id"
      expect_json "exact Jury replay explicit" receipt.replayed true
      [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$show_id'::uuid and voter_country_id='$country_id'::uuid;")" == "1" ]] || fail "Jury replay duplicated the canonical ballot"
    fi

    rpc_request "$hod_token" v3_reconcile_jury_submission "{\"_operation_id\":\"$operation_id\"}"
    expect_success "Jury reconciliation $index"
    expect_json "Jury reconciliation $index found" found true
    expect_json "Jury reconciliation $index receipt" receipt.receipt_id "$receipt_id"

    submitted_total=$((submitted_total + 1))
  done

  [[ "$submitted_total" == "64" ]] || fail "S14 Jury submitted $submitted_total ballots instead of 64"
  [[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where edition_id='$EDITION_ID'::uuid and show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and status='submitted';")" == "64" ]] || fail "canonical Jury submission count is not 64"
  [[ "$(db_scalar "select count(*) from public.jury_votes where edition_id='$EDITION_ID'::uuid and show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid);")" == "640" ]] || fail "canonical Jury score rows are not 64 complete ten-score ballots"
  [[ "$(db_scalar "select count(*) from public.voters v where v.edition_id='$EDITION_ID'::uuid and v.show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and not exists (select 1 from public.jury_ballot_submissions b where b.show_id=v.show_id and b.voter_country_id=v.country_id);")" == "2" ]] || fail "S14 Jury did not preserve exactly two missing ballots"
  [[ "$(db_scalar "select count(*) from (select show_id,voter_country_id,count(*) from public.jury_ballot_submissions where edition_id='$EDITION_ID'::uuid group by show_id,voter_country_id having count(*)>1) duplicates;")" == "0" ]] || fail "duplicate final Jury ballot detected"
  [[ "$(db_scalar "select count(*) from public.jury_votes where edition_id='$EDITION_ID'::uuid and voter_country_id=receiving_country_id;")" == "0" ]] || fail "own-country Jury vote survived canonical validation"
  [[ "$(db_scalar "select count(*) from private.v3_jury_drafts d join public.country_accounts ca on ca.user_id=d.user_id join public.countries c on c.id=ca.country_id where c.region='S14';")" == "0" ]] || fail "submitted S14 Jury drafts were not reconciled away"
  log "S14_INVARIANT_JURY_COMPLETE"

  rpc_request "$ORGANIZER_A_TOKEN" admin_set_jury_voting_status "{\"_show_id\":\"$SEMI_TWO_ID\",\"_status\":\"closed\"}"
  expect_success "close semi-final 2 Jury"
  expect_json "semi-final 2 Jury closed" status closed

  log "S14_STAGE_6_JURY_COMPLETE"
}
