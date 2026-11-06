begin;

-- Manager-only legal provenance needed for lossless draft round-tripping.
-- Public/non-manager readers receive NULL, never source files or editorial
-- attribution details. Existing world_get_document_v1 RLS/authorization,
-- version filtering and published/protected text rules remain unchanged.
create or replace function public.world_get_document_v1(
  p_organization_slug text,
  p_document_slug text,
  p_version_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $document$
declare
  v_document public.world_documents%rowtype;
  v_organization public.world_organizations%rowtype;
  v_version public.world_document_versions%rowtype;
  v_can_manage boolean := false;
  v_provisions jsonb;
  v_history jsonb;
  v_actions jsonb;
begin
  select document_row.*, organization_row.*
  into v_document, v_organization
  from public.world_documents document_row
  join public.world_organizations organization_row on organization_row.id = document_row.organization_id
  where organization_row.slug = p_organization_slug
    and document_row.slug = p_document_slug
  limit 1;

  if v_document.id is null or not private.world_document_can_read_v1(v_document.id) then
    return null;
  end if;
  v_can_manage := private.world_document_can_manage_v1(v_document.id);

  if p_version_number is null then
    if v_document.current_version_id is not null then
      select * into v_version
      from public.world_document_versions
      where id = v_document.current_version_id;
    elsif v_can_manage then
      select * into v_version
      from public.world_document_versions
      where document_id = v_document.id
      order by version_number desc
      limit 1;
    end if;
  else
    select * into v_version
    from public.world_document_versions
    where document_id = v_document.id
      and version_number = p_version_number;
  end if;

  if v_version.id is not null
     and v_version.publication_state = 'draft'
     and not v_can_manage then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'provisionId', provision_row.id,
    'semanticKey', provision_row.semantic_key,
    'parentSemanticKey', parent_row.semantic_key,
    'displayLabel', version_provision.display_label,
    'heading', version_provision.heading,
    'bodyStructured', version_provision.body_structured,
    'bodyPlainText', version_provision.body_plain_text,
    'sortOrder', version_provision.sort_order,
    'anchor', version_provision.anchor,
    'status', version_provision.version_status
  ) order by version_provision.sort_order, provision_row.semantic_key), '[]'::jsonb)
  into v_provisions
  from public.world_document_version_provisions version_provision
  join public.world_document_provisions provision_row on provision_row.id = version_provision.provision_id
  left join public.world_document_provisions parent_row on parent_row.id = version_provision.parent_provision_id
  where version_provision.document_version_id = v_version.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'versionId', history_row.id,
    'versionNumber', history_row.version_number,
    'title', history_row.title,
    'publicationState', history_row.publication_state,
    'effectiveFrom', history_row.effective_from,
    'effectiveTo', history_row.effective_to,
    'publishedAt', history_row.published_at,
    'contentHash', history_row.content_hash,
    'recordClass', history_row.record_class,
    'supersedesVersionId', history_row.supersedes_version_id,
    'supersededByVersionId', history_row.superseded_by_version_id
  ) order by history_row.version_number desc), '[]'::jsonb)
  into v_history
  from public.world_document_versions history_row
  where history_row.document_id = v_document.id
    and (
      history_row.publication_state in ('published','superseded','historical_source')
      or (v_can_manage and history_row.publication_state = 'draft')
    );

  v_actions := jsonb_build_object(
    'manage', v_can_manage,
    'publish', case when auth.uid() is null then false else
      public.world_access_allowed('world.document.publish', v_document.organization_id, null, null, 'document', v_document.id)
    end
  );

  return jsonb_build_object(
    'documentId', v_document.id,
    'organization', jsonb_build_object(
      'organizationId', v_organization.id,
      'slug', v_organization.slug,
      'officialName', v_organization.official_name,
      'shortName', v_organization.short_name
    ),
    'slug', v_document.slug,
    'documentType', v_document.document_type,
    'title', v_document.title,
    'status', v_document.status,
    'visibility', v_document.visibility,
    'recordClass', v_document.record_class,
    'revision', case when v_can_manage then v_document.revision else null end,
    'version', case when v_version.id is null then null else jsonb_build_object(
      'versionId', v_version.id,
      'versionNumber', v_version.version_number,
      'title', v_version.title,
      'structuredContent', v_version.structured_content,
      'plainText', v_version.plain_text,
      'effectiveFrom', v_version.effective_from,
      'effectiveTo', v_version.effective_to,
      'publicationState', v_version.publication_state,
      'publishedAt', v_version.published_at,
      'contentHash', v_version.content_hash,
      'recordClass', v_version.record_class,
      'revision', case when v_can_manage then v_version.revision else null end,
      'provisions', v_provisions,
      'sourceDescription', case when v_can_manage then v_version.source_description else null end,
      'sourceProvenance', case when v_can_manage then v_version.source_provenance else null end
    ) end,
    'history', v_history,
    'allowedActions', v_actions,
    'serverTime', now()
  );
end
$document$;

comment on function public.world_get_document_v1(text,text,integer) is
  'TG4 canonical document projection; full structured legal body is publication-gated and source provenance is exposed only to authorized institution document managers.';

commit;
