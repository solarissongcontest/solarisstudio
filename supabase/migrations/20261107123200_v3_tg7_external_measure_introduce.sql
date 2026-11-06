begin;

-- Convert a previously recorded external message to ONE ordinary TG7 submitted
-- measure. This is a separate governed act from receiving an informal message.
-- It does not register/publish/approve the proposal, grant membership or vote.
create or replace function public.world_introduce_external_measure_v1(
  p_intake_id uuid,
  p_organ_id uuid,
  p_measure_type text,
  p_category_code text,
  p_expected_intake_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog
as $introduce$
declare
  v_intake private.world_measure_intakes%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_measure_id uuid;
  v_version_id uuid;
  v_result jsonb;
begin
  if p_intake_id is null or auth.uid() is null or p_operation_id is null
     or p_expected_intake_revision is null
     or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null then
    raise exception using errcode='22023',message='INVALID_INTAKE_INTRODUCTION'; end if;

  select * into v_intake from private.world_measure_intakes
  where id=p_intake_id for update;
  if v_intake.id is null or not public.world_access_allowed(
    'world.measure.register_external',v_intake.organization_id,null,null,null,null)
  then raise exception using errcode='42501',message='EXTERNAL_INTAKE_AUTHORIZATION'; end if;

  -- Claim before state/revision decisions so an exact completed operation
  -- may reconcile if the intake has already been introduced.
  v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.measure.external_intake.introduce','R2',
    jsonb_build_object('subjectType','world_measure_intake',
      'intakeId',v_intake.id,'organizationId',v_intake.organization_id,
      'countryId',v_intake.submitted_by_country_id),
    jsonb_build_object('organId',p_organ_id,'measureType',p_measure_type,
      'categoryCode',p_category_code,'expectedRevision',p_expected_intake_revision)
  );
  v_operation_id:=(v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      ||jsonb_build_object('replayed',true);
  end if;

  if v_intake.revision<>p_expected_intake_revision
     or v_intake.status<>'received'
     or v_intake.introduced_measure_id is not null then
    raise exception using errcode='40001',message='EXTERNAL_INTAKE_ALREADY_INTRODUCED_OR_CHANGED'; end if;
  if p_measure_type is null or p_measure_type not in (
    'proposal','bill','motion','draft_resolution','membership_application',
    'membership_expulsion','charter_amendment','rule_amendment',
    'union_recognition','procedural_motion','sanction_motion','other'
  ) then raise exception using errcode='22023',message='INVALID_MEASURE_TYPE'; end if;

  -- Hold institution and sponsor membership locks through the formal write.
  -- Merely receiving an external message does not establish eligibility.
  perform 1 from public.world_organization_organs organ
  join public.world_organizations org on org.id=organ.organization_id
  where org.id=v_intake.organization_id and organ.id=p_organ_id
    and org.status='active' and organ.status='active'
  for share of organ,org;
  if not found then raise exception using errcode='23514',message='INVALID_INTAKE_ORGAN'; end if;
  perform 1 from public.world_organization_memberships member
  where member.organization_id=v_intake.organization_id
    and member.country_id=v_intake.submitted_by_country_id
    and member.status='member' and member.joined_at<=now()
    and member.ended_at is null for share;
  if not found then raise exception using errcode='23514',message='SPONSOR_NOT_CURRENT_MEMBER'; end if;
  if p_category_code is not null and not exists(
    select 1 from public.world_measure_categories category
    where category.organization_id=v_intake.organization_id
      and category.code=p_category_code and category.active
      and (category.effective_from is null or category.effective_from<=now())
      and (category.effective_to is null or category.effective_to>now())
  ) then raise exception using errcode='22023',message='INVALID_INTAKE_CATEGORY'; end if;

  -- Never rewrite original received text or provenance. The submitted
  -- formal text is an immutable copy of the private preserved source.
  insert into public.world_measures(
    organization_id,organ_id,sponsor_country_id,measure_type,
    title,category_code,intake_id,source_channel,state,visibility
  ) values(
    v_intake.organization_id,p_organ_id,v_intake.submitted_by_country_id,
    p_measure_type,v_intake.raw_title,p_category_code,
    v_intake.id,v_intake.source_channel,'submitted','members'
  ) returning id into v_measure_id;
  insert into public.world_measure_versions(
    measure_id,version_number,title,full_text,summary,reason,content_hash
  ) values(v_measure_id,1,v_intake.raw_title,v_intake.raw_text,
    null,'external-intake',
    encode(pg_catalog.sha256(pg_catalog.convert_to(
      v_intake.raw_title||E'\n'||v_intake.raw_text||E'\n','UTF8')),'hex'))
  returning id into v_version_id;
  update public.world_measures
     set current_version_id=v_version_id
   where id=v_measure_id;

  -- Only the linkage/revision may change on the private immutable intake.
  update private.world_measure_intakes set
    status='introduced',introduced_measure_id=v_measure_id,revision=revision+1
  where id=v_intake.id and status='received'
    and revision=p_expected_intake_revision;
  if not found then raise exception using errcode='40001',message='INTAKE_CONCURRENTLY_CHANGED'; end if;

  perform private.v3_emit_domain_event(
    'world.measure.external_intake.introduced','world_measure',v_measure_id::text,1,
    v_operation_id,null,null,jsonb_build_object(
      'intakeId',v_intake.id,'measureId',v_measure_id,
      'organizationId',v_intake.organization_id,
      'countryId',v_intake.submitted_by_country_id),
    1,array[]::text[]
  );
  v_result:=jsonb_build_object('ok',true,'intakeId',v_intake.id,
    'measureId',v_measure_id,'versionId',v_version_id,
    'status','introduced','measureState','submitted',
    'revision',v_intake.revision+1,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
     ||jsonb_build_object('replayed',false);
end $introduce$;

revoke all on function public.world_introduce_external_measure_v1(
 uuid,uuid,text,text,bigint,uuid,text,uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.world_introduce_external_measure_v1(
 uuid,uuid,text,text,bigint,uuid,text,uuid)
 to authenticated,service_role;

commit;
