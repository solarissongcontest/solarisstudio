begin;
select public.v3_register_migration_contract(
 'v3.integrity.register-evidence-authority',1,'forward_fix_only',false,null,
 'Retire the unversioned Organizer evidence RPC; canonical registration validates live session, capability and case revision, persists evidence and provenance atomically, and recovers exact operation retries.'
);
create function public.studio2_integrity_register_evidence(
 p_case_id uuid,p_evidence_type text,p_title text,p_description text,p_external_url text,
 p_visible_to_reporter boolean,p_expected_case_version bigint,p_operation_id uuid,p_idempotency_key text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private
as $command$
declare
 v_case public.integrity_cases%rowtype; v_evidence public.integrity_case_evidence%rowtype;
 v_claim jsonb; v_result jsonb;
 v_title text:=nullif(btrim(coalesce(p_title,'')),'');
 v_description text:=nullif(btrim(coalesce(p_description,'')),'');
 v_url text:=nullif(btrim(coalesce(p_external_url,'')),'');
begin
 perform private.v3_require_active_auth_session();
 if not public.studio2_access_allowed('integrity.manage',null,false) then raise exception 'Missing Solaris capability: integrity.manage' using errcode='42501'; end if;
 if p_case_id is null or p_evidence_type is null or p_evidence_type not in ('url','text','voting_analysis','statement')
    or v_title is null or p_visible_to_reporter is null or p_expected_case_version is null or p_expected_case_version<1 or p_operation_id is null then
  raise exception 'Invalid evidence registration' using errcode='22023';
 end if;
 v_claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,'integrity.case.register_evidence','R3',
  jsonb_build_object('caseId',p_case_id,'evidenceType',p_evidence_type,'title',v_title,
   'description',v_description,'externalUrl',v_url,'visibleToReporter',p_visible_to_reporter,'expectedCaseVersion',p_expected_case_version));
 if coalesce((v_claim->>'replayed')::boolean,false) then return v_claim->'result'; end if;
 select * into v_case from public.integrity_cases where id=p_case_id for update;
 if v_case.id is null then raise exception 'Integrity case not found' using errcode='P0002'; end if;
 if v_case.version<>p_expected_case_version then raise exception 'Case changed after evidence review' using errcode='40001'; end if;
 perform set_config('app.integrity_operation_id',p_operation_id::text,true);
 perform set_config('app.integrity_command','integrity.case.register_evidence',true);
 insert into public.integrity_case_evidence(case_id,source_role,evidence_type,title,description,external_url,visible_to_reporter,created_by)
  values(p_case_id,'tsbc',p_evidence_type,v_title,v_description,v_url,p_visible_to_reporter,auth.uid()) returning * into v_evidence;
 insert into public.integrity_case_events(case_id,event_type,detail,visible_to_reporter,actor_user_id,operation_id,aggregate_version,event_metadata)
  values(p_case_id,'evidence.added','TSBC added evidence: '||v_title,p_visible_to_reporter,auth.uid(),p_operation_id,v_case.version,
   jsonb_build_object('evidenceId',v_evidence.id,'evidenceType',p_evidence_type,'visibleToReporter',p_visible_to_reporter));
 v_result:=jsonb_build_object('ok',true,'case_id',p_case_id,'version',v_case.version,'evidence_id',v_evidence.id,'operation_id',p_operation_id);
 return private.studio2_complete_operation(p_operation_id,v_result);
end
$command$;
revoke all on function public.studio2_integrity_register_evidence(uuid,text,text,text,text,boolean,bigint,uuid,text) from public,anon,service_role;
grant execute on function public.studio2_integrity_register_evidence(uuid,text,text,text,text,boolean,bigint,uuid,text) to authenticated;
drop function public.admin_register_integrity_evidence(uuid,text,text,text,text,boolean);
commit;
