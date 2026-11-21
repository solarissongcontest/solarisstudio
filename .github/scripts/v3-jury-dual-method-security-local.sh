# Loaded by the existing loopback-only v3-jury-security-rehearsal.sh.
# Synthetic SSC22 topology, never the production edition or country IDs.
log "Dual-method SSC22-shaped acceptance in isolated local Supabase"
DUAL_SHOW='00000000-0000-4000-8000-00000000a722'
MANUAL_COUNTRY='00000000-0000-4000-8000-00000000c720'
# The earlier synthetic security ballot has completed. An edition permits
# only one open jury window, so close it before opening the new isolated show.
db_exec "update public.jury_voting_windows set status='closed' where show_id='$SHOW_ID';"
db_exec "
insert into public.countries(id,name,short_code)
select ('00000000-0000-4000-8000-'||lpad(to_hex(50976+n),12,'0'))::uuid,
'Synthetic Jury Country '||n,'Q'||lpad(n::text,2,'0')
from generate_series(0,17)n;
insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config)
values('$DUAL_SHOW','$EDITION_ID','SSC22 isolated semifinal','semi-final',2,false,
'{\"juryEnabled\":true,\"juryPoints\":[12,10,8,7,6,5,4,3,2,1],\"allowSelfVote\":false}'::jsonb);
insert into public.participants(edition_id,show_id,country_id,artist,song,running_order,participation_status)
values('$EDITION_ID','$DUAL_SHOW','$COUNTRY_A','Artist Account','Song Account',1,'confirmed');
insert into public.participants(edition_id,show_id,country_id,artist,song,running_order,participation_status)
select '$EDITION_ID','$DUAL_SHOW',
('00000000-0000-4000-8000-'||lpad(to_hex(50976+n),12,'0'))::uuid,
'Artist '||n,'Song '||n,n+2,
case when n=17 then 'withdrawn' else 'confirmed' end
from generate_series(0,17)n;
insert into public.voters(edition_id,show_id,country_id,name,sort_order)
values('$EDITION_ID','$DUAL_SHOW','$COUNTRY_A','Account Jury',1);
insert into public.voters(edition_id,show_id,country_id,name,sort_order)
select '$EDITION_ID','$DUAL_SHOW',
('00000000-0000-4000-8000-'||lpad(to_hex(50976+n),12,'0'))::uuid,
'Synthetic Jury '||n,n+2
from generate_series(0,17)n where n<>16;
insert into public.studio2_role_assignments(user_id,role_key,edition_id)
values('$USER_A_ID','organizer','$EDITION_ID') on conflict do nothing;
insert into public.jury_voting_windows(show_id,edition_id,status,opened_at,opened_by)
values('$DUAL_SHOW','$EDITION_ID','open',now(),'$USER_A_ID');
"
[[ "$(db_scalar "select count(*) from public.participants where show_id='$DUAL_SHOW'")" == 19 ]] || fail "19-participant SSC22 topology"
[[ "$(db_scalar "select count(*) from public.participants where show_id='$DUAL_SHOW' and participation_status='confirmed'")" == 18 ]] || fail "18-confirmed SSC22 topology"
[[ "$(db_scalar "select count(*) from public.voters where show_id='$DUAL_SHOW'")" == 18 ]] || fail "18-voter SSC22 roster"
[[ "$(db_scalar "select count(*) from public.country_accounts where country_id='$MANUAL_COUNTRY'")" == 0 ]] || fail "No-account country unexpectedly has an account"

# Account-first: original V3 preflight, accepted ballot and immutable receipt.
ACCOUNT_MAP="$(db_scalar "select jsonb_object_agg(('00000000-0000-4000-8000-'||lpad(to_hex(50976+n),12,'0'))::text,p) from (values(0,12),(1,10),(2,8),(3,7),(4,6),(5,5),(6,4),(7,3),(8,2),(9,1))s(n,p)")"
ACCOUNT_BALLOT="$(db_scalar "select jsonb_agg(jsonb_build_object('target_country_id',('00000000-0000-4000-8000-'||lpad(to_hex(50976+n),12,'0'))::text,'points',p) order by n) from (values(0,12),(1,10),(2,8),(3,7),(4,6),(5,5),(6,4),(7,3),(8,2),(9,1))s(n,p)")"
ACCOUNT_PREFLIGHT='00000000-0000-4000-8000-00000000f722'
ACCOUNT_OP='00000000-0000-4000-8000-00000000b722'
db_exec "insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,channel,canonical_edition_id,show_id,account_user_id,expires_at) values('$ACCOUNT_PREFLIGHT',null,'synthetic-jury-a','JSA','$ACCOUNT_MAP'::jsonb,'jury','$EDITION_ID','$DUAL_SHOW','$USER_A_ID',now()+interval '30 minutes');"
ACCOUNT_BODY="{\"_show_id\":\"$DUAL_SHOW\",\"_entries\":$ACCOUNT_BALLOT,\"_preflight_id\":\"$ACCOUNT_PREFLIGHT\",\"_operation_id\":\"$ACCOUNT_OP\"}"
rpc_request "$USER_A_TOKEN" v3_submit_jury_ballot "$ACCOUNT_BODY"
expect_success "SSC22 account ballot"
expect_json "account acceptance" ok true
ACCOUNT_BALLOT_ID="$(printf '%s' "$HTTP_BODY" | json_value receipt.ballot_submission_id)"
ACCOUNT_RECEIPT="$(printf '%s' "$HTTP_BODY" | json_value receipt.receipt_id)"
rpc_request "$USER_A_TOKEN" v3_submit_jury_ballot "$ACCOUNT_BODY"
expect_success "account idempotent replay"
expect_json "authoritative receipt stable" receipt.receipt_id "$ACCOUNT_RECEIPT"
expect_json "account replay" receipt.replayed true
rpc_request "$USER_A_TOKEN" v3_organizer_jury_score_apply "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$DUAL_SHOW\",\"p_voter_id\":null,\"p_voter_country_id\":\"$COUNTRY_A\",\"p_voter_entity_id\":null,\"p_receiving_country_id\":\"$MANUAL_COUNTRY\",\"p_receiving_entity_id\":null,\"p_points\":12,\"p_action\":\"assign\",\"p_expected_version\":0,\"p_operation_id\":\"00000000-0000-4000-8000-00000000b723\"}"
expect_failure "account-first manual overwrite denied"
[[ "$(db_scalar "select count(*) from public.jury_votes where show_id='$DUAL_SHOW' and voter_country_id='$COUNTRY_A' and ballot_submission_id='$ACCOUNT_BALLOT_ID'")" == 10 ]] || fail "Account evidence changed"
# DNV cannot rewrite an accepted account ballot, whether the status uses
# the country column or an aliasing show voter ID.
expect_db_failure "accepted account ballot cannot become did-not-vote" \
  "insert into public.jury_ballot_statuses(edition_id,show_id,voter_country_id,status) values('$EDITION_ID','$DUAL_SHOW','$COUNTRY_A','did_not_vote');"
ACCOUNT_VOTER="$(db_scalar "select id from public.voters where show_id='$DUAL_SHOW' and country_id='$COUNTRY_A' limit 1")"
expect_db_failure "voter-id alias cannot mark an accepted account ballot absent" \
  "insert into public.jury_ballot_statuses(edition_id,show_id,voter_id,status) values('$EDITION_ID','$DUAL_SHOW','$ACCOUNT_VOTER','did_not_vote');"
[[ "$(db_scalar "select count(*) from public.jury_ballot_statuses where show_id='$DUAL_SHOW' and (voter_country_id='$COUNTRY_A' or voter_id='$ACCOUNT_VOTER')")" == 0 ]] || fail "DNV status appeared after account ballot"

# No-account Organizer manual path, real RPC/roles/score scale, one point per
# operation and exactly ten score allocations before acceptance.
rpc_request "$USER_A_TOKEN" v3_organizer_jury_score_preview "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$DUAL_SHOW\",\"p_voter_id\":null,\"p_voter_country_id\":\"$MANUAL_COUNTRY\",\"p_voter_entity_id\":null}"
expect_success "no-account country manual preview"
expect_json "new manual revision" expectedVersion 0
rpc_request "$USER_B_TOKEN" v3_organizer_jury_score_apply "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$DUAL_SHOW\",\"p_voter_id\":null,\"p_voter_country_id\":\"$MANUAL_COUNTRY\",\"p_voter_entity_id\":null,\"p_receiving_country_id\":\"$COUNTRY_A\",\"p_receiving_entity_id\":null,\"p_points\":12,\"p_action\":\"assign\",\"p_expected_version\":0,\"p_operation_id\":\"00000000-0000-4000-8000-00000000b724\"}"
expect_failure "non-Organizer manual writer denied"
rpc_request "$USER_A_TOKEN" v3_organizer_jury_score_apply "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$DUAL_SHOW\",\"p_voter_id\":null,\"p_voter_country_id\":\"$MANUAL_COUNTRY\",\"p_voter_entity_id\":null,\"p_receiving_country_id\":\"$COUNTRY_A\",\"p_receiving_entity_id\":null,\"p_points\":9,\"p_action\":\"assign\",\"p_expected_version\":0,\"p_operation_id\":\"00000000-0000-4000-8000-00000000b725\"}"
expect_failure "invalid SSC22 score denied"
rpc_request "$USER_A_TOKEN" v3_organizer_jury_score_apply "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$DUAL_SHOW\",\"p_voter_id\":null,\"p_voter_country_id\":\"$MANUAL_COUNTRY\",\"p_voter_entity_id\":null,\"p_receiving_country_id\":\"$MANUAL_COUNTRY\",\"p_receiving_entity_id\":null,\"p_points\":12,\"p_action\":\"assign\",\"p_expected_version\":0,\"p_operation_id\":\"00000000-0000-4000-8000-00000000b726\"}"
expect_failure "self-vote denied"
index=0
last_body=''
for point in 12 10 8 7 6 5 4 3 2 1; do
  recipient="$(db_scalar "select ('00000000-0000-4000-8000-'||lpad(to_hex(50977+$index),12,'0'))::text")"
  operation="$(printf '00000000-0000-4000-8000-%012d' "$((9000+index))")"
  last_body="{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$DUAL_SHOW\",\"p_voter_id\":null,\"p_voter_country_id\":\"$MANUAL_COUNTRY\",\"p_voter_entity_id\":null,\"p_receiving_country_id\":\"$recipient\",\"p_receiving_entity_id\":null,\"p_points\":$point,\"p_action\":\"assign\",\"p_expected_version\":$index,\"p_operation_id\":\"$operation\"}"
  rpc_request "$USER_A_TOKEN" v3_organizer_jury_score_apply "$last_body"
  expect_success "Organizer manual score $point"
  if [[ "$index" -lt 9 ]]; then
    expect_json "manual draft remains partial" complete false
    [[ "$(db_scalar "select count(*) from public.jury_votes where show_id='$DUAL_SHOW' and voter_country_id='$MANUAL_COUNTRY'")" == 0 ]] || fail "Partial manual scores counted"
    if [[ "$index" -eq 0 ]]; then
      expect_db_failure "partial Organizer draft cannot become did-not-vote" \
        "insert into public.jury_ballot_statuses(edition_id,show_id,voter_country_id,status) values('$EDITION_ID','$DUAL_SHOW','$MANUAL_COUNTRY','did_not_vote');"
    fi
  else
    expect_json "manual ten-point scale complete" complete true
  fi
  index=$((index+1))
done
[[ "$(db_scalar "select count(*) from public.jury_votes where show_id='$DUAL_SHOW' and voter_country_id='$MANUAL_COUNTRY'")" == 10 ]] || fail "Manual completion count"
[[ "$(db_scalar "select sum(points) from public.jury_votes where show_id='$DUAL_SHOW' and voter_country_id='$MANUAL_COUNTRY'")" == 58 ]] || fail "Manual point total"
expect_db_failure "accepted Organizer manual ballot cannot become did-not-vote" \
  "insert into public.jury_ballot_statuses(edition_id,show_id,voter_country_id,status) values('$EDITION_ID','$DUAL_SHOW','$MANUAL_COUNTRY','did_not_vote');"
[[ "$(db_scalar "select count(*) from public.jury_ballot_statuses where show_id='$DUAL_SHOW' and voter_country_id='$MANUAL_COUNTRY'")" == 0 ]] || fail "DNV status appeared after manual ballot"
[[ "$(db_scalar "select count(*) from public.jury_votes where show_id='$DUAL_SHOW' and voter_country_id='$MANUAL_COUNTRY'")" == 10 ]] || fail "DNV attempt mutated accepted manual scores"
rpc_request "$USER_A_TOKEN" v3_organizer_jury_score_apply "$last_body"
expect_success "manual lost-response replay"
expect_json "manual replay stable" replayed true
[[ "$(db_scalar "select count(*) from private.v3_jury_manual_operations where show_id='$DUAL_SHOW' and voter_identity='$MANUAL_COUNTRY'")" == 10 ]] || fail "Manual replay duplicated operations"

# Correct completed manual ballot with a reason; stale revision rejected.
NEW_RECIPIENT="$(db_scalar "select ('00000000-0000-4000-8000-'||lpad(to_hex(50988),12,'0'))::text")"
CORRECT_BODY="{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$DUAL_SHOW\",\"p_voter_id\":null,\"p_voter_country_id\":\"$MANUAL_COUNTRY\",\"p_voter_entity_id\":null,\"p_receiving_country_id\":\"$NEW_RECIPIENT\",\"p_receiving_entity_id\":null,\"p_points\":12,\"p_action\":\"assign\",\"p_expected_version\":10,\"p_operation_id\":\"00000000-0000-4000-8000-00000000b729\",\"p_reason\":\"Synthetic review correction\"}"
rpc_request "$USER_A_TOKEN" v3_organizer_jury_score_apply "$CORRECT_BODY"
expect_success "versioned complete-ballot correction"
expect_json "correction stays complete" complete true
[[ "$(db_scalar "select count(*) from public.jury_votes where show_id='$DUAL_SHOW' and voter_country_id='$MANUAL_COUNTRY' and receiving_country_id='$NEW_RECIPIENT' and points=12")" == 1 ]] || fail "Corrected point not stored"
[[ "$(db_scalar "select count(*) from public.jury_votes where show_id='$DUAL_SHOW' and voter_country_id='$MANUAL_COUNTRY'")" == 10 ]] || fail "Correction double-counted ballot"
rpc_request "$USER_A_TOKEN" v3_organizer_jury_score_apply "$CORRECT_BODY"
expect_success "correction idempotent replay"
expect_json "correction replay stable" replayed true

# Synthetic no-account delegate gains a LOCAL account after manual submission
# solely to validate manual-first conflict; never create real SSC22 accounts.
create_user v3-jury-synthetic-late@solaris.invalid
LATE_USER="$LAST_USER_ID"
sign_in v3-jury-synthetic-late@solaris.invalid
LATE_TOKEN="$LAST_TOKEN"
db_exec "insert into public.country_accounts(user_id,country_id,status) values('$LATE_USER','$MANUAL_COUNTRY','active');"
LATE_PREFLIGHT='00000000-0000-4000-8000-00000000f729'
LATE_MAP="$(db_scalar "select jsonb_object_agg(('00000000-0000-4000-8000-'||lpad(to_hex(50977+n),12,'0'))::text,p) from (values(0,12),(1,10),(2,8),(3,7),(4,6),(5,5),(6,4),(7,3),(8,2),(9,1))s(n,p)")"
LATE_BALLOT="$(db_scalar "select jsonb_agg(jsonb_build_object('target_country_id',('00000000-0000-4000-8000-'||lpad(to_hex(50977+n),12,'0'))::text,'points',p) order by n) from (values(0,12),(1,10),(2,8),(3,7),(4,6),(5,5),(6,4),(7,3),(8,2),(9,1))s(n,p)")"
db_exec "insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,channel,canonical_edition_id,show_id,account_user_id,expires_at) values('$LATE_PREFLIGHT',null,'synthetic-late','Q00','$LATE_MAP'::jsonb,'jury','$EDITION_ID','$DUAL_SHOW','$LATE_USER',now()+interval '30 minutes');"
rpc_request "$LATE_TOKEN" v3_submit_jury_ballot "{\"_show_id\":\"$DUAL_SHOW\",\"_entries\":$LATE_BALLOT,\"_preflight_id\":\"$LATE_PREFLIGHT\",\"_operation_id\":\"00000000-0000-4000-8000-00000000b730\"}"
expect_failure "manual-first account conflict denied"
[[ "$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$DUAL_SHOW' and voter_country_id='$MANUAL_COUNTRY'")" == 0 ]] || fail "Account/manual conflict inserted duplicate submission"
[[ "$(db_scalar "select count(*) from public.jury_votes where show_id='$DUAL_SHOW' and voter_country_id='$MANUAL_COUNTRY'")" == 10 ]] || fail "Account conflict changed manual votes"

# Race the two official methods for one synthetic country using independent
# authenticated REST requests. Exactly one may commit. Neither retries nor
# caller-selected voter IDs can create a second accepted official ballot.
log "Racing account vs Organizer manual entry for one country on local Supabase"
RACE_COUNTRY="$(db_scalar "select ('00000000-0000-4000-8000-'||lpad(to_hex(50987),12,'0'))::text")"
create_user v3-jury-synthetic-race@solaris.invalid
RACE_USER_ID="$LAST_USER_ID"
sign_in v3-jury-synthetic-race@solaris.invalid
RACE_USER_TOKEN="$LAST_TOKEN"
db_exec "insert into public.country_accounts(user_id,country_id,status) values('$RACE_USER_ID','$RACE_COUNTRY','active');"
RACE_PREFLIGHT='00000000-0000-4000-8000-00000000f731'
db_exec "insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,channel,canonical_edition_id,show_id,account_user_id,expires_at) values('$RACE_PREFLIGHT',null,'synthetic-jury-race','Q11','$ACCOUNT_MAP'::jsonb,'jury','$EDITION_ID','$DUAL_SHOW','$RACE_USER_ID',now()+interval '30 minutes');"
RACE_ACCOUNT_BODY="{\"_show_id\":\"$DUAL_SHOW\",\"_entries\":$ACCOUNT_BALLOT,\"_preflight_id\":\"$RACE_PREFLIGHT\",\"_operation_id\":\"00000000-0000-4000-8000-00000000b731\"}"
RACE_MANUAL_BODY="{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$DUAL_SHOW\",\"p_voter_id\":null,\"p_voter_country_id\":\"$RACE_COUNTRY\",\"p_voter_entity_id\":null,\"p_receiving_country_id\":\"$MANUAL_COUNTRY\",\"p_receiving_entity_id\":null,\"p_points\":12,\"p_action\":\"assign\",\"p_expected_version\":0,\"p_operation_id\":\"00000000-0000-4000-8000-00000000b732\"}"
RACE_OUT="$(mktemp -d)"
(
  rpc_request "$RACE_USER_TOKEN" v3_submit_jury_ballot "$RACE_ACCOUNT_BODY"
  printf '%s' "$HTTP_STATUS" > "$RACE_OUT/account.status"
  printf '%s' "$HTTP_BODY" > "$RACE_OUT/account.body"
) &
race_account_pid=$!
(
  rpc_request "$USER_A_TOKEN" v3_organizer_jury_score_apply "$RACE_MANUAL_BODY"
  printf '%s' "$HTTP_STATUS" > "$RACE_OUT/manual.status"
  printf '%s' "$HTTP_BODY" > "$RACE_OUT/manual.body"
) &
race_manual_pid=$!
wait "$race_account_pid"
wait "$race_manual_pid"
account_status="$(cat "$RACE_OUT/account.status")"
manual_status="$(cat "$RACE_OUT/manual.status")"
account_ok=0; manual_ok=0
(( account_status>=200 && account_status<300 )) && account_ok=1 || true
(( manual_status>=200 && manual_status<300 )) && manual_ok=1 || true
if (( account_ok+manual_ok!=1 )); then
  fail "Dual-method same-country race outcome is unsafe: account $account_status $(cat "$RACE_OUT/account.body"); manual $manual_status $(cat "$RACE_OUT/manual.body")"
fi
race_account_rows="$(db_scalar "select count(*) from public.jury_ballot_submissions where show_id='$DUAL_SHOW' and voter_country_id='$RACE_COUNTRY'")"
race_manual_rows="$(db_scalar "select count(*) from private.v3_jury_manual_scores where show_id='$DUAL_SHOW' and voter_identity='$RACE_COUNTRY'")"
race_official_rows="$(db_scalar "select count(*) from public.jury_votes where show_id='$DUAL_SHOW' and voter_country_id='$RACE_COUNTRY'")"
if (( account_ok==1 )); then
  [[ "$race_account_rows" == 1 && "$race_manual_rows" == 0 && "$race_official_rows" == 10 ]] ||
    fail "Account won race but Organizer draft or official ballot was inconsistent"
else
  [[ "$race_account_rows" == 0 && "$race_manual_rows" == 1 && "$race_official_rows" == 0 ]] ||
    fail "Organizer won race but second account ballot leaked into canonical results"
fi
rm -rf "$RACE_OUT"
log "PASS: shared lock yields one winner for simultaneous country-account and Organizer commands"

log "PASS: local SSC22-shaped account/manual authority, no-account entry, full scale, correction, receipt and negative tests"
