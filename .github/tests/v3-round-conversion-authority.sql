begin;
insert into auth.users(id,aud,role,email) values('29043157-0000-4000-8000-000000000001','authenticated','authenticated','combined@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values('29043157-0000-4000-8000-000000000011','29043157-0000-4000-8000-000000000001',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29043157-0000-4000-8000-000000000001','organizer');
insert into public.editions(id,name,slug,edition_number,status) values('29043157-0000-4000-8000-000000000021','Combined proof','combined-proof-29043157',29043157,'active');
insert into public.shows(id,edition_id,name,kind,sort_order) values('29043157-0000-4000-8000-000000000031','29043157-0000-4000-8000-000000000021','Combined proof','special',1);
insert into public.countries(id,name,short_code) values('29043157-0000-4000-8000-000000000041','Combined country','QX');
insert into public.participants(edition_id,show_id,country_id,running_order) values('29043157-0000-4000-8000-000000000021','29043157-0000-4000-8000-000000000031','29043157-0000-4000-8000-000000000041',1);
insert into televoting.editions(id,name) values('29043157-0000-4000-8000-000000000051','Combined proof');
insert into televoting.rounds(id,edition_id,name) values('29043157-0000-4000-8000-000000000061','29043157-0000-4000-8000-000000000051','Combined round');
insert into public.televoting_round_bindings(remote_round_id,remote_edition_id,edition_id,show_id) values('29043157-0000-4000-8000-000000000061','29043157-0000-4000-8000-000000000051','29043157-0000-4000-8000-000000000021','29043157-0000-4000-8000-000000000031');
insert into televoting.televote_aggregations(id,name,updated_at,calculation_version) values('29043157-0000-4000-8000-000000000071','Combined authority','2026-10-29T00:00:00Z',1);
insert into televoting.televote_aggregation_sources(aggregation_id,source_round_id,source_name) values('29043157-0000-4000-8000-000000000071','29043157-0000-4000-8000-000000000061','Canonical source');
select set_config('test.combined_version',(select command_version::text from televoting.televote_aggregations where id='29043157-0000-4000-8000-000000000071'),true);
insert into televoting.televote_aggregations(id,name,status) values('29043157-0000-4000-8000-000000000072','Frozen settings','locked');
insert into televoting.televote_aggregations(id,name) values('29043157-0000-4000-8000-000000000073','Source authority');
update televoting.rounds set status='closed',televote_engine_version='rank-weighted-v1' where id='29043157-0000-4000-8000-000000000061';
insert into televoting.round_entries(round_id,entry_type,entry_key,custom_name,display_order) values('29043157-0000-4000-8000-000000000061','custom','QX','Calculation entry',1);
select set_config('test.round.version',(select version::text from public.studio2_televote_round_versions where round_id='29043157-0000-4000-8000-000000000061'),true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29043157-0000-4000-8000-000000000001","session_id":"29043157-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $test$
declare a jsonb; b jsonb; v bigint:=current_setting('test.round.version')::bigint;
begin
 a:=televoting.v3_configure_round('29043157-0000-4000-8000-000000000061','conversion_config','{"total_points_to_distribute":100}',v,'29043157-0000-4000-8000-000000000601','convert:config');
 b:=televoting.v3_configure_round('29043157-0000-4000-8000-000000000061','conversion_config','{"total_points_to_distribute":100}',v,'29043157-0000-4000-8000-000000000601','convert:config');
 if a is distinct from b then raise exception 'Config replay changed'; end if;
 begin
  perform televoting.v3_configure_round('29043157-0000-4000-8000-000000000061','conversion_config','{"total_points_to_distribute":101}',v,'29043157-0000-4000-8000-000000000601','convert:config');
  raise exception 'Changed request accepted';
 exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin
  perform televoting.v3_configure_round('29043157-0000-4000-8000-000000000061','conversion_config','{}',v,'29043157-0000-4000-8000-000000000602','convert:stale');
  raise exception 'Stale conversion accepted';
 exception when serialization_failure then null; end;
end $test$;
reset role;
-- Complete rows are application-calculated proposals. SQL controls identity,
-- versions, participants, engine, totals, state hash and lifecycle publication.
do $calculation$
declare v bigint; p jsonb; a jsonb; b jsonb;
begin
 select version into v from public.studio2_televote_round_versions where round_id='29043157-0000-4000-8000-000000000061';
 p:=jsonb_build_object('inputHash',private.v3_conversion_input_hash('29043157-0000-4000-8000-000000000061'),'influenceRows','[]'::jsonb,'rows','[{"country_code":"QX","engine_version":"rank-weighted-v1","original_votes":10,"original_voters":1,"original_rank":1,"participant_count":1,"rank_base":3,"rank_exponent":1.33,"rank_factor":1,"weighted_score":10,"exact_points":100,"floored_points":100,"decimal_remainder":0,"remainder_bonus":0,"final_points":100,"total_points_to_distribute":100,"calculation_config":{},"calculation_version":999}]'::jsonb);
 a:=televoting.v3_configure_round('29043157-0000-4000-8000-000000000061','conversion_calculation',p,v,'29043157-0000-4000-8000-000000000603','convert:calculate');
 b:=televoting.v3_recover_conversion_calculation('29043157-0000-4000-8000-000000000061',v,'29043157-0000-4000-8000-000000000603');
 if a is distinct from b or (a->>'version')::integer<>1 or (select calculation_version from televoting.round_results where round_id='29043157-0000-4000-8000-000000000061')<>1 then raise exception 'Conversion recovery/version control failed'; end if;
 if (public.studio2_reconcile_operation('29043157-0000-4000-8000-000000000603')->'result') is distinct from a then raise exception 'Readback mismatch'; end if;
 a:=televoting.v3_configure_round('29043157-0000-4000-8000-000000000061','conversion_status','{"status":"locked"}',(a->>'roundVersion')::bigint,'29043157-0000-4000-8000-000000000606','convert:lock');
 perform televoting.v3_configure_round('29043157-0000-4000-8000-000000000061','conversion_status','{"status":"published"}',(a->>'roundVersion')::bigint,'29043157-0000-4000-8000-000000000604','convert:publish');
 begin
  perform televoting.v3_configure_round('29043157-0000-4000-8000-000000000061','conversion_config','{}',(select version from public.studio2_televote_round_versions where round_id='29043157-0000-4000-8000-000000000061'),'29043157-0000-4000-8000-000000000605','convert:frozen');
  raise exception 'Published config changed';
 exception when check_violation then null; end;
 if (select count(*) from televoting.admin_audit_log where target_id='29043157-0000-4000-8000-000000000061' and action='conversion_calculation')<>1 or (select count(*) from public.integration_events where remote_id='29043157-0000-4000-8000-000000000061' and event_type='round.conversion_calculation')<>1 then raise exception 'Duplicate consequences'; end if;
end $calculation$;
delete from auth.sessions where id='29043157-0000-4000-8000-000000000011';
set local role authenticated;
do $denied$ begin
 begin perform televoting.v3_recover_conversion_calculation('29043157-0000-4000-8000-000000000061',1,'29043157-0000-4000-8000-000000000603'); raise exception 'Revoked recovery allowed'; exception when insufficient_privilege then null; end;
end $denied$;
rollback;
