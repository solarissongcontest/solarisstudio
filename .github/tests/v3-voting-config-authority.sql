\set ON_ERROR_STOP on
begin;
-- Real existing trigger and canonical writer; browser does not supply ranks.
insert into public.televote_votes(edition_id,show_id,country_id,points) values
('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000011',30),
('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000012',10);
update public.shows set voting_config='{"weightedScoring":true,"weighting":{"jury":50,"televote":100},"tieBreak":["televote","jury"]}'::jsonb where id='51000000-0000-4000-8000-000000000002';
do $assert$ begin
 if not exists(select 1 from public.results where show_id='51000000-0000-4000-8000-000000000002' and country_id='51000000-0000-4000-8000-000000000011' and total_points=60 and final_rank=1) or not exists(select 1 from public.results where show_id='51000000-0000-4000-8000-000000000002' and country_id='51000000-0000-4000-8000-000000000012' and total_points=20 and final_rank=2) then raise exception 'Canonical voting-config trigger did not atomically update weighted totals/ranks'; end if;
end $assert$;
update public.shows set voting_config='{"weightedScoring":true,"weighting":{"jury":50,"televote":25},"tieBreak":["televote","jury"]}'::jsonb where id='51000000-0000-4000-8000-000000000002';
do $assert$ begin
 if not exists(select 1 from public.results where show_id='51000000-0000-4000-8000-000000000002' and country_id='51000000-0000-4000-8000-000000000011' and total_points=15 and final_rank=1) then raise exception 'Canonical weighting change did not replace previous values'; end if;
 if (select result_row_count from private.v3_result_versions where show_id='51000000-0000-4000-8000-000000000002' and version=1)<>5 then raise exception 'Configuration edit rewrote existing frozen evidence'; end if;
end $assert$;
set constraints all immediate;
rollback;
select 'PASS: voting configuration and reranking use the existing canonical SQL transaction';
