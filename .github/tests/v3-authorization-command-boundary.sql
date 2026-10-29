\set ON_ERROR_STOP on
begin;
insert into auth.users(id,aud,role,email) values
 ('29172000-0000-4000-8000-000000000001','authenticated','authenticated','permission-a@local.invalid'),
 ('29172000-0000-4000-8000-000000000002','authenticated','authenticated','permission-b@local.invalid'),
 ('29172000-0000-4000-8000-000000000003','authenticated','authenticated','permission-target@local.invalid'),
 ('29172000-0000-4000-8000-000000000004','authenticated','authenticated','permission-denied@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) select ('29172000-0000-4000-8000-00000000001'||i)::uuid,('29172000-0000-4000-8000-00000000000'||i)::uuid,now(),now() from generate_series(1,4) i;
insert into public.studio2_role_assignments(user_id,role_key) values('29172000-0000-4000-8000-000000000001','organizer'),('29172000-0000-4000-8000-000000000002','organizer');
select set_config('test.auth.a',jsonb_build_object('role','authenticated','sub','29172000-0000-4000-8000-000000000001','session_id','29172000-0000-4000-8000-000000000011','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
select set_config('test.auth.b',jsonb_build_object('role','authenticated','sub','29172000-0000-4000-8000-000000000002','session_id','29172000-0000-4000-8000-000000000012','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())::bigint)))::text,true);
select set_config('request.jwt.claims',current_setting('test.auth.a'),true);
set local role authenticated;
do $request$
declare req jsonb;
begin
 req:=public.studio2_request_permission_change_approval('29172000-0000-4000-8000-000000000003','grant_capability','permissions.manage',null,null,'29172000-0000-4000-8000-000000000101','auth:grant',0);
 perform set_config('test.auth.request',req->>'id',true);
 begin perform public.studio2_approve_permission_change((req->>'id')::uuid); raise exception 'Self approval accepted'; exception when insufficient_privilege then null; end;
 -- The historical eight-argument endpoint must not permit skipping approval.
 begin perform public.studio2_apply_permission_change_r3('29172000-0000-4000-8000-000000000003','grant_capability','permissions.manage',null,null,'29172000-0000-4000-8000-000000000101','auth:grant',0); raise exception 'Legacy R3 bypass exposed'; exception when insufficient_privilege then null; end;
end $request$;
select set_config('request.jwt.claims',current_setting('test.auth.b'),true);
do $approve$
declare first_result jsonb; replay jsonb;
begin
 first_result:=public.studio2_approve_permission_change(current_setting('test.auth.request')::uuid);
 replay:=public.studio2_approve_permission_change(current_setting('test.auth.request')::uuid);
 if first_result<>replay or first_result->>'approvedBy'<>'29172000-0000-4000-8000-000000000002' then raise exception 'Approval readback failed'; end if;
end $approve$;
select set_config('request.jwt.claims',current_setting('test.auth.a'),true);
do $apply$
declare result jsonb; replay jsonb;
begin
 result:=public.studio2_apply_permission_change_r3('29172000-0000-4000-8000-000000000003','grant_capability','permissions.manage',null,null,'29172000-0000-4000-8000-000000000101','auth:grant',0,current_setting('test.auth.request')::uuid);
 -- Discard the first response: approval is now consumed and CAS has advanced,
 -- so recovery must precede mutable-state validation.
 replay:=public.studio2_apply_permission_change_r3('29172000-0000-4000-8000-000000000003','grant_capability','permissions.manage',null,null,'29172000-0000-4000-8000-000000000101','auth:grant',0,current_setting('test.auth.request')::uuid);
 if result<>replay or not coalesce((result->>'ok')::boolean,false) then raise exception 'Permission lost-response recovery failed: %',result; end if;
 begin perform public.studio2_apply_permission_change_r3('29172000-0000-4000-8000-000000000003','grant_capability','permissions.manage',null,now()+interval '1 day','29172000-0000-4000-8000-000000000101','auth:grant',0,current_setting('test.auth.request')::uuid); raise exception 'Changed expiry accepted'; exception when raise_exception then if position('IDEMPOTENCY_CONFLICT' in sqlerrm)=0 then raise; end if; end;
 begin perform public.studio2_apply_permission_change_r3('29172000-0000-4000-8000-000000000004','grant_capability','permissions.manage',null,null,'29172000-0000-4000-8000-000000000101','auth:grant',0,current_setting('test.auth.request')::uuid); raise exception 'Changed target accepted'; exception when raise_exception then if position('IDEMPOTENCY_CONFLICT' in sqlerrm)=0 then raise; end if; end;
 begin perform public.studio2_apply_permission_change_r3('29172000-0000-4000-8000-000000000003','grant_capability','permissions.manage',null,null,'29172000-0000-4000-8000-000000000101','auth:grant',0,'29172000-0000-4000-8000-000000000199'); raise exception 'Changed approval accepted'; exception when raise_exception then if position('IDEMPOTENCY_CONFLICT' in sqlerrm)=0 then raise; end if; end;
end $apply$;
reset role;
do $once$
begin
 if (select count(*) from public.studio2_capability_grants where user_id='29172000-0000-4000-8000-000000000003' and capability='permissions.manage')<>1 then raise exception 'Permission mutation duplicated'; end if;
 if (select version from public.studio2_permission_subject_versions where user_id='29172000-0000-4000-8000-000000000003')<>1 then raise exception 'Permission CAS duplicated'; end if;
 if (select count(*) from public.admin_audit_log where action='permission_approval_granted' and record_id=current_setting('test.auth.request'))<>1 then raise exception 'Approval audit duplicated'; end if;
 if (select count(*) from public.studio2_operation_receipts where operation_id='29172000-0000-4000-8000-000000000101' and status='succeeded')<>1 then raise exception 'Permission receipt missing or duplicate'; end if;
 if to_regprocedure('private.studio2_bump_permission_version(uuid)') is not null or to_regprocedure('private.studio2_lock_permission_version(uuid)') is not null or to_regprocedure('private.studio2_permission_state_version_trigger()') is not null then raise exception 'Obsolete counter chain remains'; end if;
 if has_function_privilege('service_role','private.studio2_ensure_permission_version(uuid)','EXECUTE') then raise exception 'Version primitive exposed'; end if;
end $once$;
-- A new approval cannot reuse a stale permission revision after the first
-- command advances canonical access truth.
set local role authenticated;
do $stale$ begin
 begin perform public.studio2_request_permission_change_approval('29172000-0000-4000-8000-000000000003','revoke_capability','permissions.manage',null,null,'29172000-0000-4000-8000-000000000109','auth:stale',0); raise exception 'Stale access revision accepted'; exception when sqlstate 'PT409' then null; end;
end $stale$;
reset role;
-- Receipt failure must roll back permission truth, version, audit and approval
-- consumption together. The already-approved request remains safely retryable.
select set_config('request.jwt.claims',current_setting('test.auth.a'),true);
set local role authenticated;
do $second_request$ declare request jsonb; begin
 request:=public.studio2_request_permission_change_approval('29172000-0000-4000-8000-000000000004','grant_capability','permissions.manage',null,null,'29172000-0000-4000-8000-000000000102','auth:rollback',0);
 perform set_config('test.auth.rollback_request',request->>'id',true);
end $second_request$;
select set_config('request.jwt.claims',current_setting('test.auth.b'),true);
select public.studio2_approve_permission_change(current_setting('test.auth.rollback_request')::uuid);
reset role;
create function pg_temp.fail_permission_receipt() returns trigger language plpgsql as $$begin if new.operation_id='29172000-0000-4000-8000-000000000102' and new.status='succeeded' then raise exception 'injected permission receipt failure'; end if; return new; end$$;
create trigger v3_test_permission_receipt_failure before update on public.studio2_operation_receipts for each row execute function pg_temp.fail_permission_receipt();
select set_config('request.jwt.claims',current_setting('test.auth.a'),true);
set local role authenticated;
do $rollback$ begin
 begin perform public.studio2_apply_permission_change_r3('29172000-0000-4000-8000-000000000004','grant_capability','permissions.manage',null,null,'29172000-0000-4000-8000-000000000102','auth:rollback',0,current_setting('test.auth.rollback_request')::uuid); raise exception 'Injected failure accepted'; exception when raise_exception then if sqlerrm<>'injected permission receipt failure' then raise; end if; end;
end $rollback$;
reset role;
do $rollback_intact$ begin
 if exists(select 1 from public.studio2_capability_grants where user_id='29172000-0000-4000-8000-000000000004') or exists(select 1 from public.studio2_operation_receipts where operation_id='29172000-0000-4000-8000-000000000102') or exists(select 1 from public.studio2_permission_change_approval_requests where id=current_setting('test.auth.rollback_request')::uuid and consumed_at is not null) or exists(select 1 from public.admin_audit_log where after_data->>'operationId'='29172000-0000-4000-8000-000000000102' and action='permission_grant_capability') then raise exception 'Permission receipt failure partially committed'; end if;
end $rollback_intact$;
-- Historical receipt readback remains request-bound without executing again.
update public.studio2_operation_receipts set scope=scope||'{"affectedCapabilities":["permissions.manage"]}' where operation_id='29172000-0000-4000-8000-000000000101';
set local role authenticated;
do $legacy_readback$ begin
 perform public.studio2_apply_permission_change_r3('29172000-0000-4000-8000-000000000003','grant_capability','permissions.manage',null,null,'29172000-0000-4000-8000-000000000101','auth:grant',0,current_setting('test.auth.request')::uuid);
 begin perform public.studio2_apply_permission_change_r3('29172000-0000-4000-8000-000000000003','grant_capability','permissions.manage',null,now()+interval '1 day','29172000-0000-4000-8000-000000000101','auth:grant',0,current_setting('test.auth.request')::uuid); raise exception 'Changed historical expiry accepted'; exception when raise_exception then if position('IDEMPOTENCY_CONFLICT' in sqlerrm)=0 then raise; end if; end;
end $legacy_readback$;
reset role;
-- The derived HOD role is an idempotent consequence of the canonical account
-- association; callers cannot select an arbitrary role or manufacture a version.
insert into public.countries(id,name,short_code) values('29172000-0000-4000-8000-000000000031','Auth consequence country','ACA');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29172000-0000-4000-8000-000000000004","session_id":"29172000-0000-4000-8000-000000000014"}',true);
set local role authenticated;
select public.v3_claim_country_account('29172000-0000-4000-8000-000000000031','29172000-0000-4000-8000-000000000103','auth:account');
select public.v3_claim_country_account('29172000-0000-4000-8000-000000000031','29172000-0000-4000-8000-000000000103','auth:account');
reset role;
do $derived$ begin
 if (select count(*) from public.studio2_role_assignments where user_id='29172000-0000-4000-8000-000000000004' and role_key='hod')<>1 then raise exception 'Derived HOD role duplicate'; end if;
 if (select version from public.studio2_permission_subject_versions where user_id='29172000-0000-4000-8000-000000000004')<>1 then raise exception 'Derived version not bounded'; end if;
end $derived$;
set local role service_role;
do $transport$
begin
 begin update public.studio2_permission_change_approval_requests set approved_by='29172000-0000-4000-8000-000000000001'; raise exception 'Forged approval accepted'; exception when insufficient_privilege then null; end;
 begin delete from public.studio2_operation_receipts where operation_id='29172000-0000-4000-8000-000000000101'; raise exception 'Receipt destruction accepted'; exception when insufficient_privilege then null; end;
end $transport$;
reset role;
-- Active, unauthorized actor cannot approve or apply.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29172000-0000-4000-8000-000000000004","session_id":"29172000-0000-4000-8000-000000000014"}',true);
set local role authenticated;
do $denied$
begin
 begin perform public.studio2_approve_permission_change(current_setting('test.auth.request')::uuid); raise exception 'Unauthorized approval accepted'; exception when insufficient_privilege then null; end;
end $denied$;
reset role;
delete from auth.sessions where id='29172000-0000-4000-8000-000000000011';
select set_config('request.jwt.claims',current_setting('test.auth.a'),true);
set local role authenticated;
do $revoked$
begin
 begin perform public.studio2_apply_permission_change_r3('29172000-0000-4000-8000-000000000003','grant_capability','permissions.manage',null,null,'29172000-0000-4000-8000-000000000101','auth:grant',0,current_setting('test.auth.request')::uuid); raise exception 'Revoked readback accepted'; exception when insufficient_privilege then null; end;
end $revoked$;
rollback;
