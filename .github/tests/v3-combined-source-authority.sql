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
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29043157-0000-4000-8000-000000000001","session_id":"29043157-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $test$
declare a jsonb; b jsonb; v bigint;
begin
 a:=televoting.v3_manage_combined_sources('29043157-0000-4000-8000-000000000073','participants','{"participants":["QX"]}',1,'29043157-0000-4000-8000-000000000501','combined:source:exact');
 b:=televoting.v3_manage_combined_sources('29043157-0000-4000-8000-000000000073','participants','{"participants":["QX"]}',1,'29043157-0000-4000-8000-000000000501','combined:source:exact');
 if a is distinct from b or (a->>'version')::bigint<>2 then raise exception 'Source replay changed receipt/version'; end if;
 if (public.studio2_reconcile_operation('29043157-0000-4000-8000-000000000501')->'result') is distinct from a then raise exception 'Source readback lost'; end if;
 begin
  perform televoting.v3_manage_combined_sources('29043157-0000-4000-8000-000000000073','participants','{"participants":[]}',1,'29043157-0000-4000-8000-000000000501','combined:source:exact');
  raise exception 'Changed request accepted';
 exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin
  perform televoting.v3_manage_combined_sources('29043157-0000-4000-8000-000000000073','participants','{"participants":[]}',1,'29043157-0000-4000-8000-000000000502','combined:source:stale');
  raise exception 'Stale source edit accepted';
 exception when serialization_failure then null; end;
 begin
  perform televoting.v3_manage_combined_sources('29043157-0000-4000-8000-000000000072','participants','{"participants":[]}',1,'29043157-0000-4000-8000-000000000503','combined:source:frozen');
  raise exception 'Frozen input edited';
 exception when check_violation then null; end;
end $test$;
reset role;
do $audit$
begin
 if (select count(*) from public.integration_events where remote_id='29043157-0000-4000-8000-000000000073' and event_type='combined.inputs_changed')<>1 then raise exception 'Duplicate source event'; end if;
end $audit$;
delete from auth.sessions where id='29043157-0000-4000-8000-000000000011';
set local role authenticated;
do $revoked$
begin
 begin
  perform televoting.v3_manage_combined_sources('29043157-0000-4000-8000-000000000073','participants','{"participants":["QX"]}',1,'29043157-0000-4000-8000-000000000501','combined:source:exact');
  raise exception 'Revoked session replayed source edit';
 exception when insufficient_privilege then if sqlerrm<>'SESSION_REVOKED' then raise; end if; end;
end $revoked$;
rollback;
