begin;
select public.v3_register_migration_contract('v3.confirmation.repair-runtime-boundary',1,'forward_fix_only',false,null,'Govern bounded canonical-source requirement repair with active scoped authority, stable request identity, atomic task consequences, audit and durable receipt. Preserve requirement revisions on no-op reconciliation and retain canonical-generation loss guards.');
-- Reconciliation must not invalidate an unchanged reviewed revision.
do $idempotent$
declare definition text; anchor text:=E'    where id = v_requirement.id;\n  elsif';
begin
 definition:=pg_get_functiondef('private.studio2_reconcile_confirmation_requirement(uuid,uuid)'::regprocedure);
 if position(anchor in definition)=0 then raise exception 'Requirement reconciliation implementation drift'; end if;
 execute replace(definition,anchor,$guard$    where id = v_requirement.id
      and (status, resolved_by_submission_id, resolved_at) is distinct from
          (case when v_submission.participating then 'satisfied' else 'waived' end,
           v_submission.id, coalesce(v_submission.updated_at,v_submission.submitted_at));
  elsif$guard$);
end $idempotent$;
-- Keep the proven 50/500 bounds and inability to invent a missing generation.
-- The old service-role endpoint becomes an inaccessible implementation.
alter function public.studio2_reconcile_confirmation_requirements(uuid,integer,integer) rename to v3_reconcile_confirmation_requirements_core;
alter function public.v3_reconcile_confirmation_requirements_core(uuid,integer,integer) set schema private;
alter function private.v3_reconcile_confirmation_requirements_core(uuid,integer,integer) set search_path=pg_catalog,public,private,pg_temp;
revoke all on function private.v3_reconcile_confirmation_requirements_core(uuid,integer,integer) from public,anon,authenticated,service_role;
create function public.studio2_reconcile_confirmation_requirements(p_edition_id uuid,p_offset integer,p_limit integer,p_operation_id uuid,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp set timezone='UTC' as $repair$
declare claim jsonb; result jsonb; before_hash text; after_hash text;
begin
 perform private.v3_require_active_auth_session();
 if not private.studio2_user_has_capability(auth.uid(),'delegation.manage',p_edition_id) then raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501'; end if;
 if p_edition_id is null or p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>50 or p_operation_id is null or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Edition, bounded repair page and operation identity are required' using errcode='22023'; end if;
 claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,p_operation_id,'confirmation.requirement.reconcile','R2',jsonb_build_object('editionId',p_edition_id),jsonb_build_object('offset',p_offset,'limit',p_limit));
 if coalesce((claim->>'replayed')::boolean,false) then
  if claim->>'status'<>'succeeded' or claim->'result' is null then raise exception 'OPERATION_PENDING'; end if;
  return (claim->'result')||jsonb_build_object('replayed',true);
 end if;
 -- Serialize with materialization, waiver and explicit reconfirmation. The
 -- caller supplies no replacement status, generation or authoritative version.
 perform pg_advisory_xact_lock(hashtextextended('studio2-confirmation-requirements:'||p_edition_id::text,0));
 perform 1 from public.studio2_edition_runtime where edition_id=p_edition_id for share;
 if exists(select 1 from public.studio2_edition_runtime where edition_id=p_edition_id and state='archived') then raise exception 'Archived edition workflow is read-only.' using errcode='42501'; end if;
 select encode(extensions.digest(coalesce(jsonb_agg(snapshot.row order by snapshot.row->>'country_id',(snapshot.row->>'generation')::integer,snapshot.row->>'id')::text,'[]'),'sha256'),'hex') into before_hash from (select to_jsonb(r) row from public.studio2_confirmation_requirements r where edition_id=p_edition_id order by country_id,generation,id limit 501) snapshot;
 result:=private.v3_reconcile_confirmation_requirements_core(p_edition_id,p_offset,p_limit);
 if result->>'reason' is distinct from 'repair_candidate_limit_exceeded' then
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
 end if;
 select encode(extensions.digest(coalesce(jsonb_agg(snapshot.row order by snapshot.row->>'country_id',(snapshot.row->>'generation')::integer,snapshot.row->>'id')::text,'[]'),'sha256'),'hex') into after_hash from (select to_jsonb(r) row from public.studio2_confirmation_requirements r where edition_id=p_edition_id order by country_id,generation,id limit 501) snapshot;
 result:=result||jsonb_build_object('operationId',p_operation_id,'observedBeforeHash',before_hash,'observedAfterHash',after_hash,'changed',before_hash is distinct from after_hash);
 insert into public.admin_audit_log(actor_id,action,table_name,record_id,before_data,after_data) values(auth.uid(),'confirmation_requirements_reconciled','studio2_confirmation_requirements',p_edition_id::text,jsonb_build_object('observedHash',before_hash),result);
 perform private.studio2_complete_operation(p_operation_id,result);
 return result||jsonb_build_object('replayed',false);
end $repair$;
revoke all on function public.studio2_reconcile_confirmation_requirements(uuid,integer,integer,uuid,text) from public,anon,service_role;
grant execute on function public.studio2_reconcile_confirmation_requirements(uuid,integer,integer,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
