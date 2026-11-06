begin;

-- Recording an external message is NOT a formal measure and confers no rights.
-- All records remain private to authorized institution intake officers.
create or replace function public.world_record_external_intake_v1(
  p_organization_id uuid,
  p_submitted_by_country_id uuid,
  p_source_channel text,
  p_source_reference text,
  p_raw_title text,
  p_raw_text text,
  p_source_note text,
  p_raw_attachments jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog
as $record_intake$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_id uuid;
  v_result jsonb;
  v_hash text;
  v_attachments jsonb:=coalesce(p_raw_attachments,'[]'::jsonb);
begin
  if auth.uid() is null or p_organization_id is null or
     not public.world_access_allowed(
       'world.measure.register_external',p_organization_id,null,null,null,null)
  then raise exception using errcode='42501',message='EXTERNAL_INTAKE_AUTHORIZATION'; end if;
  if p_source_channel not in ('dm','instagram','other')
     or nullif(btrim(coalesce(p_raw_title,'')),'') is null
     or length(btrim(p_raw_title))>180
     or nullif(btrim(coalesce(p_raw_text,'')),'') is null
     or length(btrim(p_raw_text))>25000
     or length(coalesce(p_source_reference,''))>500
     or length(coalesce(p_source_note,''))>2000
     or jsonb_typeof(v_attachments)<>'array'
     or jsonb_array_length(v_attachments)>20
     or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key,'')),'') is null
  then raise exception using errcode='22023',message='INVALID_EXTERNAL_INTAKE'; end if;
  perform 1 from public.world_organizations org
  where org.id=p_organization_id and org.status='active' for share;
  if not found then raise exception using errcode='23514',message='INACTIVE_INSTITUTION'; end if;
  perform 1 from public.countries country where country.id=p_submitted_by_country_id for share;
  if not found then raise exception using errcode='23503',message='UNKNOWN_COUNTRY'; end if;

  v_hash:=encode(pg_catalog.sha256(pg_catalog.convert_to(
    p_organization_id::text||E'\n'||p_submitted_by_country_id::text||E'\n'||
    p_source_channel||E'\n'||coalesce(p_source_reference,'')||E'\n'||
    btrim(p_raw_title)||E'\n'||btrim(p_raw_text)||E'\n'||
    coalesce(p_source_note,'')||E'\n'||v_attachments::text,'UTF8'
  )),'hex');

  v_claim:=private.studio2_claim_operation(
    p_operation_id,p_idempotency_key,coalesce(p_correlation_id,p_operation_id),
    'world.measure.external_intake.record','R2',
    jsonb_build_object('subjectType','world_measure_intake',
      'organizationId',p_organization_id,'countryId',p_submitted_by_country_id),
    jsonb_build_object('sourceChannel',p_source_channel,
      'sourceReference',p_source_reference,'rawTitle',btrim(p_raw_title),
      'rawText',btrim(p_raw_text),'sourceNote',p_source_note,
      'attachments',v_attachments,'sourceHash',v_hash)
  );
  v_operation_id:=(v_claim->>'operationId')::uuid;
  if coalesce((v_claim->>'replayed')::boolean,false) then
    return public.studio2_reconcile_operation(v_operation_id)
      ||jsonb_build_object('replayed',true);
  end if;

  insert into private.world_measure_intakes(
    organization_id,submitted_by_country_id,source_channel,
    source_reference,received_by_user_id,raw_title,raw_text,
    raw_attachments,source_note,content_hash
  ) values(
    p_organization_id,p_submitted_by_country_id,p_source_channel,
    nullif(btrim(coalesce(p_source_reference,'')),''),
    auth.uid(),btrim(p_raw_title),btrim(p_raw_text),
    v_attachments,nullif(btrim(coalesce(p_source_note,'')),''),v_hash
  ) returning id into v_id;

  -- No raw DM text, URLs, attachments or private actor ID in event payload.
  perform private.v3_emit_domain_event(
    'world.measure.external_intake.received','world_measure_intake',
    v_id::text,1,v_operation_id,null,null,
    jsonb_build_object('intakeId',v_id,'organizationId',p_organization_id,
      'sourceChannel',p_source_channel,'contentHash',v_hash),
    1,array[]::text[]
  );
  v_result:=jsonb_build_object('ok',true,'intakeId',v_id,
    'organizationId',p_organization_id,'status','received','revision',1,
    'contentHash',v_hash,'operationId',v_operation_id);
  perform private.studio2_complete_operation(v_operation_id,v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    ||jsonb_build_object('replayed',false);
end $record_intake$;

revoke all on function public.world_record_external_intake_v1(
  uuid,uuid,text,text,text,text,text,jsonb,uuid,text,uuid)
from public,anon,authenticated,service_role;
grant execute on function public.world_record_external_intake_v1(
  uuid,uuid,text,text,text,text,text,jsonb,uuid,text,uuid)
to authenticated,service_role;

commit;
