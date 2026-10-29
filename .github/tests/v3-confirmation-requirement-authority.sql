\set ON_ERROR_STOP on
begin;
do $receipt_boundary$ begin
 if has_table_privilege('service_role','public.studio2_operation_receipts','INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Transport can forge operation state'; end if;
 if to_regprocedure('public.admin_confirmation_reconfirm(uuid,text,uuid,text)') is not null or to_regprocedure('public.admin_confirmation_waive_requirement(uuid,text,uuid,text)') is not null then raise exception 'Unversioned requirement peer remains'; end if;
end $receipt_boundary$;
insert into auth.users(id,aud,role,email) values('29171000-0000-4000-8000-000000000001','authenticated','authenticated','requirement-command@local.invalid'),('29171000-0000-4000-8000-000000000002','authenticated','authenticated','requirement-denied@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values('29171000-0000-4000-8000-000000000011','29171000-0000-4000-8000-000000000001',now(),now()),('29171000-0000-4000-8000-000000000012','29171000-0000-4000-8000-000000000002',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29171000-0000-4000-8000-000000000001','organizer');
insert into public.editions(id,name,slug,edition_number,status) values('29171000-0000-4000-8000-000000000021','Requirement commands','requirement-commands-29171000',29171000,'active');
insert into public.countries(id,name,short_code) values('29171000-0000-4000-8000-000000000031','Requirement A','RQA'),('29171000-0000-4000-8000-000000000032','Requirement B','RQB');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29171000-0000-4000-8000-000000000001","session_id":"29171000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $materialize$
declare preview jsonb; result jsonb; replay jsonb;
begin
 preview:=public.admin_confirmation_requirement_materialization_preview('29171000-0000-4000-8000-000000000021',array['29171000-0000-4000-8000-000000000031'::uuid,'29171000-0000-4000-8000-000000000032'::uuid]);
 result:=public.admin_confirmation_apply_requirement_materialization('29171000-0000-4000-8000-000000000021',array['29171000-0000-4000-8000-000000000031'::uuid,'29171000-0000-4000-8000-000000000032'::uuid],preview->>'impactFingerprint','29171000-0000-4000-8000-000000000101','requirements:materialize',null);
 if result->>'ok'<>'true' or (result->>'created')::int<>2 then raise exception 'Materialization failed: %',result; end if;
 replay:=public.admin_confirmation_apply_requirement_materialization('29171000-0000-4000-8000-000000000021',array['29171000-0000-4000-8000-000000000031'::uuid,'29171000-0000-4000-8000-000000000032'::uuid],preview->>'impactFingerprint','29171000-0000-4000-8000-000000000101','requirements:materialize',null);
 if replay->>'replayed'<>'true' or replay->>'created'<>'2' then raise exception 'Materialization response-loss recovery failed'; end if;
end $materialize$;
reset role;
select set_config('test.req.a',(select id::text from public.studio2_confirmation_requirements where edition_id='29171000-0000-4000-8000-000000000021' and country_id='29171000-0000-4000-8000-000000000031'),true);
select set_config('test.req.b',(select id::text from public.studio2_confirmation_requirements where edition_id='29171000-0000-4000-8000-000000000021' and country_id='29171000-0000-4000-8000-000000000032'),true);
select set_config('test.req.rev',private.v3_confirmation_requirement_revision(current_setting('test.req.a')::uuid),true);
set local role authenticated;
do $waive$
declare first_result jsonb; replay jsonb; r uuid:=current_setting('test.req.a')::uuid; rev text:=current_setting('test.req.rev');
begin
 begin perform public.admin_confirmation_waive_requirement(r,'Reviewed waiver','29171000-0000-4000-8000-000000000102','requirements:waive',repeat('0',64)); raise exception 'Stale accepted'; exception when sqlstate 'PT409' then null; end;
 first_result:=public.admin_confirmation_waive_requirement(r,'Reviewed waiver','29171000-0000-4000-8000-000000000102','requirements:waive',rev);
 replay:=public.admin_confirmation_waive_requirement(r,'Reviewed waiver','29171000-0000-4000-8000-000000000102','requirements:waive',rev);
 if first_result->>'status'<>'waived' or replay->>'replayed'<>'true' or replay->>'operationId'<>first_result->>'operationId' then raise exception 'Waiver exact retry failed'; end if;
 begin perform public.admin_confirmation_waive_requirement(r,'Changed waiver','29171000-0000-4000-8000-000000000102','requirements:waive',rev); raise exception 'Changed reason accepted'; exception when sqlstate 'P0001' then if position('IDEMPOTENCY_CONFLICT' in sqlerrm)=0 then raise; end if; end;
 begin perform public.admin_confirmation_waive_requirement(r,'Another waiver','29171000-0000-4000-8000-000000000103','requirements:stale',rev); raise exception 'Stale accepted'; exception when sqlstate 'PT409' then null; end;
end $waive$;
reset role;
select set_config('test.req.resolved',private.v3_confirmation_requirement_revision(current_setting('test.req.a')::uuid),true);
set local role authenticated;
do $reconfirm$
declare result jsonb; replay jsonb;
begin
 result:=public.admin_confirmation_reconfirm(current_setting('test.req.a')::uuid,'Reviewed reconfirmation','29171000-0000-4000-8000-000000000104','requirements:reconfirm',current_setting('test.req.resolved'));
 -- The old requirement no longer appears in the live list. Its receipt is the
 -- recovery authority, so discarding the first response remains safe.
 replay:=public.admin_confirmation_reconfirm(current_setting('test.req.a')::uuid,'Reviewed reconfirmation','29171000-0000-4000-8000-000000000104','requirements:reconfirm',current_setting('test.req.resolved'));
 if result->>'generation'<>'2' or replay->>'replayed'<>'true' or result->>'requirementId'<>replay->>'requirementId' then raise exception 'Superseded requirement readback failed'; end if;
end $reconfirm$;
reset role;
do $once$
begin
 if (select count(*) from public.admin_audit_log where actor_id='29171000-0000-4000-8000-000000000001' and action in ('waive_confirmation_requirement','require_confirmation_again'))<>2 then raise exception 'Audit duplicate'; end if;
 if (select count(*) from public.studio2_operation_receipts where actor_id='29171000-0000-4000-8000-000000000001' and status='succeeded')<>3 then raise exception 'Receipt duplicate'; end if;
 if (select count(*) from public.studio2_confirmation_requirements where country_id='29171000-0000-4000-8000-000000000031')<>2 then raise exception 'Generation duplicate'; end if;
end $once$;
-- Audit failure also rolls back the row and operation claim.
select set_config('test.req.brev',private.v3_confirmation_requirement_revision(current_setting('test.req.b')::uuid),true);
create function pg_temp.fail_requirement_audit() returns trigger language plpgsql as $$begin if new.action='waive_confirmation_requirement' then raise exception 'injected requirement audit failure'; end if; return new; end$$;
create trigger v3_test_requirement_audit_failure before insert on public.admin_audit_log for each row execute function pg_temp.fail_requirement_audit();
set local role authenticated;
do $audit_rollback$
begin
 begin perform public.admin_confirmation_waive_requirement(current_setting('test.req.b')::uuid,'Rollback waiver','29171000-0000-4000-8000-000000000105','requirements:rollback',current_setting('test.req.brev')); raise exception 'Injected audit failure accepted'; exception when raise_exception then if sqlerrm<>'injected requirement audit failure' then raise; end if; end;
end $audit_rollback$;
reset role;
drop trigger v3_test_requirement_audit_failure on public.admin_audit_log;
do $audit_intact$ begin
 if (select status from public.studio2_confirmation_requirements where id=current_setting('test.req.b')::uuid)<>'required' or exists(select 1 from public.studio2_operation_receipts where operation_id='29171000-0000-4000-8000-000000000105') then raise exception 'Audit failure committed semantic change'; end if;
end $audit_intact$;
-- Receipt completion failure must roll back the semantic write, audit and claim.
create function pg_temp.fail_requirement_receipt() returns trigger language plpgsql as $$begin if new.command='confirmation.requirement.waive' and new.status='succeeded' then raise exception 'injected requirement receipt failure'; end if; return new; end$$;
create trigger v3_test_requirement_receipt_failure before update on public.studio2_operation_receipts for each row execute function pg_temp.fail_requirement_receipt();
select set_config('test.req.brev',private.v3_confirmation_requirement_revision(current_setting('test.req.b')::uuid),true);
set local role authenticated;
do $rollback$
begin
 begin perform public.admin_confirmation_waive_requirement(current_setting('test.req.b')::uuid,'Rollback waiver','29171000-0000-4000-8000-000000000105','requirements:rollback',current_setting('test.req.brev')); raise exception 'Injected failure accepted'; exception when raise_exception then if sqlerrm<>'injected requirement receipt failure' then raise; end if; end;
end $rollback$;
reset role;
do $intact$
begin
 if (select status from public.studio2_confirmation_requirements where id=current_setting('test.req.b')::uuid)<>'required' or exists(select 1 from public.studio2_operation_receipts where operation_id='29171000-0000-4000-8000-000000000105') then raise exception 'Receipt failure committed semantic change'; end if;
end $intact$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29171000-0000-4000-8000-000000000002","session_id":"29171000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
do $denied$
begin
 begin perform public.admin_confirmation_waive_requirement(current_setting('test.req.b')::uuid,'Unauthorized waiver','29171000-0000-4000-8000-000000000106','requirements:unauthorized',current_setting('test.req.brev')); raise exception 'Unauthorized accepted'; exception when insufficient_privilege then null; end;
 begin perform public.admin_confirmation_ensure_requirements('29171000-0000-4000-8000-000000000021',null); raise exception 'Peer writer exposed'; exception when insufficient_privilege then null; end;
end $denied$;
reset role;
delete from auth.sessions where id='29171000-0000-4000-8000-000000000011';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29171000-0000-4000-8000-000000000001","session_id":"29171000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $revoked$
begin
 begin perform public.admin_confirmation_reconfirm(current_setting('test.req.a')::uuid,'Reviewed reconfirmation','29171000-0000-4000-8000-000000000104','requirements:reconfirm',current_setting('test.req.resolved')); raise exception 'Revoked retry accepted'; exception when insufficient_privilege then null; end;
end $revoked$;
rollback;
