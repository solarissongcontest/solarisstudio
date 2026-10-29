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
insert into televoting.televote_aggregations(id,edition_id,name,updated_at,calculation_version) values('29043157-0000-4000-8000-000000000071','29043157-0000-4000-8000-000000000051','Combined authority','2026-10-29T00:00:00Z',1);
insert into televoting.televote_aggregation_sources(aggregation_id,source_round_id,source_name) values('29043157-0000-4000-8000-000000000071','29043157-0000-4000-8000-000000000061','Canonical source');
insert into televoting.external_score_entries(source_id,country_code,value) select id,'QX',12 from televoting.televote_aggregation_sources where aggregation_id='29043157-0000-4000-8000-000000000071';
insert into televoting.televote_aggregation_participants(aggregation_id,country_code) values('29043157-0000-4000-8000-000000000071','QX');
insert into televoting.combined_televote_results(aggregation_id,country_code) values('29043157-0000-4000-8000-000000000071','QX');
insert into televoting.combined_televote_component_results(aggregation_id,component_id,country_code) select aggregation_id,id,'QX' from televoting.televote_aggregation_sources where aggregation_id='29043157-0000-4000-8000-000000000071';
insert into televoting.televote_aggregations(id,name,status) values('29043157-0000-4000-8000-000000000072','Published immutable Combined','published');
select set_config('test.combined_version',(select command_version::text from televoting.televote_aggregations where id='29043157-0000-4000-8000-000000000071'),true);
create function pg_temp.reject_combined_deletion_audit() returns trigger language plpgsql as $fault$
begin if new.event_type='combined.deleted' and current_setting('test.fail_combined_delete_audit',true)='true' then raise exception 'COMBINED_AUDIT_UNAVAILABLE' using errcode='P0999'; end if; return new; end $fault$;
create trigger rehearsal_combined_delete_audit before insert on public.integration_events for each row execute function pg_temp.reject_combined_deletion_audit();
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29043157-0000-4000-8000-000000000001","session_id":"29043157-0000-4000-8000-000000000011"}',true);
do $test$
declare a jsonb; b jsonb;
begin
 set local role authenticated;
 begin
  perform televoting.v3_delete_combined_aggregation('29043157-0000-4000-8000-000000000072',null,1,'29043157-0000-4000-8000-000000000301','combined:delete:published');
  raise exception 'Published aggregate deletion accepted';
 exception when check_violation then if sqlerrm<>'Published combined results cannot be deleted' then raise; end if; end;
 begin
  perform televoting.v3_delete_combined_aggregation('29043157-0000-4000-8000-000000000071','29043157-0000-4000-8000-000000000051',999,'29043157-0000-4000-8000-000000000302','combined:delete:stale');
  raise exception 'Stale aggregate deletion accepted';
 exception when serialization_failure then null; end;
 perform set_config('test.fail_combined_delete_audit','true',true);
 begin
  perform televoting.v3_delete_combined_aggregation('29043157-0000-4000-8000-000000000071','29043157-0000-4000-8000-000000000051',current_setting('test.combined_version')::bigint,'29043157-0000-4000-8000-000000000303','combined:delete:exact');
  raise exception 'Deletion committed without audit';
 exception when sqlstate 'P0999' then if sqlerrm<>'COMBINED_AUDIT_UNAVAILABLE' then raise; end if; end;
 reset role;
 if not exists(select 1 from televoting.televote_aggregations where id='29043157-0000-4000-8000-000000000071') or not exists(select 1 from televoting.combined_televote_results where aggregation_id='29043157-0000-4000-8000-000000000071') then raise exception 'Failed deletion left partial state'; end if;
 if exists(select 1 from public.studio2_operation_receipts where operation_id='29043157-0000-4000-8000-000000000303') then raise exception 'Failed deletion left false receipt'; end if;
 perform set_config('test.fail_combined_delete_audit','false',true);
 set local role authenticated;
 a:=televoting.v3_delete_combined_aggregation('29043157-0000-4000-8000-000000000071','29043157-0000-4000-8000-000000000051',current_setting('test.combined_version')::bigint,'29043157-0000-4000-8000-000000000303','combined:delete:exact');
 b:=televoting.v3_delete_combined_aggregation('29043157-0000-4000-8000-000000000071','29043157-0000-4000-8000-000000000051',current_setting('test.combined_version')::bigint,'29043157-0000-4000-8000-000000000303','combined:delete:exact');
 if a is distinct from b or (public.studio2_reconcile_operation('29043157-0000-4000-8000-000000000303')->'result') is distinct from a then raise exception 'Deleted aggregate exact retry/readback lost'; end if;
 begin
  perform televoting.v3_delete_combined_aggregation('29043157-0000-4000-8000-000000000071','29043157-0000-4000-8000-000000000051',999,'29043157-0000-4000-8000-000000000303','combined:delete:exact');
  raise exception 'Changed delete payload recovered receipt';
 exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 reset role;
end $test$;
do $audit$
declare t text; v_exists boolean;
begin
 foreach t in array array['televote_aggregation_participants','televote_aggregation_sources','combined_televote_results','combined_televote_component_results'] loop
  execute format('select exists(select 1 from televoting.%I where aggregation_id=$1)',t) into strict v_exists using '29043157-0000-4000-8000-000000000071'::uuid;
  if v_exists then raise exception 'Deletion left dependent state'; end if;
 end loop;
 if exists(select 1 from televoting.external_score_entries where country_code='QX') then raise exception 'Deletion left external source values'; end if;
 if (select count(*) from public.integration_events where remote_id='29043157-0000-4000-8000-000000000071' and event_type='combined.deleted')<>1 then raise exception 'Deletion audit lost/duplicated'; end if;
 if has_table_privilege('authenticated','televoting.televote_aggregations','DELETE,TRUNCATE') or has_table_privilege('service_role','televoting.televote_aggregations','DELETE,TRUNCATE') then raise exception 'Raw Combined delete authority survives'; end if;
end $audit$;
delete from auth.sessions where id='29043157-0000-4000-8000-000000000011';
set local role authenticated;
do $revoked$ begin
 begin
  perform televoting.v3_delete_combined_aggregation('29043157-0000-4000-8000-000000000071','29043157-0000-4000-8000-000000000051',current_setting('test.combined_version')::bigint,'29043157-0000-4000-8000-000000000303','combined:delete:exact');
  raise exception 'Revoked delete recovery accepted';
 exception when insufficient_privilege then if sqlerrm<>'SESSION_REVOKED' then raise; end if; end;
end $revoked$;
rollback;
