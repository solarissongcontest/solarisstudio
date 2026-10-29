begin;
insert into auth.users(id,aud,role,email) values('29052600-0000-4000-8000-000000000001','authenticated','authenticated','combined-create@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values('29052600-0000-4000-8000-000000000011','29052600-0000-4000-8000-000000000001',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29052600-0000-4000-8000-000000000001','organizer');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29052600-0000-4000-8000-000000000001","session_id":"29052600-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $test$
declare a jsonb; b jsonb;
begin
 a:=televoting.v3_create_combined_aggregation(null,'Canonical new Combined',1000,1.33,'29052600-0000-4000-8000-000000000101','combined:create:exact');
 b:=televoting.v3_create_combined_aggregation(null,'Canonical new Combined',1000,1.33,'29052600-0000-4000-8000-000000000101','combined:create:exact');
 if a is distinct from b or a->>'id' is null then raise exception 'Creation response-loss retry changed identity'; end if;
 if (public.studio2_reconcile_operation('29052600-0000-4000-8000-000000000101')->'result') is distinct from a then raise exception 'Creation receipt readback diverged'; end if;
 begin
  perform televoting.v3_create_combined_aggregation(null,'Changed request',1000,1.33,'29052600-0000-4000-8000-000000000101','combined:create:exact');
  raise exception 'Changed creation payload accepted';
 exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 perform set_config('test.created_aggregation',a->>'id',true);
end $test$;
reset role;
do $authority$
declare r text; c text;
begin
 if not exists(select 1 from televoting.televote_aggregations where id=current_setting('test.created_aggregation')::uuid and name='Canonical new Combined' and combination_method='component_pool' and calculation_version=0 and command_version=1 and status='draft' and results_outdated and broadcast_display_mode='combined' and total_points_to_distribute=1000 and rank_exponent=1.33) then raise exception 'Canonical creation defaults diverged'; end if;
 if (select count(*) from public.integration_events where remote_id=current_setting('test.created_aggregation') and event_type='combined.created')<>1 then raise exception 'Creation audit duplicated'; end if;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(r,'televoting.televote_aggregations','INSERT') or has_any_column_privilege(r,'televoting.televote_aggregations','INSERT') then raise exception 'Raw Combined creation remains: %',r; end if;
 end loop;
 if has_function_privilege('service_role','televoting.v3_create_combined_aggregation(uuid,text,integer,numeric,uuid,text)','EXECUTE') then raise exception 'Service transport may create arbitrary Combined aggregates'; end if;
 set local role authenticated;
 begin
  insert into televoting.televote_aggregations(name) values('Forbidden direct creation');
  raise exception 'Direct aggregate INSERT accepted';
 exception when insufficient_privilege then if sqlerrm<>'permission denied for table televote_aggregations' then raise; end if; end;
 reset role;
end $authority$;
insert into auth.users(id,aud,role,email) values('29052600-0000-4000-8000-000000000002','authenticated','authenticated','combined-create-foreign@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values('29052600-0000-4000-8000-000000000012','29052600-0000-4000-8000-000000000002',now(),now());
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29052600-0000-4000-8000-000000000002","session_id":"29052600-0000-4000-8000-000000000012"}',true);
set local role authenticated;
do $foreign$ begin
 begin
  perform televoting.v3_create_combined_aggregation(null,'Foreign creation',1000,1.33,'29052600-0000-4000-8000-000000000102','combined:create:foreign');
  raise exception 'Unprivileged actor created aggregate';
 exception when insufficient_privilege then if sqlerrm<>'AUTHORIZATION' then raise; end if; end;
end $foreign$;
reset role;
delete from auth.sessions where id='29052600-0000-4000-8000-000000000011';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29052600-0000-4000-8000-000000000001","session_id":"29052600-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $revoked$ begin
 begin
  perform televoting.v3_create_combined_aggregation(null,'Canonical new Combined',1000,1.33,'29052600-0000-4000-8000-000000000101','combined:create:exact');
  raise exception 'Revoked actor recovered creation';
 exception when insufficient_privilege then if sqlerrm<>'SESSION_REVOKED' then raise; end if; end;
end $revoked$;
rollback;
