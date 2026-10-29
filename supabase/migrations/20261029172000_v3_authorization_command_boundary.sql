begin;
select public.v3_register_migration_contract('v3.authorization.closed-command-boundary',1,'forward_fix_only',false,null,'Close legacy R3 peer, require active canonical permission actors on approval and apply, bind exact retries to all reviewed inputs, and protect approval evidence. Preserve deterministic role/version consequences behind owner-only topology.');
revoke insert,update,delete,truncate on public.studio2_permission_change_approval_requests from public,anon,authenticated,service_role;
do $columns$
declare c record;
begin
 for c in select grantee,privilege_type,column_name from information_schema.column_privileges where table_schema='public' and table_name='studio2_permission_change_approval_requests' and grantee in ('PUBLIC','anon','authenticated','service_role') and privilege_type in ('INSERT','UPDATE') loop
  execute format('revoke %s (%I) on public.studio2_permission_change_approval_requests from %I',c.privilege_type,c.column_name,c.grantee);
 end loop;
end $columns$;
-- Eight-argument R3 compatibility wrapper bypasses second-operator approval.
-- The application already uses the nine-argument reviewed command exclusively.
revoke all on function public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint) from public,anon,authenticated,service_role;
alter function public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint) set search_path=pg_catalog,public,private,auth,pg_temp;
alter function public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint) set search_path=pg_catalog,public,private,pg_temp;
-- Private bounded counters and association-derived role projection.
alter function private.ensure_country_account_hod_role() set search_path=pg_catalog,public,private,pg_temp;
alter function private.studio2_bump_permission_version(uuid) set search_path=pg_catalog,public,private,auth,pg_temp;
alter function private.studio2_ensure_permission_version(uuid) set search_path=pg_catalog,public,private,auth,pg_temp;
alter function private.studio2_lock_permission_version(uuid) set search_path=pg_catalog,public,private,auth,pg_temp;
alter function private.studio2_permission_state_version_trigger() set search_path=pg_catalog,public,private,pg_temp;
-- Historical duplicate counter chain is unattached and has no live callers.
-- Keep only the owner-only zero-baseline compatibility initializer used by the
-- invariant rehearsal; actual revisions come from the attached canonical touch.
drop function private.studio2_permission_state_version_trigger();
drop function private.studio2_bump_permission_version(uuid);
drop function private.studio2_lock_permission_version(uuid);
alter function private.studio2_touch_permission_subject_version() set search_path=pg_catalog,public,private,pg_temp;
revoke all on function private.studio2_touch_permission_subject_version() from public,anon,authenticated,service_role;
-- The core is a private implementation of the one reviewed command, not a peer
-- claim authority. Its mutation/audit/completion roll back with outer approval
-- consumption. No caller can forge the required processing receipt.
do $core$
declare d text; a integer; b integer;
begin
 d:=pg_get_functiondef('public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint)'::regprocedure);
 a:=position('  v_claim := private.studio2_claim_operation(' in d);
 b:=position('  v_operation_id := (v_claim ->> ''operationId'')::uuid;' in d);
 if a=0 or b=0 or b<a then raise exception 'Permission core claim contract drift'; end if;
 d:=overlay(d placing $replacement$
  v_operation_id:=p_operation_id;
  if not exists(select 1 from public.studio2_operation_receipts where operation_id=p_operation_id and actor_id=auth.uid() and command='permissions.'||p_change_kind and status='processing') then
   raise exception 'Permission core requires the canonical reviewed command' using errcode='42501';
  end if;
$replacement$ from a for b-a+length('  v_operation_id := (v_claim ->> ''operationId'')::uuid;'));
 execute d;
end $core$;
revoke all on function public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint) from public,anon,authenticated,service_role;
-- Every public mutation validates live session/capability before readback.
do $commands$
declare f record; d text; a integer; b integer;
begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname in ('studio2_approve_permission_change','studio2_request_permission_change_approval') or (p.proname='studio2_apply_permission_change_r3' and p.pronargs=9)) loop
  d:=pg_get_functiondef(f.oid);
  d:=replace(d,E'begin\n',$active$begin
  perform private.v3_require_active_auth_session();
  if not private.studio2_user_has_capability(auth.uid(),'permissions.manage',null) then raise exception 'Permission management capability required' using errcode='42501'; end if;
$active$);
  if f.proname='studio2_apply_permission_change_r3' then
   d:=replace(d,'  v_existing public.studio2_operation_receipts;','  v_existing public.studio2_operation_receipts; v_claim jsonb;');
   a:=position('  select receipt.*' in d);
   b:=position('  if p_approval_request_id is null then' in d);
   if a=0 or b=0 or b<a then raise exception 'Permission R3 readback contract drift'; end if;
   d:=overlay(d placing $replacement$
  -- Prior successful R3 receipts used a scope-only fingerprint. Recover them
  -- through the consumed immutable second-operator request that binds every
  -- semantic input. This is readback only; it cannot execute a new mutation.
  select * into v_existing from public.studio2_operation_receipts where operation_id=p_operation_id and actor_id=auth.uid();
  if v_existing.status='succeeded' and v_existing.scope ? 'affectedCapabilities' then
   if v_existing.command is distinct from 'permissions.'||p_change_kind or v_existing.idempotency_key is distinct from p_idempotency_key or not exists(
    select 1 from public.studio2_permission_change_approval_requests a where a.id=p_approval_request_id and a.operation_id=p_operation_id and a.requested_by=auth.uid() and a.consumed_at is not null and a.approved_by is not null and a.approved_by<>a.requested_by and a.idempotency_key=p_idempotency_key and a.target_user_id=p_user_id and a.change_kind=p_change_kind and a.permission_key=p_key and a.edition_id is not distinct from p_edition_id and a.access_expires_at is not distinct from p_expires_at and a.expected_version=p_expected_version
   ) then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='P0001'; end if;
   return v_existing.result;
  end if;
  v_claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,p_operation_id,'permissions.'||p_change_kind,'R3',jsonb_build_object('targetUserId',p_user_id,'editionId',p_edition_id),jsonb_build_object('changeKind',p_change_kind,'key',p_key,'expiresAt',p_expires_at,'expectedVersion',p_expected_version,'approvalRequestId',p_approval_request_id));
  if coalesce((v_claim->>'replayed')::boolean,false) then
   if v_claim->>'status'<>'succeeded' or v_claim->'result' is null then raise exception 'OPERATION_PENDING'; end if;
   return v_claim->'result';
  end if;
$replacement$ from a for b-a);
  end if;
  execute d;
  execute format('alter function %s set search_path=pg_catalog,public,private,auth,pg_temp',f.oid::regprocedure);
  execute format('alter function %s set timezone=''UTC''',f.oid::regprocedure);
  execute format('revoke all on function %s from public,anon,service_role',f.oid::regprocedure);
 end loop;
end $commands$;
commit;
