begin;
select public.v3_register_migration_contract('v3.archive.runtime-mechanism-boundary',1,'forward_fix_only',false,null,'Prove archive guards and legacy-status projection behind the canonical lifecycle command; close service-role execution and require live actor sessions on lifecycle and Confirmation binding commands.');

create or replace function public.studio2_transition_edition_v3(p_edition_id uuid,p_to text,p_reason text,p_approval_request_id uuid,p_expected_version bigint,p_operation_id uuid,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private,auth,pg_temp as $transition$
begin
 perform private.v3_require_active_auth_session();
 if p_to='archived' then perform private.v3_arm_archive_runtime_transition_gate(p_edition_id); end if;
 return private.studio2_transition_edition_v3(p_edition_id,p_to,p_reason,p_approval_request_id,p_expected_version,p_operation_id,p_idempotency_key);
end $transition$;
revoke all on function public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text) from public,anon,service_role;
grant execute on function public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text) to authenticated;
alter function private.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text) set search_path=pg_catalog,public,private,auth,pg_temp;
revoke all on function private.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text) from public,anon,authenticated,service_role;

-- The existing binding command already owns CAS, S2 fingerprint/receipt,
-- canonical readback and R3 freshness. Enforce session liveness on exact retry
-- too, before either state inspection or operation readback.
do $binding$
declare d text; anchor text:=E'begin\n  if p_edition_id is null';
begin
 d:=pg_get_functiondef('public.studio2_apply_confirmation_edition_binding_change(uuid,text,boolean,uuid,text,bigint,uuid)'::regprocedure);
 if position(anchor in d)=0 then raise exception 'Confirmation binding command upgrade precondition changed'; end if;
 execute replace(d,anchor,E'begin\n  perform private.v3_require_active_auth_session();\n  if p_edition_id is null');
end $binding$;
alter function public.studio2_apply_confirmation_edition_binding_change(uuid,text,boolean,uuid,text,bigint,uuid) set search_path=pg_catalog,public,private,auth,pg_temp;
revoke all on function public.studio2_apply_confirmation_edition_binding_change(uuid,text,boolean,uuid,text,bigint,uuid) from public,anon,service_role;
grant execute on function public.studio2_apply_confirmation_edition_binding_change(uuid,text,boolean,uuid,text,bigint,uuid) to authenticated;

alter function private.v3_guard_archived_legacy_edition_status() set search_path=pg_catalog,public,private,pg_temp;
alter function private.v3_guard_archive_runtime_transition() set search_path=pg_catalog,private,pg_temp;
alter function private.v3_sync_archived_edition_legacy_status() set search_path=pg_catalog,public,private,pg_temp;
revoke all on function private.v3_guard_archived_legacy_edition_status() from public,anon,authenticated,service_role;
revoke all on function private.v3_guard_archive_runtime_transition() from public,anon,authenticated,service_role;
revoke all on function private.v3_sync_archived_edition_legacy_status() from public,anon,authenticated,service_role;
commit;
