\set ON_ERROR_STOP on
begin;
insert into auth.users(id,aud,role,email) values('29072852-0000-4000-8000-000000000001','authenticated','authenticated','calculate@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values('29072852-0000-4000-8000-000000000011','29072852-0000-4000-8000-000000000001',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29072852-0000-4000-8000-000000000001','organizer');
insert into televoting.televote_aggregations(id,name,total_points_to_distribute,rank_exponent) values('29072852-0000-4000-8000-000000000071','Calculation authority',100,1);
insert into televoting.televote_aggregation_participants(aggregation_id,country_code,display_order) values('29072852-0000-4000-8000-000000000071','AA',0),('29072852-0000-4000-8000-000000000071','BB',1);
insert into televoting.televote_aggregation_sources(id,aggregation_id,source_name,percentage_weight,input_mode) values('29072852-0000-4000-8000-000000000081','29072852-0000-4000-8000-000000000071','Manual raw',100,'raw_results');
insert into televoting.external_score_entries(source_id,country_code,value) values('29072852-0000-4000-8000-000000000081','AA',10),('29072852-0000-4000-8000-000000000081','BB',10);
select set_config('test.calc.version',(select command_version::text from televoting.televote_aggregations where id='29072852-0000-4000-8000-000000000071'),true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29072852-0000-4000-8000-000000000001","session_id":"29072852-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $test$
declare a jsonb; b jsonb; v bigint:=current_setting('test.calc.version')::bigint;
begin
 a:=televoting.v3_calculate_combined('29072852-0000-4000-8000-000000000071',v,'29072852-0000-4000-8000-000000000501','calc:exact');
 b:=televoting.v3_calculate_combined('29072852-0000-4000-8000-000000000071',v,'29072852-0000-4000-8000-000000000501','calc:exact');
 if a is distinct from b or (a->>'version')::integer<>1 then raise exception 'Exact retry changed calculation'; end if;
 if (public.studio2_reconcile_operation('29072852-0000-4000-8000-000000000501')->'result') is distinct from a then raise exception 'Response-loss readback failed'; end if;
 begin
  perform televoting.v3_calculate_combined('29072852-0000-4000-8000-000000000071',v+1,'29072852-0000-4000-8000-000000000501','calc:exact');
  raise exception 'Changed payload accepted';
 exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin
  perform televoting.v3_calculate_combined('29072852-0000-4000-8000-000000000071',v,'29072852-0000-4000-8000-000000000502','calc:stale');
  raise exception 'Concurrent/stale version accepted';
 exception when serialization_failure then null; end;
end $test$;
reset role;
do $assert$
begin
 if (select final_combined_points from televoting.combined_televote_results where aggregation_id='29072852-0000-4000-8000-000000000071' and country_code='AA')<>60 then raise exception 'Rank weighted Hamilton parity failed'; end if;
 if (select count(*) from televoting.combined_televote_component_results where aggregation_id='29072852-0000-4000-8000-000000000071')<>2 then raise exception 'Component persistence failed'; end if;
 if (select count(*) from televoting.admin_audit_log where target_id='29072852-0000-4000-8000-000000000071' and action='calculate_combined_televote')<>1 then raise exception 'Duplicate audit'; end if;
 if (select count(*) from public.integration_events where remote_id='29072852-0000-4000-8000-000000000071' and event_type='combined.calculated')<>1 then raise exception 'Duplicate event'; end if;
end $assert$;
-- Inject failures at the two final boundaries; PL/pgSQL subtransactions must
-- undo pools, both result tables, aggregate, audit, event and operation claim.
create function pg_temp.fail_calculation() returns trigger language plpgsql as $$ begin raise exception 'injected boundary failure' using errcode='23514'; end $$;
create trigger test_calc_audit before insert on televoting.admin_audit_log for each row execute function pg_temp.fail_calculation();
do $atomic$
declare v bigint; before_state jsonb;
begin
 select command_version,to_jsonb(a) into v,before_state from televoting.televote_aggregations a where id='29072852-0000-4000-8000-000000000071';
 begin
  perform televoting.v3_calculate_combined('29072852-0000-4000-8000-000000000071',v,'29072852-0000-4000-8000-000000000503','calc:audit-fail');
  raise exception 'Audit failure accepted';
 exception when check_violation then null; end;
 if (select to_jsonb(a) from televoting.televote_aggregations a where id='29072852-0000-4000-8000-000000000071') is distinct from before_state or exists(select 1 from televoting.combined_televote_results where aggregation_id='29072852-0000-4000-8000-000000000071' and calculation_version=2) or exists(select 1 from public.studio2_operation_receipts where operation_id='29072852-0000-4000-8000-000000000503') then raise exception 'Audit failure leaked mutation'; end if;
end $atomic$;
drop trigger test_calc_audit on televoting.admin_audit_log;
create trigger test_calc_receipt before update on public.studio2_operation_receipts for each row execute function pg_temp.fail_calculation();
do $atomic$
declare v bigint;
begin
 select command_version into v from televoting.televote_aggregations where id='29072852-0000-4000-8000-000000000071';
 begin
  perform televoting.v3_calculate_combined('29072852-0000-4000-8000-000000000071',v,'29072852-0000-4000-8000-000000000504','calc:receipt-fail');
  raise exception 'Receipt failure accepted';
 exception when check_violation then null; end;
 if exists(select 1 from televoting.combined_televote_component_results where aggregation_id='29072852-0000-4000-8000-000000000071' and calculation_version=2) or (select count(*) from public.integration_events where remote_id='29072852-0000-4000-8000-000000000071' and event_type='combined.calculated')<>1 then raise exception 'Receipt failure leaked calculation/event'; end if;
end $atomic$;
drop trigger test_calc_receipt on public.studio2_operation_receipts;
update televoting.televote_aggregations set status='published' where id='29072852-0000-4000-8000-000000000071';
do $frozen$
begin
 begin
  perform televoting.v3_calculate_combined('29072852-0000-4000-8000-000000000071',(select command_version from televoting.televote_aggregations where id='29072852-0000-4000-8000-000000000071'),'29072852-0000-4000-8000-000000000505','calc:frozen');
  raise exception 'Published recalculation accepted';
 exception when check_violation then null; end;
end $frozen$;
delete from public.studio2_role_assignments where user_id='29072852-0000-4000-8000-000000000001';
set local role authenticated;
do $denied$ begin
 begin perform televoting.v3_calculate_combined('29072852-0000-4000-8000-000000000071',current_setting('test.calc.version')::bigint,'29072852-0000-4000-8000-000000000501','calc:exact'); raise exception 'Missing capability replayed'; exception when insufficient_privilege then null; end;
end $denied$;
reset role;
insert into public.studio2_role_assignments(user_id,role_key) values('29072852-0000-4000-8000-000000000001','organizer');
delete from auth.sessions where id='29072852-0000-4000-8000-000000000011';
set local role authenticated;
do $denied$ begin
 begin perform televoting.v3_calculate_combined('29072852-0000-4000-8000-000000000071',current_setting('test.calc.version')::bigint,'29072852-0000-4000-8000-000000000501','calc:exact'); raise exception 'Revoked session replayed'; exception when insufficient_privilege then null; end;
end $denied$;
rollback;
