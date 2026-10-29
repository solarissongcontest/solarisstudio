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
-- Optional boundary suite reuses the same fixture and all existing assertions.
-- It obtains fresh authentication from local GoTrue, never fabricates R3 state.
\if :{?handoff_claims}
select set_config('request.jwt.claims', :'handoff_claims', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (:'handoff_claims'::jsonb->>'sub'), true);
insert into public.studio2_role_assignments(user_id,role_key,edition_id,expires_at,assigned_by)
values (auth.uid(),'organizer',null,null,null)
on conflict on constraint studio2_role_assignments_scope_unique do nothing;

do $handoff$
declare
 v_show uuid;
 v_version bigint;
 v_preview jsonb;
 v_operation uuid;
 v_config jsonb := '{"results":true,"participants":true,"qualifiers":true}'::jsonb;
begin
 for v_show in select unnest(array['26000000-0000-4000-8000-000000000911'::uuid,'26000000-0000-4000-8000-000000000912'::uuid]) loop
   select calculation_version into strict v_version from public.studio2_result_operations where show_id=v_show;
   perform public.studio2_execute_result_operation(v_show,'review','Handoff review current Results',gen_random_uuid(),v_version);
   perform public.studio2_execute_result_operation(v_show,'lock','Handoff lock current Results',gen_random_uuid(),v_version);
   perform public.studio2_execute_result_operation(v_show,'mark_reveal_ready','Handoff approve current Results',gen_random_uuid(),v_version);
   if not exists(select 1 from public.studio2_result_operations where show_id=v_show
     and calculation_version=v_version and reviewed_version=v_version and locked_version=v_version and reveal_ready_version=v_version)
     or not exists(select 1 from private.v3_result_versions where show_id=v_show and version=v_version and result_row_count=11) then
     raise exception 'Stage 8 handoff lacks exact finalized immutable Results';
   end if;
   v_preview := public.studio2_show_publication_change_preview(v_show,'public',v_config,null);
   v_operation := gen_random_uuid();
   perform public.studio2_apply_show_publication_change(v_show,'public',v_config,null,v_operation,'handoff-publish-'||v_show,(v_preview->>'expectedVersion')::bigint);
   if not exists(select 1 from public.studio2_show_publication_controls where show_id=v_show and state='public' and source_result_version=v_version) then
     raise exception 'Semi-final publication does not bind exact Stage 8 version';
   end if;
 end loop;
 -- Exact bridge predicate, now exercised after real publication as in S14.
 if (select count(*) from public.participants where edition_id='26000000-0000-4000-8000-000000000902'
   and show_id in ('26000000-0000-4000-8000-000000000911','26000000-0000-4000-8000-000000000912') and qualified is true)<>20
   or (select count(distinct country_id) from public.participants where edition_id='26000000-0000-4000-8000-000000000902'
   and show_id in ('26000000-0000-4000-8000-000000000911','26000000-0000-4000-8000-000000000912') and qualified is true)<>20 then
   raise exception 'Published Results handoff did not satisfy exact twenty-country bridge';
 end if;
end
$handoff$;

-- Same authenticated participant insertion used by Organizer addQualifiers.
-- Automatic finalist already exists separately and is never among these twenty.
set local role authenticated;
insert into public.participants(edition_id,show_id,country_id,contest_entity_id,artist,song,semi_final)
select p.edition_id,'26000000-0000-4000-8000-000000000913',p.country_id,p.contest_entity_id,p.artist,p.song,'grand-final'
from public.participants p
where p.edition_id='26000000-0000-4000-8000-000000000902'
  and p.show_id in ('26000000-0000-4000-8000-000000000911','26000000-0000-4000-8000-000000000912')
  and p.qualified is true and coalesce(p.participation_status,'confirmed')='confirmed';
reset role;

do $handoff$
declare
 v_edition uuid := '26000000-0000-4000-8000-000000000902';
 v_final uuid := '26000000-0000-4000-8000-000000000913';
 v_version bigint;
 v_preview jsonb;
 v_operation uuid;
 v_state text;
 v_history text;
 v_publication text;
 v_event uuid;
 v_config jsonb := '{"results":true,"participants":true}'::jsonb;
begin
 if (select count(*) from public.participants where show_id=v_final)<>21
    or (select count(distinct country_id) from public.participants where show_id=v_final)<>21 then
   raise exception 'Grand Final assembly did not preserve twenty qualifiers plus one separate automatic finalist';
 end if;
 select coalesce((select calculation_version from public.studio2_result_operations where show_id=v_final),0) into v_version;
 perform public.studio2_execute_result_operation(v_final,'calculate','Calculate assembled final handoff',gen_random_uuid(),v_version);
 select calculation_version into strict v_version from public.studio2_result_operations where show_id=v_final;
 perform public.studio2_execute_result_operation(v_final,'review','Review assembled final handoff',gen_random_uuid(),v_version);
 perform public.studio2_execute_result_operation(v_final,'lock','Lock assembled final handoff',gen_random_uuid(),v_version);
 perform public.studio2_execute_result_operation(v_final,'mark_reveal_ready','Approve assembled final handoff',gen_random_uuid(),v_version);
 v_preview := public.studio2_show_publication_change_preview(v_final,'public',v_config,null);
 v_operation := gen_random_uuid();
 perform public.studio2_apply_show_publication_change(v_final,'public',v_config,null,v_operation,'handoff-publish-final',(v_preview->>'expectedVersion')::bigint);
 if not exists(select 1 from public.studio2_show_publication_controls where show_id=v_final and source_result_version=v_version and state='public')
    or not private.v3_edition_final_results_ready(v_edition) then
   raise exception 'Grand Final publication did not establish exact canonical Archive readiness';
 end if;
 select md5(jsonb_agg(to_jsonb(v) order by show_id,version)::text) into v_history from private.v3_result_versions v where edition_id=v_edition;
 select md5(jsonb_agg(to_jsonb(c)-'updated_at' order by show_id)::text) into v_publication from public.studio2_show_publication_controls c where edition_id=v_edition;
 for v_state in select unnest(array['results','post_edition','archived']) loop
   select version into strict v_version from public.studio2_edition_runtime where edition_id=v_edition;
   v_operation := gen_random_uuid();
   perform public.studio2_transition_edition_v3(v_edition,v_state,'Focused canonical publication handoff',null,v_version,v_operation,'handoff-'||v_state);
   if public.studio2_reconcile_operation(v_operation)->>'status'<>'succeeded' then raise exception 'Handoff receipt could not be recovered by actor'; end if;
 end loop;
 if (select state from public.studio2_edition_runtime where edition_id=v_edition)<>'archived'
   or (select md5(jsonb_agg(to_jsonb(v) order by show_id,version)::text) from private.v3_result_versions v where edition_id=v_edition) is distinct from v_history
   or (select md5(jsonb_agg(to_jsonb(c)-'updated_at' order by show_id)::text) from public.studio2_show_publication_controls c where edition_id=v_edition) is distinct from v_publication then
   raise exception 'Archive handoff changed immutable Results or exact publication truth';
 end if;
 select id into strict v_event from private.v3_domain_events where operation_id=v_operation and event_type='edition.archived';
 perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 perform public.studio2_claim_domain_event_deliveries('edition.tasks','handoff-worker',100,60);
 perform public.studio2_process_edition_domain_event(v_event,'edition.tasks','handoff-worker');
 if not exists(select 1 from private.v3_domain_event_outbox where event_id=v_event and consumer_key='edition.tasks' and status='completed')
   or (select count(*) from private.v3_domain_event_consumer_receipts where event_id=v_event and consumer_key='edition.tasks')<>1 then
   raise exception 'Archived handoff lacks canonical composite-key outbox/consumer evidence';
 end if;
 raise notice 'PASS: Stage8 exact-version publication -> qualifiers -> final assembly -> final publication -> Archive -> composite evidence';
end
$handoff$;
\endif
rollback;
