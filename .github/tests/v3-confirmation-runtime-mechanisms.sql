\set ON_ERROR_STOP on
begin;
-- CONTRACTS
do $catalog$
declare c jsonb; a jsonb; f record; t text; role_name text; col text; actual text[]; expected text[];
begin
 if jsonb_array_length(current_setting('test.internal_mechanisms')::jsonb)<>4 then raise exception 'Missing Confirmation mechanism proofs'; end if;
 for c in select value from jsonb_array_elements(current_setting('test.internal_mechanisms')::jsonb || current_setting('test.internal_callers')::jsonb) loop
  select p.*,pg_get_userbyid(p.proowner) owner_name into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'=c->>'signature';
  if f.oid is null or f.owner_name<>'postgres' or md5(pg_get_functiondef(f.oid))<>c->>'definitionHash' or f.prosecdef<>(c->>'securityDefiner')::boolean or not exists(select 1 from unnest(f.proconfig) x where x like 'search_path=pg_catalog,%pg_temp') then raise exception 'Confirmation implementation/path drift: %',c->>'signature'; end if;
  select array_agg(x order by x) into expected from jsonb_array_elements_text(coalesce(c->'executeRoles','["postgres"]'::jsonb)) x;
  select array_agg(case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end order by case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end) into actual from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) acl where acl.privilege_type='EXECUTE';
  if actual is distinct from expected then raise exception 'Confirmation execution exposure drift: %',c->>'signature'; end if;
  select coalesce(array_agg(x order by x),array[]::text[]) into expected from jsonb_array_elements_text(c->'callerSignatures') x;
  select coalesce(array_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' order by n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'),array[]::text[]) into actual from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','televoting') and p.prokind='f' and p.prosrc ~ ('\m'||f.proname||'[\"]?[[:space:]]*\(');
  if actual is distinct from expected then raise exception 'Confirmation caller graph drift: %',c->>'signature'; end if;
  for a in select value from jsonb_array_elements(c->'attachments') loop
   if not exists(select 1 from pg_trigger where tgrelid=(a->>'table')::regclass and tgfoid=f.oid and tgtype=(a->>'type')::int and tgenabled='O' and md5(pg_get_triggerdef(oid))=a->>'definitionHash') then raise exception 'Confirmation trigger attachment drift: %',c->>'signature'; end if;
  end loop;
  for t in select jsonb_array_elements_text(c->'inputTables') loop
   foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name,t,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Raw Confirmation source DML: %',t; end if;
    for col in select attname from pg_attribute where attrelid=t::regclass and attnum>0 and not attisdropped loop
     if has_column_privilege(role_name,t,col,'INSERT,UPDATE') then raise exception 'Raw Confirmation source column DML: %.%',t,col; end if;
    end loop;
   end loop;
  end loop;
 end loop;
end $catalog$;
insert into auth.users(id,aud,role,email) values
 ('29233000-0000-4000-8000-000000000001','authenticated','authenticated','confirmation-repair@local.invalid'),
 ('29233000-0000-4000-8000-000000000002','authenticated','authenticated','confirmation-repair-denied@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('29233000-0000-4000-8000-000000000011','29233000-0000-4000-8000-000000000001',now(),now()),
 ('29233000-0000-4000-8000-000000000012','29233000-0000-4000-8000-000000000002',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29233000-0000-4000-8000-000000000001','organizer');
insert into public.editions(id,name,slug,edition_number,status) values('29233000-0000-4000-8000-000000000021','Confirmation repair','confirmation-repair-29233000',29233000,'active');
insert into public.countries(id,name,short_code) values
 ('29233000-0000-4000-8000-000000000041','Repairland','C3R'),
 ('29233000-0000-4000-8000-000000000042','Recoveryland','C3L');
insert into public.submission_rounds(id,edition_id,name,status) values('29233000-0000-4000-8000-000000000031','29233000-0000-4000-8000-000000000021','Repair round','open');
insert into public.submissions(id,edition_id,round_id,instagram_username,country,participating,selection_method) values('29233000-0000-4000-8000-000000000061','29233000-0000-4000-8000-000000000021','29233000-0000-4000-8000-000000000031','repairland','Repairland',true,'internal');
-- An unchanged canonical requirement may have been last touched yesterday.
-- Reconciliation must preserve its opaque reviewed revision, even on first use.
update public.studio2_confirmation_requirements set updated_at=now()-interval '1 day' where edition_id='29233000-0000-4000-8000-000000000021';
select set_config('test.confirmation.req',(select id::text from public.studio2_confirmation_requirements where edition_id='29233000-0000-4000-8000-000000000021'),true);
select set_config('test.confirmation.rev',private.v3_confirmation_requirement_revision(current_setting('test.confirmation.req')::uuid),true);
select set_config('test.confirmation.round',(select version::text from public.studio2_confirmation_round_versions where round_id='29233000-0000-4000-8000-000000000031'),true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29233000-0000-4000-8000-000000000001","session_id":"29233000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $noop$ declare result jsonb; replay jsonb; begin
 result:=public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,50,'29233000-0000-4000-8000-000000000101','confirmation:noop');
 replay:=public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,50,'29233000-0000-4000-8000-000000000101','confirmation:noop');
 if result->>'complete'<>'true' or result->>'changed'<>'false' or replay->>'replayed'<>'true' or result-'replayed'<>replay-'replayed' then raise exception 'No-op repair or receipt recovery failed'; end if;
 begin perform public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,1,'29233000-0000-4000-8000-000000000101','confirmation:noop'); raise exception 'Changed repair accepted'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
end $noop$;
reset role;
do $stable$ begin
 if private.v3_confirmation_requirement_revision(current_setting('test.confirmation.req')::uuid) is distinct from current_setting('test.confirmation.rev') then raise exception 'No-op repair invalidated a reviewed requirement revision'; end if;
 if (select version from public.studio2_confirmation_round_versions where round_id='29233000-0000-4000-8000-000000000031')<>current_setting('test.confirmation.round')::bigint then raise exception 'Derived repair touched unrelated round revision'; end if;
end $stable$;
-- Inject derived binding drift, not a new canonical response or generation.
update public.studio2_confirmation_requirements set status='required',resolved_by_submission_id=null,resolved_at=null where id=current_setting('test.confirmation.req')::uuid;
set local role authenticated;
do $repair$ declare result jsonb; replay jsonb; begin
 result:=public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,50,'29233000-0000-4000-8000-000000000102','confirmation:repair');
 replay:=public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,50,'29233000-0000-4000-8000-000000000102','confirmation:repair');
 if result->>'complete'<>'true' or result->>'changed'<>'true' or replay->>'replayed'<>'true' then raise exception 'Canonical-source repair failed'; end if;
end $repair$;
reset role;
do $once$ begin
 if not exists(select 1 from public.studio2_confirmation_requirements where id=current_setting('test.confirmation.req')::uuid and status='satisfied' and generation=1 and resolved_by_submission_id='29233000-0000-4000-8000-000000000061') then raise exception 'Repair changed generation or source authority'; end if;
 if (select count(*) from public.admin_audit_log where action='confirmation_requirements_reconciled' and actor_id='29233000-0000-4000-8000-000000000001')<>2 or (select count(*) from public.studio2_operation_receipts where command='confirmation.requirement.reconcile' and actor_id='29233000-0000-4000-8000-000000000001')<>2 then raise exception 'Repair duplicated audit or receipt'; end if;
 if to_regprocedure('public.studio2_reconcile_confirmation_requirements(uuid,integer,integer)') is not null then raise exception 'Unversioned service repair peer remains'; end if;
end $once$;
-- Both failures roll back the repaired row, task consequences and operation.
update public.studio2_confirmation_requirements set status='required',resolved_by_submission_id=null,resolved_at=null where id=current_setting('test.confirmation.req')::uuid;
create function pg_temp.fail_confirmation_repair() returns trigger language plpgsql as $$begin
 if tg_table_name='admin_audit_log' then
  if new.after_data->>'operationId'='29233000-0000-4000-8000-000000000103' then raise exception 'injected repair audit failure'; end if;
 elsif new.operation_id='29233000-0000-4000-8000-000000000107' and new.status='succeeded' then raise exception 'injected repair receipt failure';
 end if;
 return new;
end$$;
create trigger v3_test_confirmation_repair_audit before insert on public.admin_audit_log for each row execute function pg_temp.fail_confirmation_repair();
create trigger v3_test_confirmation_repair_receipt before update on public.studio2_operation_receipts for each row execute function pg_temp.fail_confirmation_repair();
set local role authenticated;
do $rollback$ declare i integer; begin
 foreach i in array array[103,107] loop
  begin perform public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,50,('29233000-0000-4000-8000-000000000'||i)::uuid,'confirmation:rollback:'||i); raise exception 'Repair failure accepted'; exception when raise_exception then if sqlerrm not in ('injected repair audit failure','injected repair receipt failure') then raise; end if; end;
 end loop;
end $rollback$;
reset role;
do $intact$ begin
 if (select status from public.studio2_confirmation_requirements where id=current_setting('test.confirmation.req')::uuid)<>'required' or exists(select 1 from public.studio2_operation_receipts where operation_id in ('29233000-0000-4000-8000-000000000103','29233000-0000-4000-8000-000000000107')) or exists(select 1 from public.admin_audit_log where after_data->>'operationId' in ('29233000-0000-4000-8000-000000000103','29233000-0000-4000-8000-000000000107')) then raise exception 'Repair failure left partial state'; end if;
end $intact$;
-- Lost canonical lifecycle truth is deliberately unreconstructible. A bulk
-- repair must report it, without manufacturing a new reconfirmation generation.
insert into public.studio2_confirmation_requirements(edition_id,country_id,generation,status,reason,valid_from,superseded_at,invalidated_at,invalidated_reason) values('29233000-0000-4000-8000-000000000021','29233000-0000-4000-8000-000000000042',1,'invalidated','Historical fixture',now()-interval '2 days',now()-interval '1 day',now()-interval '1 day','Historical invalidation');
set local role authenticated;
do $loss$ declare result jsonb; begin
 result:=public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,50,'29233000-0000-4000-8000-000000000105','confirmation:canonical-loss');
 if result->>'state'<>'canonical_recovery_required' or result->>'complete'<>'false' or result->>'canonicalRecoveryRequired'<>'1' then raise exception 'Repair concealed canonical generation loss'; end if;
end $loss$;
reset role;
do $no_generation$ begin
 if (select count(*) from public.studio2_confirmation_requirements where country_id='29233000-0000-4000-8000-000000000042')<>1 or exists(select 1 from public.studio2_confirmation_requirements where country_id='29233000-0000-4000-8000-000000000042' and superseded_at is null) then raise exception 'Repair invented canonical generation'; end if;
end $no_generation$;
-- Canonical response deletion owns its requirement consequence and one bounded
-- round version advance. Receipt recovery cannot fire these mechanisms twice.
select set_config('test.confirmation.delete_revision',private.v3_confirmation_response_delete_revision('29233000-0000-4000-8000-000000000061'),true);
select set_config('test.confirmation.round',(select version::text from public.studio2_confirmation_round_versions where round_id='29233000-0000-4000-8000-000000000031'),true);
set local role authenticated;
select public.admin_confirmation_delete_response('29233000-0000-4000-8000-000000000061',current_setting('test.confirmation.delete_revision'),'29233000-0000-4000-8000-000000000106','confirmation:delete');
select public.admin_confirmation_delete_response('29233000-0000-4000-8000-000000000061',current_setting('test.confirmation.delete_revision'),'29233000-0000-4000-8000-000000000106','confirmation:delete');
-- Retry a prior successful repair after its source response has disappeared.
select public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,50,'29233000-0000-4000-8000-000000000102','confirmation:repair');
reset role;
do $bounded$ begin
 if (select version from public.studio2_confirmation_round_versions where round_id='29233000-0000-4000-8000-000000000031')<>current_setting('test.confirmation.round')::bigint+1 or (select status from public.studio2_confirmation_requirements where id=current_setting('test.confirmation.req')::uuid)<>'required' then raise exception 'Delete consequence or exact retry diverged'; end if;
end $bounded$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29233000-0000-4000-8000-000000000002","session_id":"29233000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
do $denied$ begin
 begin perform public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,50,'29233000-0000-4000-8000-000000000108','confirmation:denied'); raise exception 'Unauthorized repair accepted'; exception when insufficient_privilege then null; end;
end $denied$;
reset role;
delete from public.studio2_role_assignments where user_id='29233000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29233000-0000-4000-8000-000000000001","session_id":"29233000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $capability_revoked$ begin
 begin perform public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,50,'29233000-0000-4000-8000-000000000102','confirmation:repair'); raise exception 'Revoked capability repair replay accepted'; exception when insufficient_privilege then null; end;
end $capability_revoked$;
reset role;
insert into public.studio2_role_assignments(user_id,role_key) values('29233000-0000-4000-8000-000000000001','organizer');
delete from auth.sessions where id='29233000-0000-4000-8000-000000000011';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29233000-0000-4000-8000-000000000001","session_id":"29233000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $revoked$ begin
 begin perform public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,50,'29233000-0000-4000-8000-000000000102','confirmation:repair'); raise exception 'Revoked repair replay accepted'; exception when insufficient_privilege then null; end;
end $revoked$;
set local role service_role;
do $service$ begin
 begin perform public.studio2_reconcile_confirmation_requirements('29233000-0000-4000-8000-000000000021',0,50,'29233000-0000-4000-8000-000000000109','confirmation:service'); raise exception 'Service transport became repair authority'; exception when insufficient_privilege then null; end;
end $service$;
rollback;
