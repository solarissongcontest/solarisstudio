begin;

-- TG4: prepare only the effective instant of an already-governed draft.
-- Never call the full draft replacement RPC merely to change a date: the
-- public manager projection intentionally omits sensitive source provenance.
-- This keeps legal content, provision identity and provenance byte-for-byte
-- unchanged. The separate R3 publication command remains the only publisher.
create or replace function public.world_set_document_draft_effective_date_v1(
  p_version_id uuid,
  p_effective_from timestamptz,
  p_expected_version_revision bigint,
  p_operation_id uuid,
  p_idempotency_key text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $effective_date$
declare
  v_version public.world_document_versions%rowtype;
  v_document public.world_documents%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_new_revision bigint;
  v_result jsonb;
begin
  if p_version_id is null or p_effective_from is null
     or p_expected_version_revision is null or p_expected_version_revision < 1 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_version
  from public.world_document_versions
  where id = p_version_id;
  if v_version.id is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  select * into v_document
  from public.world_documents
  where id = v_version.document_id;
  if v_document.id is null
     or not public.world_access_allowed(
       'world.document.manage', v_document.organization_id, null, null,
       'document', v_document.id
     )
     or private.world_document_actor_person_v1(v_document.organization_id) is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'world.document.version.effective_date.set',
    'R2',
    jsonb_build_object(
      'organizationId', v_document.organization_id,
      'documentId', v_document.id,
      'versionId', p_version_id,
      'subjectType', 'world_document_version'
    ),
    jsonb_build_object(
      'versionId', p_version_id,
      'effectiveFrom', p_effective_from,
      'expectedVersionRevision', p_expected_version_revision
    )
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform private.studio2_require_fresh_auth(300);

  -- Both the document and its version are locked. A simultaneous new
  -- published version cannot change the effective predecessor unnoticed.
  select * into v_document
  from public.world_documents
  where id = v_version.document_id
  for update;
  select * into v_version
  from public.world_document_versions
  where id = p_version_id and document_id = v_document.id
  for update;

  -- Re-evaluate mutable capability and durable actor after taking locks.
  -- Initial identity validation alone cannot authorize a stale prepared action.
  if not public.world_access_allowed(
      'world.document.manage', v_document.organization_id, null, null,
      'document', v_document.id
    ) or private.world_document_actor_person_v1(v_document.organization_id) is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if v_version.id is null or v_version.publication_state <> 'draft'
     or v_version.effective_to is not null then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;
  if v_version.revision is distinct from p_expected_version_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;
  if v_version.version_number is distinct from (
    select max(version_number)
    from public.world_document_versions
    where document_id = v_document.id
  ) then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;
  if exists (
    select 1
    from public.world_document_versions previous_version
    where previous_version.id = v_document.current_version_id
      and previous_version.effective_from is not null
      and p_effective_from <= previous_version.effective_from
  ) then
    raise exception using errcode = '22023', message = 'EFFECTIVE_DATE_NOT_AFTER_CURRENT_VERSION';
  end if;

  v_new_revision := v_version.revision + 1;
  update public.world_document_versions
  set effective_from = p_effective_from,
      revision = v_new_revision,
      updated_at = now()
  where id = p_version_id;

  v_result := jsonb_build_object(
    'ok', true,
    'documentId', v_document.id,
    'versionId', p_version_id,
    'versionRevision', v_new_revision,
    'effectiveFrom', p_effective_from,
    'operationId', v_operation_id
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$effective_date$;

revoke all on function public.world_set_document_draft_effective_date_v1(
  uuid,timestamptz,bigint,uuid,text,uuid
) from public, anon, authenticated;
grant execute on function public.world_set_document_draft_effective_date_v1(
  uuid,timestamptz,bigint,uuid,text,uuid
) to authenticated;

comment on function public.world_set_document_draft_effective_date_v1(
  uuid,timestamptz,bigint,uuid,text,uuid
) is 'TG4 R2 governed effective-instant preparation; updates only an authorized mutable draft with version CAS and durable operation receipt.';

commit;
