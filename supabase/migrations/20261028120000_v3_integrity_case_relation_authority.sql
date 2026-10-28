begin;
select public.v3_register_migration_contract(
 'v3.integrity.case-relation-authority',1,'forward_fix_only',false,null,
 'Replace the legacy case-link upsert with a session/capability-gated command, exact relation CAS, stable operation identity, durable before/after provenance and replayable receipt.'
);
create function public.studio2_integrity_link_cases(
 p_case_id uuid,p_related_case_id uuid,p_relation_type text,p_note text,
 p_expected_case_version bigint,p_expected_relation_id uuid,p_expected_note text,
 p_operation_id uuid,p_idempotency_key text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private
as $command$
declare
 v_claim jsonb; v_case public.integrity_cases%rowtype;
 v_before public.integrity_case_relations%rowtype;
 v_after public.integrity_case_relations%rowtype;
 v_note text:=nullif(btrim(coalesce(p_note,'')),'');
 v_result jsonb;
begin
 perform private.v3_require_active_auth_session();
 if not public.studio2_access_allowed('integrity.manage',null,false) then raise exception 'Missing Solaris capability: integrity.manage' using errcode='42501'; end if;
 if p_case_id is null or p_related_case_id is null or p_case_id=p_related_case_id
    or p_relation_type is null or p_relation_type not in ('related','duplicate','corroborating','same_incident','appeal_of')
    or p_expected_case_version is null or p_expected_case_version<1 or p_operation_id is null then
  raise exception 'Invalid case relation operation' using errcode='22023';
 end if;
 v_claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,'integrity.case.link','R3',
  jsonb_build_object('caseId',p_case_id,'relatedCaseId',p_related_case_id,'relationType',p_relation_type,
   'note',v_note,'expectedCaseVersion',p_expected_case_version,
   'expectedRelationId',p_expected_relation_id,'expectedNote',p_expected_note));
 if coalesce((v_claim->>'replayed')::boolean,false) then return v_claim->'result'; end if;
 -- Lock both objects in UUID order: reciprocal links cannot deadlock. Scope is
 -- the global Integrity capability, not edition_reference (a reporter string).
 perform id from public.integrity_cases where id in (p_case_id,p_related_case_id) order by id for update;
 select * into v_case from public.integrity_cases where id=p_case_id;
 if v_case.id is null or not exists(select 1 from public.integrity_cases where id=p_related_case_id) then raise exception 'Integrity case not found' using errcode='P0002'; end if;
 if v_case.version<>p_expected_case_version then raise exception 'Case changed after review' using errcode='40001'; end if;
 select * into v_before from public.integrity_case_relations
  where case_id=p_case_id and related_case_id=p_related_case_id and relation_type=p_relation_type;
 -- Case revision alone does not version relation-note edits. Compare the exact
 -- reviewed relation identity and note while holding the canonical case lock.
 if v_before.id is distinct from p_expected_relation_id or v_before.note is distinct from p_expected_note then
  raise exception 'Case relation changed after review' using errcode='40001';
 end if;
 perform set_config('app.integrity_operation_id',p_operation_id::text,true);
 perform set_config('app.integrity_command','integrity.case.link',true);
 if v_before.id is null then
  insert into public.integrity_case_relations(case_id,related_case_id,relation_type,note,created_by)
   values(p_case_id,p_related_case_id,p_relation_type,v_note,auth.uid()) returning * into v_after;
 else
  update public.integrity_case_relations set note=v_note where id=v_before.id returning * into v_after;
 end if;
 insert into public.integrity_case_events(case_id,event_type,detail,visible_to_reporter,actor_user_id,operation_id,aggregate_version,event_metadata)
  values(p_case_id,'case.linked','Case linked as '||replace(p_relation_type,'_',' '),false,auth.uid(),p_operation_id,v_case.version,
   jsonb_build_object('previous',case when v_before.id is null then null else to_jsonb(v_before) end,'next',to_jsonb(v_after)));
 v_result:=jsonb_build_object('ok',true,'operation_id',p_operation_id,'case_id',p_case_id,'version',v_case.version,'relation',to_jsonb(v_after));
 return private.studio2_complete_operation(p_operation_id,v_result);
end
$command$;
revoke all on function public.studio2_integrity_link_cases(uuid,uuid,text,text,bigint,uuid,text,uuid,text) from public,anon,service_role;
grant execute on function public.studio2_integrity_link_cases(uuid,uuid,text,text,bigint,uuid,text,uuid,text) to authenticated;
revoke insert,update,delete,truncate on public.integrity_case_relations from public,anon,authenticated,service_role;
-- Sole repository caller is cut over in the same candidate. No database helper
-- calls this primitive; fail migration on a hidden dependency instead of CASCADE.
drop function public.admin_link_integrity_cases(uuid,uuid,text,text);
commit;
