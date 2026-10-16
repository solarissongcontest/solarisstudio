#!/usr/bin/env bash
set -euo pipefail

S14_FINAL_TELEVOTE_ROUND_ID='14000000-0000-4000-8000-000000000034'

prepare_s14_grand_final_from_qualifiers() {
  log "Grand-final leg: promote canonical semi-final qualifiers and prepare final voting sources"

  sign_in 's14-organizer-a@solaris.invalid'
  ORGANIZER_A_TOKEN="$LAST_TOKEN"

  # Qualification is not a QA choice. The canonical result-rank trigger must
  # already have marked exactly the configured top ten from each semi-final.
  [[ "$(db_scalar "select count(*) from public.participants where edition_id='$EDITION_ID'::uuid and show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and qualified is true;")" == "20" ]] || fail "grand-final preparation requires exactly 20 canonical semi-final qualifiers"
  [[ "$(db_scalar "select count(*) from (select show_id,count(*) c from public.participants where edition_id='$EDITION_ID'::uuid and show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and qualified is true group by show_id having count(*)=10) q;")" == "2" ]] || fail "grand-final preparation requires ten canonical qualifiers from each semi-final"
  [[ "$(db_scalar "select count(*) from public.results r join public.participants p on p.show_id=r.show_id and p.country_id=r.country_id where r.edition_id='$EDITION_ID'::uuid and r.show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and p.qualified is true and r.final_rank between 1 and 10;")" == "20" ]] || fail "qualified participants are not backed by top-ten semi-final result truth"

  # Finalists are a new show appearance of already-qualified edition identities.
  # Preserve the canonical entry identity fields from the semi-final appearance;
  # do not manufacture a separate entry or mutate qualification truth.
  db_exec "delete from public.participants where show_id='$FINAL_ID'::uuid;"
  db_exec "
with qualified as (
  select distinct on (p.country_id)
    p.country_id,p.contest_entity_id,p.artist,p.song,p.participation_status,
    r.final_rank,p.show_id
  from public.participants p
  join public.results r on r.show_id=p.show_id and r.country_id=p.country_id
  where p.edition_id='$EDITION_ID'::uuid
    and p.show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid)
    and p.qualified is true
    and r.final_rank between 1 and 10
  order by p.country_id,r.final_rank,p.show_id
), ordered as (
  select *,row_number() over(order by show_id,final_rank,country_id) rn
  from qualified
)
insert into public.participants(
  id,edition_id,show_id,country_id,contest_entity_id,artist,song,
  running_order,running_order_allocation,participation_status,qualified
)
select
  ('14000000-0000-4002-8000-'||lpad(rn::text,12,'0'))::uuid,
  '$EDITION_ID'::uuid,'$FINAL_ID'::uuid,country_id,contest_entity_id,artist,song,
  null,null,coalesce(participation_status,'confirmed'),true
from ordered;
"

  [[ "$(db_scalar "select count(*) from public.participants where show_id='$FINAL_ID'::uuid;")" == "20" ]] || fail "grand final does not contain exactly 20 promoted qualifiers"
  [[ "$(db_scalar "select count(*) from public.participants f where f.show_id='$FINAL_ID'::uuid and not exists (select 1 from public.participants s where s.edition_id='$EDITION_ID'::uuid and s.show_id in ('$SEMI_ONE_ID'::uuid,'$SEMI_TWO_ID'::uuid) and s.country_id=f.country_id and s.qualified is true);")" == "0" ]] || fail "grand final contains a country without canonical qualified truth"

  allocation_json="$(db_scalar "
with ordered as (
  select id,row_number() over(order by country_id,id) rn
  from public.participants where show_id='$FINAL_ID'::uuid
)
select jsonb_agg(jsonb_build_object(
  'id',id,
  'allocation',case when rn%3=0 then 'producer_choice' when rn%2=0 then 'second_half' else 'first_half' end
) order by rn)::text from ordered;
")"
  rpc_request "$ORGANIZER_A_TOKEN" admin_set_show_allocations \
    "{\"_show_id\":\"$FINAL_ID\",\"_allocations\":$allocation_json}"
  expect_success "allocate grand-final running-order halves"

  final_order_json="$(db_scalar "select jsonb_agg(id order by country_id desc,id desc)::text from public.participants where show_id='$FINAL_ID'::uuid;")"
  rpc_request "$ORGANIZER_A_TOKEN" admin_set_show_running_order \
    "{\"_show_id\":\"$FINAL_ID\",\"_participant_ids\":$final_order_json}"
  expect_success "persist grand-final running order"
  db_exec "update public.shows set lineup_stage='running_order',updated_at=now() where id='$FINAL_ID'::uuid;"

  [[ "$(db_scalar "select count(*) from public.participants where show_id='$FINAL_ID'::uuid and running_order is not null and running_order_allocation is not null;")" == "20" ]] || fail "grand-final running-order preparation is incomplete"
  [[ "$(db_scalar "select count(distinct running_order) from public.participants where show_id='$FINAL_ID'::uuid;")" == "20" ]] || fail "grand-final running order is not unique"
  [[ "$(db_scalar "select min(running_order)||':'||max(running_order) from public.participants where show_id='$FINAL_ID'::uuid;")" == "1:20" ]] || fail "grand-final running order is not contiguous 1..20"

  # A final Jury roster contains all 66 original delegations. Eligibility then
  # remains explicit and deterministic even though only twenty countries are in
  # the final lineup.
  db_exec "delete from public.voters where show_id='$FINAL_ID'::uuid;"
  db_exec "
insert into public.voters(edition_id,show_id,country_id,name,sort_order)
select '$EDITION_ID'::uuid,'$FINAL_ID'::uuid,c.id,'S14 Final Jury '||lpad(row_number() over(order by c.id)::text,2,'0'),row_number() over(order by c.id)
from public.countries c
where c.region='S14'
order by c.id;
"
  [[ "$(db_scalar "select count(*) from public.voters where show_id='$FINAL_ID'::uuid;")" == "66" ]] || fail "grand-final Jury roster does not contain all 66 delegations"

  # Prepare a distinct final Televote round whose entry set is an exact projection
  # of the twenty finalist countries. Actual voting remains a later lifecycle step.
  db_exec "
insert into televoting.rounds(id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode)
values ('$S14_FINAL_TELEVOTE_ROUND_ID'::uuid,'$TV_EDITION_ID'::uuid,'S14 Grand Final Televote','draft',20,'countries','country_match')
on conflict (id) do update set
  name=excluded.name,status='draft',results_status='draft',calculation_version=0,
  total_points_to_distribute=20,participant_mode='countries',self_voting_mode='country_match';

delete from televoting.round_countries where round_id='$S14_FINAL_TELEVOTE_ROUND_ID'::uuid;
delete from televoting.round_entries where round_id='$S14_FINAL_TELEVOTE_ROUND_ID'::uuid;

insert into televoting.round_countries(round_id,country_code,display_order)
select '$S14_FINAL_TELEVOTE_ROUND_ID'::uuid,c.short_code,p.running_order
from public.participants p join public.countries c on c.id=p.country_id
where p.show_id='$FINAL_ID'::uuid order by p.running_order;

insert into televoting.round_entries(round_id,entry_type,entry_key,country_code,short_name,entry_code,display_order)
select '$S14_FINAL_TELEVOTE_ROUND_ID'::uuid,'country',c.short_code,c.short_code,
       'S14 Final '||c.short_code,c.short_code,p.running_order
from public.participants p join public.countries c on c.id=p.country_id
where p.show_id='$FINAL_ID'::uuid order by p.running_order;

insert into public.televoting_round_bindings(
  remote_round_id,remote_edition_id,edition_id,show_id,source_mode,last_synced_at,frozen_at,created_at,updated_at
) values (
  '$S14_FINAL_TELEVOTE_ROUND_ID','$TV_EDITION_ID','$EDITION_ID'::uuid,'$FINAL_ID'::uuid,'show',now(),null,now(),now()
)
on conflict (remote_round_id) do update set
  remote_edition_id=excluded.remote_edition_id,edition_id=excluded.edition_id,show_id=excluded.show_id,
  source_mode='show',last_synced_at=now(),frozen_at=null,updated_at=now();
"

  [[ "$(db_scalar "select count(*) from televoting.round_entries where round_id='$S14_FINAL_TELEVOTE_ROUND_ID'::uuid;")" == "20" ]] || fail "grand-final Televote round does not contain exactly 20 finalists"
  [[ "$(db_scalar "select count(*) from public.televoting_round_bindings where remote_round_id='$S14_FINAL_TELEVOTE_ROUND_ID' and show_id='$FINAL_ID'::uuid and source_mode='show';")" == "1" ]] || fail "grand-final Televote round is not bound to the canonical final show"

  log "S14_GRAND_FINAL_PREPARED_FROM_CANONICAL_QUALIFIERS"
}
