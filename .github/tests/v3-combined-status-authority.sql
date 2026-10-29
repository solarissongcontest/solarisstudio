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
select set_config('test.combined_updated_at',(select command_version::text from televoting.televote_aggregations where id='29043157-0000-4000-8000-000000000071'),true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29043157-0000-4000-8000-000000000001","session_id":"29043157-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $test$
declare a jsonb; b jsonb;
begin
 begin
  perform televoting.v3_transition_combined_status('29043157-0000-4000-8000-000000000071','published',current_setting('test.combined_updated_at')::bigint,'29043157-0000-4000-8000-000000000201','combined:status:outdated');
  raise exception 'Outdated Combined result published';
 exception when check_violation then if sqlerrm<>'Recalculate the combined result before locking or publishing it' then raise; end if; end;
 a:=televoting.v3_transition_combined_status('29043157-0000-4000-8000-000000000071','calculated',current_setting('test.combined_updated_at')::bigint,'29043157-0000-4000-8000-000000000202','combined:status:calculate');
 b:=televoting.v3_transition_combined_status('29043157-0000-4000-8000-000000000071','calculated',current_setting('test.combined_updated_at')::bigint,'29043157-0000-4000-8000-000000000202','combined:status:calculate');
 perform televoting.v3_transition_combined_status('29043157-0000-4000-8000-000000000071','calculated',(select command_version from televoting.televote_aggregations where id='29043157-0000-4000-8000-000000000071'),'29043157-0000-4000-8000-000000000204','combined:status:converged');
 if a is distinct from b or a->>'status'<>'calculated' then raise exception 'Status receipt recovery diverged'; end if;
 begin
  perform televoting.v3_transition_combined_status('29043157-0000-4000-8000-000000000071','draft',current_setting('test.combined_updated_at')::bigint,'29043157-0000-4000-8000-000000000202','combined:status:calculate');
  raise exception 'Changed status payload replayed';
 exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin
  perform televoting.v3_transition_combined_status('29043157-0000-4000-8000-000000000071','draft',current_setting('test.combined_updated_at')::bigint,'29043157-0000-4000-8000-000000000203','combined:status:stale');
  raise exception 'Stale status overwrote newer state';
 exception when serialization_failure then null; end;
end $test$;
reset role;
do $audit$
begin
 if not exists(select 1 from pg_trigger where tgrelid='televoting.televote_aggregations'::regclass and tgname='v3_combined_command_version' and tgfoid='private.v3_combined_command_version()'::regprocedure and tgtype=19 and tgenabled='O') then raise exception 'Version guard attachment changed'; end if;
 if has_function_privilege('authenticated','private.v3_combined_command_version()','execute') or has_function_privilege('service_role','private.v3_combined_command_version()','execute') then raise exception 'Callable internal version guard'; end if;
 if not exists(select 1 from pg_proc where oid='private.v3_combined_command_version()'::regprocedure and prosecdef and proowner='postgres'::regrole and proconfig=array['search_path=pg_catalog']) then raise exception 'Unsafe version guard'; end if;
 if (select count(*) from public.integration_events where remote_id='29043157-0000-4000-8000-000000000071')<>1 then raise exception 'Status audit duplicated'; end if;
 if has_function_privilege('service_role','televoting.v3_transition_combined_status(uuid,text,bigint,uuid,text)','execute') then raise exception 'Service transport may change status'; end if;
end $audit$;
rollback;
