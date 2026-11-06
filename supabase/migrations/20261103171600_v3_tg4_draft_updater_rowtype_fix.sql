begin;

-- Forward repair of existing TG4 single-writer draft updater. Preserve the
-- canonical function signature, claim-operation contract, revision CAS,
-- provenance and provision transactions. Do not create a second draft writer.
create or replace function public.world_update_document_version_draft_v1(
  p_version_id uuid,
  p_title text,
  p_structured_content jsonb,
  p_plain_text text,
  p_effective_from timestamptz,
  p_effective_to timestamptz,
  p_source_description text,
  p_source_provenance jsonb,
  p_provisions jsonb,
  p_expected_version_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $update_draft$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_version public.world_document_versions%rowtype;
  v_document public.world_documents%rowtype;
  v_new_revision bigint;
  v_result jsonb;
begin
  -- A %rowtype target must receive exactly the table's own fields;
  -- joining organization_id here produces one extra column.
  select version_row.* into v_version
  from public.world_document_versions version_row
  where version_row.id = p_version_id;
  select document_row.* into v_document
  from public.world_documents document_row
  join public.world_document_versions version_row on version_row.document_id = document_row.id
  where version_row.id = p_version_id;

  if v_version.id is null
     or not public.world_access_allowed('world.document.manage', v_document.organization_id, null, null, 'document', v_document.id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if private.world_document_actor_person_v1(v_document.organization_id) is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  perform private.world_document_validate_provision_payload(coalesce(p_provisions, '[]'::jsonb));
  if p_expected_version_revision is null
     or nullif(btrim(coalesce(p_title,'')), '') is null
     or jsonb_typeof(coalesce(p_structured_content, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_source_provenance, '{}'::jsonb)) <> 'object'
     or (p_effective_to is not null and (p_effective_from is null or p_effective_to <= p_effective_from)) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'world.document.version.update_draft',
    'R2',
    jsonb_build_object('organizationId', v_document.organization_id, 'documentId', v_document.id, 'versionId', p_version_id, 'subjectType', 'world_document_version'),
    jsonb_build_object(
      'versionId', p_version_id,
      'title', btrim(p_title),
      'structuredContent', coalesce(p_structured_content, '{}'::jsonb),
      'plainText', coalesce(p_plain_text, ''),
      'effectiveFrom', p_effective_from,
      'effectiveTo', p_effective_to,
      'sourceDescription', p_source_description,
      'sourceProvenance', coalesce(p_source_provenance, '{}'::jsonb),
      'provisions', coalesce(p_provisions, '[]'::jsonb),
      'expectedVersionRevision', p_expected_version_revision
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', true);
  end if;

  perform private.studio2_require_fresh_auth(300);

  select * into v_version
  from public.world_document_versions
  where id = p_version_id
  for update;
  if not public.world_access_allowed(
       'world.document.manage', v_document.organization_id, null, null,
       'document', v_document.id
     ) or private.world_document_actor_person_v1(v_document.organization_id) is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if v_version.publication_state <> 'draft' then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;
  if v_version.revision is distinct from p_expected_version_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  v_new_revision := v_version.revision + 1;
  update public.world_document_versions
  set title = btrim(p_title),
      structured_content = coalesce(p_structured_content, '{}'::jsonb),
      plain_text = coalesce(p_plain_text, ''),
      effective_from = p_effective_from,
      effective_to = p_effective_to,
      source_description = p_source_description,
      source_provenance = coalesce(p_source_provenance, '{}'::jsonb),
      revision = v_new_revision,
      updated_at = now()
  where id = p_version_id;

  perform private.world_document_replace_draft_provisions(v_version.document_id, p_version_id, p_provisions);

  v_result := jsonb_build_object(
    'ok', true,
    'documentId', v_version.document_id,
    'versionId', p_version_id,
    'versionRevision', v_new_revision,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', false);
end
$update_draft$;

comment on function public.world_update_document_version_draft_v1(
  uuid,text,jsonb,text,timestamptz,timestamptz,text,jsonb,jsonb,bigint,uuid,text,uuid
) is 'TG4 R2 canonical revision-safe document draft replacement; lossless manager-only source provenance, fresh institutional authorization, immutable published history.';

commit;
