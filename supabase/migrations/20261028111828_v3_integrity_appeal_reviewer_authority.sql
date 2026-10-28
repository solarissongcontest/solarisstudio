begin;
select public.v3_register_migration_contract(
  'v3.integrity.appeal-reviewer-authority',1,'forward_fix_only',false,null,
  'Resolve appeal reviewer eligibility from canonical permission capability, never retired user_roles. Preserve active-appeal CAS, independent reviewer constraints, exact operation replay, atomic history and receipt; require canonical live-session admission before assignment.'
);
create or replace function public.studio2_integrity_assign_appeal_reviewer(
  p_appeal_id uuid, p_user_id uuid, p_operation_id uuid, p_idempotency_key text, p_expected_version bigint
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, private, auth
as $assign$
declare
  v_claim jsonb;
  v_operation uuid;
  v_appeal public.integrity_case_appeals%rowtype;
  v_sanction_creator uuid;
  v_finding_creator uuid;
  v_result jsonb;
begin
  perform private.v3_require_active_auth_session();
  if not public.studio2_access_allowed('integrity.sanction', null, false) then
    raise exception 'Missing Solaris capability: integrity.sanction' using errcode='42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Operation id and expected appeal version are required' using errcode='22023';
  end if;
  if p_user_id is null or not private.studio2_user_has_capability(p_user_id,'integrity.sanction',null) then
    raise exception 'Appeal reviewer requires canonical Integrity sanction authority' using errcode='42501';
  end if;
  v_claim := private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,'integrity.appeal.assign_reviewer','R3',
    jsonb_build_object('appealId',p_appeal_id,'userId',p_user_id,'expectedVersion',p_expected_version)
  );
  if coalesce((v_claim->>'replayed')::boolean,false) then return v_claim->'result'; end if;
  v_operation := (v_claim->>'operationId')::uuid;
  select * into v_appeal from public.integrity_case_appeals where id=p_appeal_id for update;
  if v_appeal.id is null then raise exception 'Appeal not found' using errcode='P0002'; end if;
  if v_appeal.version <> p_expected_version then raise exception 'Appeal changed since it was loaded. Refresh before continuing.' using errcode='40001'; end if;
  if v_appeal.status not in ('submitted','under_review') then raise exception 'Only an active appeal may be assigned' using errcode='23514'; end if;
  select s.created_by,f.created_by into v_sanction_creator,v_finding_creator
  from public.integrity_case_sanctions s join public.integrity_case_findings f on f.id=s.finding_id
  where s.id=v_appeal.sanction_id and s.case_id=v_appeal.case_id;
  if v_sanction_creator is null then raise exception 'Appeal sanction/case mismatch' using errcode='23514'; end if;
  if p_user_id=v_appeal.submitted_by_user_id then raise exception 'The appeal submitter cannot review their own appeal' using errcode='42501'; end if;
  if p_user_id=v_sanction_creator then raise exception 'The original sanction decision-maker cannot be the appeal reviewer' using errcode='42501'; end if;
  if p_user_id=v_finding_creator then raise exception 'The original finding decision-maker cannot be the appeal reviewer' using errcode='42501'; end if;
  perform set_config('app.integrity_operation_id',v_operation::text,true);
  perform set_config('app.integrity_command','integrity.appeal.assign_reviewer',true);
  update public.integrity_case_appeals set assigned_reviewer=p_user_id,
    status=case when status='submitted' then 'under_review' else status end where id=p_appeal_id;
  insert into public.integrity_case_reviewers(case_id,user_id,review_role,assigned_by)
  values(v_appeal.case_id,p_user_id,'appeal_reviewer',auth.uid())
  on conflict(case_id,user_id,review_role) do update set assigned_by=excluded.assigned_by,
    assigned_at=now(),recused_at=null,recusal_reason=null;
  select * into v_appeal from public.integrity_case_appeals where id=p_appeal_id;
  v_result := jsonb_build_object('ok',true,'appeal_id',p_appeal_id,'status',v_appeal.status,
    'version',v_appeal.version,'operation_id',v_operation);
  return private.studio2_complete_operation(v_operation,v_result);
end
$assign$;
revoke all on function public.studio2_integrity_assign_appeal_reviewer(uuid,uuid,uuid,text,bigint) from public,anon;
grant execute on function public.studio2_integrity_assign_appeal_reviewer(uuid,uuid,uuid,text,bigint) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
