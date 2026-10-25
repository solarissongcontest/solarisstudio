-- Isolated local database only. Canonical operations and all fixtures roll back.
begin;
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('26000000-0000-4000-8000-000000000901','authenticated','authenticated','qualifiers@local.invalid',now(),now());
set local request.jwt.claim.sub='26000000-0000-4000-8000-000000000901';
set local request.jwt.claim.role='service_role';
set local request.jwt.claims='{"role":"service_role","sub":"26000000-0000-4000-8000-000000000901"}';
insert into public.countries(id,name,short_code)
select ('26000000-0000-4001-8000-'||lpad(i::text,12,'0'))::uuid,'Qualifier '||i,'Q'||lpad(i::text,2,'0')
from generate_series(1,24) i;
insert into public.countries(id,name,short_code)
values ('26000000-0000-4001-8000-000000000099','Automatic finalist','Q99');
insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('26000000-0000-4000-8000-000000000902','Qualifier regression',2026,'qualifier-regression',26902,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,voting_config)
values
 ('26000000-0000-4000-8000-000000000911','26000000-0000-4000-8000-000000000902','Semi 1','semi-final',1,false,'{"juryEnabled":false,"televoteEnabled":false,"qualifiers":10}'),
 ('26000000-0000-4000-8000-000000000912','26000000-0000-4000-8000-000000000902','Semi 2','semi-final',2,false,'{"juryEnabled":false,"televoteEnabled":false,"qualifiers":10}'),
 ('26000000-0000-4000-8000-000000000913','26000000-0000-4000-8000-000000000902','Final','grand-final',3,false,'{"juryEnabled":false,"televoteEnabled":false}');
insert into public.participants(edition_id,show_id,country_id,artist,song,running_order,participation_status)
select '26000000-0000-4000-8000-000000000902',
 case when i<=12 then '26000000-0000-4000-8000-000000000911'::uuid else '26000000-0000-4000-8000-000000000912'::uuid end,
 ('26000000-0000-4001-8000-'||lpad(i::text,12,'0'))::uuid,'Artist '||i,'Song '||i,((i-1)%12)+1,'confirmed'
from generate_series(1,24) i;
-- A final-only automatic finalist is a separate path, never a semi qualifier.
insert into public.participants(edition_id,show_id,country_id,artist,song,running_order,participation_status,qualified)
values ('26000000-0000-4000-8000-000000000902','26000000-0000-4000-8000-000000000913',
 '26000000-0000-4001-8000-000000000099','Auto artist','Auto song',1,'confirmed',true);

do $test$
declare
 v_edition uuid := '26000000-0000-4000-8000-000000000902';
 v_one uuid := '26000000-0000-4000-8000-000000000911';
 v_two uuid := '26000000-0000-4000-8000-000000000912';
 v_withdrawn uuid := '26000000-0000-4001-8000-000000000004';
 v_disqualified uuid := '26000000-0000-4001-8000-000000000024';
 v_show uuid;
 v_country uuid;
 v_status text;
 v_base bigint;
 v_preview jsonb;
 v_history jsonb := '{}'::jsonb;
 v_versions jsonb := '{}'::jsonb;
 v_flags jsonb;
 v_count integer;
begin
 for v_show in select unnest(array[v_one,v_two]) loop
   select coalesce((select calculation_version from public.studio2_result_operations where show_id=v_show),0) into v_base;
   perform public.studio2_execute_result_operation(v_show,'calculate','Establish canonical qualifier baseline',gen_random_uuid(),v_base);
   select calculation_version into v_base from public.studio2_result_operations where show_id=v_show;
   v_versions := v_versions || jsonb_build_object(v_show::text,v_base);
   v_history := v_history || jsonb_build_object(v_show::text,(select result_rows from private.v3_result_versions where show_id=v_show and version=v_base));
 end loop;
 if not exists(select 1 from public.participants where show_id=v_one and country_id=v_withdrawn and qualified is true) then
   raise exception 'Fixture did not establish the formerly qualified withdrawn country';
 end if;
 for v_country,v_status in values (v_withdrawn,'withdrawn'),(v_disqualified,'disqualified') loop
   v_preview := public.studio2_participation_status_change_preview(v_edition,v_country,null,v_status);
   perform public.studio2_apply_participation_status(v_edition,v_country,null,v_status,
     gen_random_uuid(),'qualifier-'||v_status,(v_preview->>'expectedVersion')::bigint);
 end loop;
 -- No qualification flags are manually patched. Recalculation must reconcile
 -- the missing ranked source for the withdrawn former qualifier itself.
 for v_show in select unnest(array[v_one,v_two]) loop
   v_base := (v_versions->>v_show::text)::bigint;
   perform public.studio2_execute_result_operation(v_show,'calculate','Reconcile qualifiers after participation changes',gen_random_uuid(),v_base);
   if (select result_rows from private.v3_result_versions where show_id=v_show and version=v_base)
       is distinct from v_history->v_show::text then
     raise exception 'Qualifier reconciliation changed immutable historical Results';
   end if;
   if (select count(*) from public.participants where show_id=v_show and qualified is true) <> 10 then
     raise exception 'Semi-final % does not have exactly ten canonical qualifiers',v_show;
   end if;
   if exists(select 1 from public.participants p left join public.results r on r.show_id=p.show_id and r.country_id=p.country_id
     where p.show_id=v_show and p.qualified is distinct from
       coalesce(coalesce(p.participation_status,'confirmed')='confirmed' and r.final_rank between 1 and 10,false)) then
     raise exception 'Qualification flags disagree with current eligible rank/cutoff truth';
   end if;
   if (select count(*) from public.results r join public.participants p on p.show_id=r.show_id and p.country_id=r.country_id
     where r.show_id=v_show and ((r.final_rank=10 and p.qualified is true) or (r.final_rank=11 and p.qualified is false))) <> 2 then
     raise exception 'Qualification boundary at ranks 10/11 is incorrect';
   end if;
 end loop;
 if (select count(*) from public.participants where show_id in(v_one,v_two) and qualified is true) <> 20
    or (select count(distinct country_id) from public.participants where show_id in(v_one,v_two) and qualified is true) <> 20 then
   raise exception 'Semi-final qualifier set is not exactly twenty distinct countries';
 end if;
 if exists(select 1 from public.participants where edition_id=v_edition and country_id in(v_withdrawn,v_disqualified) and qualified is true) then
   raise exception 'Withdrawn/disqualified qualification flags survived';
 end if;
 if not exists(select 1 from public.participants where edition_id=v_edition and country_id='26000000-0000-4001-8000-000000000099'
   and show_id='26000000-0000-4000-8000-000000000913' and qualified is true) then
   raise exception 'Final-only automatic finalist was changed';
 end if;
 select jsonb_agg(jsonb_build_array(id,qualified) order by id) into v_flags from public.participants where edition_id=v_edition;
 select count(*) into v_count from private.v3_result_versions where edition_id=v_edition;
 perform public.refresh_edition_qualifications(v_edition);
 perform public.refresh_edition_qualifications(v_edition);
 if (select jsonb_agg(jsonb_build_array(id,qualified) order by id) from public.participants where edition_id=v_edition) is distinct from v_flags
    or (select count(*) from private.v3_result_versions where edition_id=v_edition) <> v_count then
   raise exception 'Qualification derivation is not idempotent or changed immutable version history';
 end if;
 raise notice 'PASS: twenty distinct qualifiers, rank boundary, withdrawal/disqualification, automatic finalist separation, immutable history and idempotency';
end
$test$;
rollback;
