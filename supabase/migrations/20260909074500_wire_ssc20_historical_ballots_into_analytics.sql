with src_edition as (
  select id from televoting.editions where name='Solaris Song Contest 20' order by created_at limit 1
)
insert into televoting.rounds (
  edition_id,name,status,closed_at,total_points_to_distribute,rank_exponent,
  results_status,calculation_version,results_outdated,public_advanced_transparency,
  broadcast_display_mode,participant_mode,self_voting_mode,televote_engine_version
)
select
  src_edition.id,
  '[Historical analytics] SSC20 Grand Final detailed country voting',
  'closed'::televoting.round_status,
  now(),0,1.33,'locked',0,false,false,'converted','countries','country_match','historical-analytics-v1'
from src_edition
where not exists (
  select 1 from televoting.rounds r
  where r.edition_id=src_edition.id
    and r.name='[Historical analytics] SSC20 Grand Final detailed country voting'
);

with historical_round as (
  select id from televoting.rounds
  where name='[Historical analytics] SSC20 Grand Final detailed country voting'
    and edition_id=(select id from televoting.editions where name='Solaris Song Contest 20' order by created_at limit 1)
  order by created_at limit 1
)
delete from televoting.vote_submissions vs
using historical_round hr
where vs.round_id=hr.id and vs.is_historical=true;

with historical_round as (
  select id from televoting.rounds
  where name='[Historical analytics] SSC20 Grand Final detailed country voting'
    and edition_id=(select id from televoting.editions where name='Solaris Song Contest 20' order by created_at limit 1)
  order by created_at limit 1
)
delete from televoting.round_entries re
using historical_round hr
where re.round_id=hr.id;

with historical_round as (
  select id from televoting.rounds
  where name='[Historical analytics] SSC20 Grand Final detailed country voting'
    and edition_id=(select id from televoting.editions where name='Solaris Song Contest 20' order by created_at limit 1)
  order by created_at limit 1
), official_round as (
  select r.id
  from televoting.rounds r
  where r.edition_id=(select id from televoting.editions where name='Solaris Song Contest 20' order by created_at limit 1)
    and r.name='Grand Final'
  order by r.created_at
  limit 1
)
insert into televoting.round_entries (
  round_id,entry_type,entry_key,country_code,custom_name,short_name,entry_code,
  subtitle,image_url,description,display_order
)
select
  hr.id,re.entry_type,re.entry_key,re.country_code,re.custom_name,re.short_name,re.entry_code,
  re.subtitle,re.image_url,re.description,re.display_order
from televoting.round_entries re
cross join historical_round hr
cross join official_round official
where re.round_id=official.id;

with historical_round as (
  select id from televoting.rounds
  where name='[Historical analytics] SSC20 Grand Final detailed country voting'
    and edition_id=(select id from televoting.editions where name='Solaris Song Contest 20' order by created_at limit 1)
  order by created_at limit 1
), voters as (
  select distinct voter_country_code
  from televoting.historical_vote_observations
  where source_key='ssc20_grand_final_country_detailed_pdf_2026_09_09'
)
insert into televoting.vote_submissions (
  round_id,username,username_normalized,country_code,risk_score,status,is_vpn,moderator_note,is_historical
)
select
  hr.id,
  'Historical SSC20 ' || v.voter_country_code,
  'historical_ssc20_' || lower(v.voter_country_code),
  v.voter_country_code,
  0,'active',false,
  'Exact historical country-level ballot imported from organizer PDF for friend-voting analytics. AP excluded.',
  true
from voters v cross join historical_round hr;

with historical_round as (
  select id from televoting.rounds
  where name='[Historical analytics] SSC20 Grand Final detailed country voting'
    and edition_id=(select id from televoting.editions where name='Solaris Song Contest 20' order by created_at limit 1)
  order by created_at limit 1
)
insert into televoting.vote_entries (submission_id,target_country_code,points,is_historical)
select
  vs.id,
  h.target_country_code,
  h.score,
  true
from televoting.historical_vote_observations h
cross join historical_round hr
join televoting.vote_submissions vs
  on vs.round_id=hr.id
 and vs.country_code=h.voter_country_code
 and vs.is_historical=true
where h.source_key='ssc20_grand_final_country_detailed_pdf_2026_09_09'
  and h.score>0;

update televoting.legacy_import_metadata lim
set metadata = lim.metadata || jsonb_build_object(
  'friend_voting_enabled',true,
  'analytics_round_name','[Historical analytics] SSC20 Grand Final detailed country voting',
  'analytics_storage','televoting.vote_submissions + televoting.vote_entries with is_historical=true'
), imported_at=now()
where lim.import_key='ssc20_grand_final_detailed_televote_2026_09_09';
