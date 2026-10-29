\set ON_ERROR_STOP on
begin;
insert into auth.users(id,aud,role,email) values
 ('53900000-0000-4000-8000-000000000001','authenticated','authenticated','consequence-reporter@local.invalid'),
 ('53900000-0000-4000-8000-000000000002','authenticated','authenticated','consequence-reviewer@local.invalid'),
 ('53900000-0000-4000-8000-000000000003','authenticated','authenticated','consequence-original@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) select ('53900000-0000-4000-8000-00000000001'||n)::uuid,('53900000-0000-4000-8000-00000000000'||n)::uuid,now(),now() from generate_series(1,3)n;
insert into public.studio2_role_assignments(user_id,role_key) select ('53900000-0000-4000-8000-00000000000'||n)::uuid,'organizer' from generate_series(2,3)n;
insert into public.integrity_cases(id,public_code,category,identity_mode,reporter_user_id,summary,details,status) values('53900000-0000-4000-8000-000000000071','CONSEQUENCE-539','conduct','confidential','53900000-0000-4000-8000-000000000001','Consequence proof','Canonical case remains truth through consequence failures','action_taken');
insert into public.integrity_case_findings(id,case_id,outcome,summary,rationale,created_by) values('53900000-0000-4000-8000-000000000081','53900000-0000-4000-8000-000000000071','violation','Original finding','Immutable original finding rationale','53900000-0000-4000-8000-000000000003');
insert into public.integrity_case_sanctions(id,case_id,finding_id,final_level,sanction_label,target_type,rationale,created_by,effective_at) values('53900000-0000-4000-8000-000000000091','53900000-0000-4000-8000-000000000071','53900000-0000-4000-8000-000000000081',6,public.integrity_sanction_label(6),'account','Immutable original sanction rationale','53900000-0000-4000-8000-000000000003',now());
select set_config('request.jwt.claims','{"role":"authenticated","sub":"53900000-0000-4000-8000-000000000003","session_id":"53900000-0000-4000-8000-000000000013"}',true);
set local role authenticated;
select public.studio2_integrity_set_case_priority('53900000-0000-4000-8000-000000000071','high','53900000-0000-4000-8000-000000000101','consequence:priority',1);
-- Deliver the older creation event: it must derive current revision 2.
select public.studio2_reconcile_integrity_consequences('53900000-0000-4000-8000-000000000071',1);
select public.studio2_integrity_set_case_priority('53900000-0000-4000-8000-000000000071','standard','53900000-0000-4000-8000-000000000102','consequence:priority2',2);
-- Deliver the older high-priority event after revision 3 committed.
select public.studio2_reconcile_integrity_consequences('53900000-0000-4000-8000-000000000071',1);
reset role;
do $case$
declare a jsonb; b jsonb; h uuid; event_id uuid;
begin
 if (select priority from public.studio2_organizer_tasks where source_key='integrity_cases:53900000-0000-4000-8000-000000000071')<>'normal' then raise exception 'Older event overwrote canonical priority'; end if;
 if not exists(select 1 from private.v3_integrity_consequence_applications where case_id='53900000-0000-4000-8000-000000000071' and source_revision=2 and result_metadata->>'caseVersion'='3') then raise exception 'Reconciliation did not re-read canonical truth'; end if;
 a:=public.studio2_integrity_set_case_priority('53900000-0000-4000-8000-000000000071','high','53900000-0000-4000-8000-000000000101','consequence:priority',1);
 b:=public.studio2_reconcile_operation('53900000-0000-4000-8000-000000000101');
 if b->'result' is distinct from a then raise exception 'Response-loss source readback failed'; end if;
 if (select count(*) from public.integrity_adjudication_history where operation_id='53900000-0000-4000-8000-000000000101')<>1 then raise exception 'Source retry duplicated history'; end if;
 select id into h from public.integrity_adjudication_history where operation_id='53900000-0000-4000-8000-000000000101';
 event_id:=private.v3_enqueue_integrity_history(h);
 if private.v3_enqueue_integrity_history(h) is distinct from event_id or (select count(*) from private.v3_domain_events where operation_id=h)<>1 then raise exception 'Observation retry duplicated event'; end if;
end $case$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"53900000-0000-4000-8000-000000000001","session_id":"53900000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $submit$ declare r jsonb; begin
 r:=public.v3_submit_integrity_appeal('53900000-0000-4000-8000-000000000201',repeat(md5('consequence:appeal'),2),'53900000-0000-4000-8000-000000000071','53900000-0000-4000-8000-000000000091','Independent review requested with concrete grounds.');
 perform set_config('test.integrity_appeal',r->>'appeal_id',true);
end $submit$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"53900000-0000-4000-8000-000000000003","session_id":"53900000-0000-4000-8000-000000000013"}',true);
select public.studio2_integrity_assign_appeal_reviewer(current_setting('test.integrity_appeal')::uuid,'53900000-0000-4000-8000-000000000002','53900000-0000-4000-8000-000000000202','consequence:assign',1);
select public.studio2_reconcile_integrity_consequences('53900000-0000-4000-8000-000000000071',100);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"53900000-0000-4000-8000-000000000002","session_id":"53900000-0000-4000-8000-000000000012"}',true);
do $resolve$ declare a jsonb; b jsonb; begin
 a:=public.studio2_integrity_resolve_appeal(current_setting('test.integrity_appeal')::uuid,'reduced','Independent reviewed reduction with concrete rationale.',4,'{}','{}','53900000-0000-4000-8000-000000000203','consequence:resolve',2);
 b:=public.studio2_integrity_resolve_appeal(current_setting('test.integrity_appeal')::uuid,'reduced','Independent reviewed reduction with concrete rationale.',4,'{}','{}','53900000-0000-4000-8000-000000000203','consequence:resolve',2);
 if a is distinct from b or (public.studio2_reconcile_operation('53900000-0000-4000-8000-000000000203')->'result') is distinct from a then raise exception 'Appeal response-loss retry/readback failed'; end if;
 begin
  perform public.studio2_integrity_resolve_appeal(current_setting('test.integrity_appeal')::uuid,'overturned','Independent reviewed reduction with concrete rationale.',null,'{}','{}','53900000-0000-4000-8000-000000000203','consequence:resolve',2);
  raise exception 'Changed semantic appeal retry accepted';
 exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
end $resolve$;
reset role;
-- A transport acknowledgement is not an application receipt and cannot turn
-- an event into canonical truth. Reconciliation still applies its own work.
select set_config('test.integrity_event',(select e.id::text from private.v3_domain_events e join public.integrity_adjudication_history h on h.id=e.operation_id where h.operation_id='53900000-0000-4000-8000-000000000203' and h.event_type='integrity.appeal_changed'),true);
insert into private.v3_domain_event_consumer_receipts(event_id,consumer_key,result_metadata) values(current_setting('test.integrity_event')::uuid,'integrity.workflow','{"transportAcknowledged":true}');
update private.v3_domain_event_outbox set status='completed',completed_at=now() where event_id=current_setting('test.integrity_event')::uuid and consumer_key='integrity.workflow';
-- Delivery failure is isolated from canonical adjudication and its receipt.
create function pg_temp.integrity_task_failure() returns trigger language plpgsql as $$ begin if new.source_id=current_setting('test.integrity_appeal',true) then raise exception 'Injected consequence failure'; end if; return new; end $$;
create trigger v3_test_integrity_task_failure before insert or update on public.studio2_organizer_tasks for each row execute function pg_temp.integrity_task_failure();
select public.studio2_reconcile_integrity_consequences('53900000-0000-4000-8000-000000000071',100);
do $failed$ begin
 if not exists(select 1 from public.integrity_case_appeals where id=current_setting('test.integrity_appeal')::uuid and status='reduced' and version=3) or not exists(select 1 from public.integrity_case_sanctions where id='53900000-0000-4000-8000-000000000091' and status='modified_on_appeal' and final_level=6) then raise exception 'Delivery failure changed canonical adjudication'; end if;
 if not exists(select 1 from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id join public.integrity_adjudication_history h on h.id=e.operation_id where h.operation_id='53900000-0000-4000-8000-000000000203' and o.status='pending' and o.last_error_code='INTEGRITY_CONSEQUENCE_FAILED') then raise exception 'Failed delivery lost durable pending state'; end if;
 if exists(select 1 from private.v3_integrity_consequence_applications a join public.integrity_adjudication_history h on h.id=a.history_id where h.operation_id='53900000-0000-4000-8000-000000000203') then raise exception 'Failed delivery left successful receipt'; end if;
end $failed$;
drop trigger v3_test_integrity_task_failure on public.studio2_organizer_tasks;
select public.studio2_reconcile_integrity_consequences('53900000-0000-4000-8000-000000000071',100);
select public.studio2_reconcile_integrity_consequences('53900000-0000-4000-8000-000000000071',100);
do $applied$
declare h uuid; old_receipt jsonb;
begin
 if (select state from public.studio2_organizer_tasks where source_key='integrity_case_appeals:'||current_setting('test.integrity_appeal'))<>'resolved' then raise exception 'Appeal consequence not applied'; end if;
 select id into h from public.integrity_adjudication_history where operation_id='53900000-0000-4000-8000-000000000203' and event_type='integrity.appeal_changed';
 if (select count(*) from private.v3_integrity_consequence_applications where history_id=h)<>1 or (select count(*) from private.v3_domain_event_consumer_receipts r join private.v3_domain_events e on e.id=r.event_id where e.operation_id=h and r.consumer_key='integrity.workflow')<>1 then raise exception 'Duplicate/missing application receipt'; end if;
 if (select count(*) from public.integrity_case_events where operation_id='53900000-0000-4000-8000-000000000203' and event_type='integrity.appeal_changed')<>1 then raise exception 'Duplicate canonical appeal audit'; end if;
 begin update private.v3_integrity_consequence_applications set result_metadata='{}' where history_id=h; raise exception 'Application history mutable'; exception when sqlstate '55000' then null; end;
 if exists(select 1 from public.integrity_adjudication_history h where h.case_id='53900000-0000-4000-8000-000000000071' and not exists(select 1 from private.v3_domain_events e where e.operation_id=h.id and e.event_type=h.event_type)) then raise exception 'Canonical history lacks durable event'; end if;
end $applied$;
-- An enqueue/audit failure must roll back the entire new semantic command.
create function pg_temp.integrity_emit_failure() returns trigger language plpgsql as $$ begin raise exception 'Injected durable enqueue failure' using errcode='23514'; end $$;
create trigger v3_test_integrity_emit_failure before insert on private.v3_domain_events for each row when(new.event_type='integrity.case_changed') execute function pg_temp.integrity_emit_failure();
do $enqueue_failure$ begin
 begin perform public.studio2_integrity_set_case_priority('53900000-0000-4000-8000-000000000071','high','53900000-0000-4000-8000-000000000105','consequence:enqueue-failure',3); raise exception 'Failed enqueue accepted'; exception when check_violation then null; end;
 if (select version from public.integrity_cases where id='53900000-0000-4000-8000-000000000071')<>3 or exists(select 1 from public.studio2_operation_receipts where operation_id='53900000-0000-4000-8000-000000000105') or exists(select 1 from public.integrity_adjudication_history where case_id='53900000-0000-4000-8000-000000000071' and aggregate_type='case' and revision=4) then raise exception 'Durable enqueue failure leaked semantic state'; end if;
end $enqueue_failure$;
drop trigger v3_test_integrity_emit_failure on private.v3_domain_events;
-- Missing capability and revoked sessions cannot read or trigger reconciliation.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"53900000-0000-4000-8000-000000000001","session_id":"53900000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $denied$ begin
 begin perform public.studio2_reconcile_integrity_consequences('53900000-0000-4000-8000-000000000071',100); raise exception 'Missing capability accepted'; exception when insufficient_privilege then null; end;
end $denied$;
reset role;
delete from auth.sessions where id='53900000-0000-4000-8000-000000000012';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"53900000-0000-4000-8000-000000000002","session_id":"53900000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
do $revoked$ begin
 begin perform public.studio2_integrity_consequence_status('53900000-0000-4000-8000-000000000071'); raise exception 'Revoked readback accepted'; exception when insufficient_privilege then if sqlerrm<>'SESSION_REVOKED' then raise; end if; end;
end $revoked$;
reset role;
do $authority$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.v3_enqueue_integrity_history(uuid)','EXECUTE') or has_function_privilege(r,'private.v3_reconcile_integrity_consequences(integer,uuid)','EXECUTE') or has_table_privilege(r,'private.v3_integrity_consequence_applications','INSERT,UPDATE,DELETE') then raise exception 'Independent consequence authority granted to %',r; end if;
 end loop;
 if has_function_privilege('service_role','public.studio2_reconcile_integrity_consequences(uuid,integer)','EXECUTE') then raise exception 'Service role mistaken for semantic authority'; end if;
end $authority$;
rollback;
