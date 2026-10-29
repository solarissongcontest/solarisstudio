begin;
select public.v3_register_migration_contract('v3.confirmation.requirement-command-authority',1,'forward_fix_only',false,null,'Govern reconfirmation and waiver with active actor, reviewed row CAS, request-bound durable receipt, immutable audit and atomic requirement consequences. Retire external materialization primitive.');
-- The receipt ledger and approval evidence are writable only by governed owner
-- functions. Transport credentials cannot forge a completed semantic operation.
revoke insert,update,delete,truncate on public.studio2_operation_receipts from public,anon,authenticated,service_role;
do $columns$
declare c record;
begin
 for c in select grantee,privilege_type,column_name from information_schema.column_privileges where table_schema='public' and table_name='studio2_operation_receipts' and grantee in ('PUBLIC','anon','authenticated','service_role') and privilege_type in ('INSERT','UPDATE') loop
  execute format('revoke %s (%I) on public.studio2_operation_receipts from %I',c.privilege_type,c.column_name,c.grantee);
 end loop;
end $columns$;
-- No external materialization peer remains. The reviewed apply command calls
-- this owner-only primitive in the same transaction.
revoke all on function public.admin_confirmation_ensure_requirements(uuid,uuid[]) from public,anon,authenticated,service_role;
-- Pin materialization boundaries to the same active-session and archive rules.
do $materialization$
declare signature text; d text;
begin
 foreach signature in array array['public.admin_confirmation_requirement_materialization_preview(uuid,uuid[])','public.admin_confirmation_apply_requirement_materialization(uuid,uuid[],text,uuid,text,uuid)'] loop
  d:=pg_get_functiondef(signature::regprocedure);
  d:=replace(d,E'begin\n',E'begin\n  perform private.v3_require_active_auth_session();\n');
  if signature like '%apply_requirement_materialization%' then
   d:=replace(d,'v_operation_id := (v_claim ->> ''operationId'')::uuid;', 'v_operation_id := (v_claim ->> ''operationId'')::uuid;
    perform 1 from public.studio2_edition_runtime where edition_id=p_edition_id for share;
    if exists(select 1 from public.studio2_edition_runtime where edition_id=p_edition_id and state=''archived'') then raise exception ''Archived edition workflow is read-only.'' using errcode=''42501''; end if;');
  end if;
  execute d;
 end loop;
end $materialization$;
create function private.v3_confirmation_requirement_revision(p_id uuid) returns text
language sql stable security definer set search_path=pg_catalog,public,private,extensions,pg_temp set timezone='UTC' as $revision$
 select encode(extensions.digest(to_jsonb(r)::text,'sha256'),'hex') from public.studio2_confirmation_requirements r where r.id=p_id;
$revision$;
revoke all on function private.v3_confirmation_requirement_revision(uuid) from public,anon,authenticated,service_role;
do $read_contract$
declare d text; anchor text:=$anchor$'id', requirement.id,$anchor$;
begin
 d:=pg_get_functiondef('public.admin_confirmation_requirements(uuid)'::regprocedure);
 if position(anchor in d)=0 then raise exception 'Confirmation requirement read contract drift'; end if;
 execute replace(d,anchor,anchor||E'\n' || $field$        'revision', private.v3_confirmation_requirement_revision(requirement.id),$field$);
end $read_contract$;

drop function public.admin_confirmation_reconfirm(uuid,text,uuid,text);
create function public.admin_confirmation_reconfirm(p_requirement_id uuid,p_reason text,p_operation_id uuid,p_idempotency_key text,p_expected_revision text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private,extensions,pg_temp as $command$
declare r public.studio2_confirmation_requirements%rowtype; v_reason text:=nullif(btrim(p_reason),''); claim jsonb; result jsonb; next_id uuid; state text;
begin
 perform private.v3_require_active_auth_session();
 if not private.studio2_user_has_capability(auth.uid(),'delegation.manage',null) or not private.solaris_confirmation_admin_allowed() then raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501'; end if;
 if p_requirement_id is null or p_operation_id is null or nullif(btrim(p_idempotency_key),'') is null or v_reason is null or length(v_reason)<5 or length(v_reason)>1000 or p_expected_revision is null or p_expected_revision !~ '^[a-f0-9]{64}$' then raise exception 'Requirement, reviewed revision, reason and operation identity are required' using errcode='22023'; end if;
 claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,p_operation_id,'confirmation.requirement.reconfirm','R2',jsonb_build_object('requirementId',p_requirement_id),jsonb_build_object('reason',v_reason,'expectedRevision',p_expected_revision));
 if coalesce((claim->>'replayed')::boolean,false) then
  if claim->>'status'<>'succeeded' or claim->'result' is null then raise exception 'OPERATION_PENDING'; end if;
  return (claim->'result')||jsonb_build_object('replayed',true);
 end if;
 select * into r from public.studio2_confirmation_requirements where id=p_requirement_id;
 if r.id is null then raise exception 'VERSION_CONFLICT' using errcode='PT409'; end if;
 perform pg_advisory_xact_lock(hashtextextended('studio2-confirmation-requirements:'||r.edition_id::text,0));
 select * into r from public.studio2_confirmation_requirements where id=p_requirement_id for update;
 if r.id is null or r.superseded_at is not null or private.v3_confirmation_requirement_revision(r.id) is distinct from p_expected_revision then raise exception 'VERSION_CONFLICT' using errcode='PT409'; end if;
 select rt.state into state from public.studio2_edition_runtime rt where edition_id=r.edition_id for share;
 if state='archived' then raise exception 'Archived edition workflow is read-only.' using errcode='42501'; end if;
 if r.status not in ('satisfied','waived') then raise exception 'Only a resolved requirement can require confirmation again' using errcode='23514'; end if;
 update public.studio2_confirmation_requirements set status='invalidated',invalidated_at=now(),invalidated_by=auth.uid(),invalidated_reason=v_reason,superseded_at=now(),updated_at=now() where id=r.id;
 insert into public.studio2_confirmation_requirements(edition_id,country_id,generation,status,reason,valid_from,created_by)
 values(r.edition_id,r.country_id,r.generation+1,'required','Reconfirmation required: '||v_reason,now(),auth.uid()) returning id into next_id;
 result:=jsonb_build_object('ok',true,'operationId',p_operation_id,'previousRequirementId',r.id,'requirementId',next_id,'generation',r.generation+1,'status','required');
 insert into public.admin_audit_log(actor_id,action,table_name,record_id,before_data,after_data) values(auth.uid(),'require_confirmation_again','studio2_confirmation_requirements',coalesce(next_id,r.id)::text,to_jsonb(r),result||jsonb_build_object('reason',v_reason));
 perform private.studio2_reconcile_confirmation_requirement_tasks(r.edition_id);
 perform private.studio2_complete_operation(p_operation_id,result);
 return result||jsonb_build_object('replayed',false);
end $command$;
revoke all on function public.admin_confirmation_reconfirm(uuid,text,uuid,text,text) from public,anon,service_role;
grant execute on function public.admin_confirmation_reconfirm(uuid,text,uuid,text,text) to authenticated;

drop function public.admin_confirmation_waive_requirement(uuid,text,uuid,text);
create function public.admin_confirmation_waive_requirement(p_requirement_id uuid,p_reason text,p_operation_id uuid,p_idempotency_key text,p_expected_revision text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private,extensions,pg_temp as $command$
declare r public.studio2_confirmation_requirements%rowtype; v_reason text:=nullif(btrim(p_reason),''); claim jsonb; result jsonb; next_id uuid; state text;
begin
 perform private.v3_require_active_auth_session();
 if not private.studio2_user_has_capability(auth.uid(),'delegation.manage',null) or not private.solaris_confirmation_admin_allowed() then raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501'; end if;
 if p_requirement_id is null or p_operation_id is null or nullif(btrim(p_idempotency_key),'') is null or v_reason is null or length(v_reason)<5 or length(v_reason)>1000 or p_expected_revision is null or p_expected_revision !~ '^[a-f0-9]{64}$' then raise exception 'Requirement, reviewed revision, reason and operation identity are required' using errcode='22023'; end if;
 claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,p_operation_id,'confirmation.requirement.waive','R2',jsonb_build_object('requirementId',p_requirement_id),jsonb_build_object('reason',v_reason,'expectedRevision',p_expected_revision));
 if coalesce((claim->>'replayed')::boolean,false) then
  if claim->>'status'<>'succeeded' or claim->'result' is null then raise exception 'OPERATION_PENDING'; end if;
  return (claim->'result')||jsonb_build_object('replayed',true);
 end if;
 select * into r from public.studio2_confirmation_requirements where id=p_requirement_id;
 if r.id is null then raise exception 'VERSION_CONFLICT' using errcode='PT409'; end if;
 perform pg_advisory_xact_lock(hashtextextended('studio2-confirmation-requirements:'||r.edition_id::text,0));
 select * into r from public.studio2_confirmation_requirements where id=p_requirement_id for update;
 if r.id is null or r.superseded_at is not null or private.v3_confirmation_requirement_revision(r.id) is distinct from p_expected_revision then raise exception 'VERSION_CONFLICT' using errcode='PT409'; end if;
 select rt.state into state from public.studio2_edition_runtime rt where edition_id=r.edition_id for share;
 if state='archived' then raise exception 'Archived edition workflow is read-only.' using errcode='42501'; end if;
 if r.status<>'required' then raise exception 'Only a required confirmation can be waived' using errcode='23514'; end if;
 update public.studio2_confirmation_requirements set status='waived',reason='Waived by TSBC: '||v_reason,resolved_by_submission_id=null,resolved_at=now(),updated_at=now() where id=r.id;
 result:=jsonb_build_object('ok',true,'operationId',p_operation_id,'requirementId',r.id,'generation',r.generation,'status','waived');
 insert into public.admin_audit_log(actor_id,action,table_name,record_id,before_data,after_data) values(auth.uid(),'waive_confirmation_requirement','studio2_confirmation_requirements',coalesce(next_id,r.id)::text,to_jsonb(r),result||jsonb_build_object('reason',v_reason));
 perform private.studio2_reconcile_confirmation_requirement_tasks(r.edition_id);
 perform private.studio2_complete_operation(p_operation_id,result);
 return result||jsonb_build_object('replayed',false);
end $command$;
revoke all on function public.admin_confirmation_waive_requirement(uuid,text,uuid,text,text) from public,anon,service_role;
grant execute on function public.admin_confirmation_waive_requirement(uuid,text,uuid,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
