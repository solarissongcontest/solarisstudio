begin;

-- Terra Solaris Governance TG4 read/reconciliation layer. Existing V3 Archive
-- remains canonical: document history is derived from immutable document
-- Versions + semantic DomainEvents, never copied into a competing world_archive.

create or replace function private.world_document_can_read_v1(p_document_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $readable$
declare
  v_document public.world_documents%rowtype;
begin
  select * into v_document
  from public.world_documents
  where id = p_document_id;

  if v_document.id is null then
    return false;
  end if;
  if v_document.visibility = 'public' then
    return true;
  end if;
  if auth.uid() is null then
    return false;
  end if;
  if v_document.visibility = 'members'
     and public.world_document_member_allowed_v1(v_document.organization_id) then
    return true;
  end if;
  return
    public.world_access_allowed('world.document.manage', v_document.organization_id, null, null, 'document', v_document.id)
    or public.world_access_allowed('world.document.publish', v_document.organization_id, null, null, 'document', v_document.id)
    or public.world_access_allowed('world.organization.view_private', v_document.organization_id, null, null, 'document', v_document.id);
end
$readable$;
revoke all on function private.world_document_can_read_v1(uuid) from public, anon, authenticated;

create or replace function private.world_document_can_manage_v1(p_document_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog
as $manageable$
declare
  v_organization_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;
  select organization_id into v_organization_id
  from public.world_documents
  where id = p_document_id;
  if v_organization_id is null then
    return false;
  end if;
  return
    public.world_access_allowed('world.document.manage', v_organization_id, null, null, 'document', p_document_id)
    or public.world_access_allowed('world.document.publish', v_organization_id, null, null, 'document', p_document_id);
end
$manageable$;
revoke all on function private.world_document_can_manage_v1(uuid) from public, anon, authenticated;

create or replace function public.world_get_document_index_v1(
  p_organization_slug text default null,
  p_query text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $index$
declare
  v_result jsonb;
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select coalesce(jsonb_agg(row_payload order by lower(row_payload ->> 'title'), row_payload ->> 'documentId'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'documentId', document_row.id,
      'organizationId', organization_row.id,
      'organizationSlug', organization_row.slug,
      'organizationName', organization_row.official_name,
      'slug', document_row.slug,
      'documentType', document_row.document_type,
      'title', document_row.title,
      'status', document_row.status,
      'visibility', document_row.visibility,
      'recordClass', document_row.record_class,
      'currentVersion', case when version_row.id is null then null else jsonb_build_object(
        'versionId', version_row.id,
        'versionNumber', version_row.version_number,
        'title', version_row.title,
        'effectiveFrom', version_row.effective_from,
        'publishedAt', version_row.published_at,
        'contentHash', version_row.content_hash,
        'recordClass', version_row.record_class
      ) end
    ) as row_payload
    from public.world_documents document_row
    join public.world_organizations organization_row on organization_row.id = document_row.organization_id
    left join public.world_document_versions version_row
      on version_row.id = document_row.current_version_id
     and version_row.publication_state = 'published'
    where private.world_document_can_read_v1(document_row.id)
      and (p_organization_slug is null or organization_row.slug = p_organization_slug)
      and (
        v_query is null
        or to_tsvector('simple', document_row.title || ' ' || coalesce(version_row.plain_text, ''))
           @@ plainto_tsquery('simple', v_query)
        or exists (
          select 1
          from public.world_document_version_provisions version_provision
          where version_provision.document_version_id = version_row.id
            and to_tsvector('simple', coalesce(version_provision.heading,'') || ' ' || version_provision.body_plain_text)
                @@ plainto_tsquery('simple', v_query)
        )
      )
    order by lower(document_row.title), document_row.id
    limit p_limit
  ) visible_rows;

  return jsonb_build_object(
    'documents', v_result,
    'query', v_query,
    'serverTime', now()
  );
end
$index$;

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
      'provisions', v_provisions
    ) end,
    'history', v_history,
    'allowedActions', v_actions,
    'serverTime', now()
  );
end
$document$;

create or replace function public.world_get_document_archive_v1(
  p_organization_slug text,
  p_document_slug text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $archive$
declare
  v_document public.world_documents%rowtype;
  v_organization public.world_organizations%rowtype;
  v_can_manage boolean := false;
  v_versions jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'versionId', version_row.id,
    'versionNumber', version_row.version_number,
    'title', version_row.title,
    'publicationState', version_row.publication_state,
    'effectiveFrom', version_row.effective_from,
    'effectiveTo', version_row.effective_to,
    'publishedAt', version_row.published_at,
    'contentHash', version_row.content_hash,
    'recordClass', version_row.record_class,
    'supersedesVersionId', version_row.supersedes_version_id,
    'supersededByVersionId', version_row.superseded_by_version_id,
    'sourceDescription', case when v_can_manage then version_row.source_description else null end,
    'sourceProvenance', case when v_can_manage then version_row.source_provenance else null end,
    'fullTextAvailable', length(btrim(version_row.plain_text)) > 0 or version_row.structured_content <> '{}'::jsonb
  ) order by version_row.version_number desc), '[]'::jsonb)
  into v_versions
  from public.world_document_versions version_row
  where version_row.document_id = v_document.id
    and (
      version_row.publication_state in ('published','superseded','historical_source')
      or (v_can_manage and version_row.publication_state = 'draft')
    );

  return jsonb_build_object(
    'archiveOwner', 'world_document_versions+domain_events',
    'documentId', v_document.id,
    'organizationId', v_organization.id,
    'organizationSlug', v_organization.slug,
    'documentSlug', v_document.slug,
    'versions', v_versions,
    'serverTime', now()
  );
end
$archive$;

-- One idempotent service-role reconciler handles the three declared document
-- consumers. Archive/search/projection are derived from canonical state, so the
-- consumer receipt proves reconciliation without creating duplicate truth.
create or replace function public.world_reconcile_document_event_v1(
  p_event_id uuid,
  p_consumer_key text,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $reconcile$
declare
  v_event private.v3_domain_events%rowtype;
  v_document public.world_documents%rowtype;
  v_version public.world_document_versions%rowtype;
  v_result jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_consumer_key not in ('world.documents.archive','world.documents.search','world.documents.projection') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_event
  from private.v3_domain_events
  where id = p_event_id;
  if v_event.id is null or v_event.event_type not in (
    'world.document.created',
    'world.document.version_created',
    'world.document.version_published',
    'world.document.version_superseded'
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  if v_event.event_type = 'world.document.created' then
    if p_consumer_key <> 'world.documents.projection' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    select * into v_document
    from public.world_documents
    where id = v_event.aggregate_id::uuid;
    if v_document.id is null then
      raise exception using errcode = '23503', message = 'DEPENDENCY_FAILURE';
    end if;
    v_result := jsonb_build_object(
      'owner', 'public.world_documents',
      'mode', 'live-canonical-projection',
      'documentId', v_document.id,
      'revision', v_document.revision
    );
  else
    select * into v_version
    from public.world_document_versions
    where id = v_event.aggregate_id::uuid;
    if v_version.id is null then
      raise exception using errcode = '23503', message = 'DEPENDENCY_FAILURE';
    end if;
    select * into v_document
    from public.world_documents
    where id = v_version.document_id;

    if v_event.event_type = 'world.document.version_created' and p_consumer_key <> 'world.documents.projection' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    if v_event.event_type in ('world.document.version_published','world.document.version_superseded') then
      if v_version.publication_state not in ('published','superseded')
         or v_version.content_hash is null
         or (v_event.payload ->> 'contentHash') is distinct from v_version.content_hash then
        raise exception using errcode = '23514', message = 'STATE_CHANGED';
      end if;
    end if;
    if v_event.event_type = 'world.document.version_superseded'
       and (v_version.publication_state <> 'superseded' or v_version.record_class <> 'permanent') then
      raise exception using errcode = '23514', message = 'STATE_CHANGED';
    end if;

    v_result := jsonb_build_object(
      'owner', 'public.world_document_versions',
      'mode', case p_consumer_key
        when 'world.documents.archive' then 'derived-archive-no-copy'
        when 'world.documents.search' then 'live-permission-aware-search'
        else 'live-canonical-projection'
      end,
      'documentId', v_document.id,
      'versionId', v_version.id,
      'publicationState', v_version.publication_state,
      'recordClass', v_version.record_class,
      'contentHash', v_version.content_hash,
      'effectiveFrom', v_version.effective_from,
      'effectiveTo', v_version.effective_to
    );
  end if;

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_result
  );
end
$reconcile$;

revoke all on function public.world_get_document_index_v1(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.world_get_document_index_v1(text,text,integer)
  to anon, authenticated, service_role;
revoke all on function public.world_get_document_v1(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.world_get_document_v1(text,text,integer)
  to anon, authenticated, service_role;
revoke all on function public.world_get_document_archive_v1(text,text)
  from public, anon, authenticated;
grant execute on function public.world_get_document_archive_v1(text,text)
  to anon, authenticated, service_role;
revoke all on function public.world_reconcile_document_event_v1(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.world_reconcile_document_event_v1(uuid,text,text)
  to service_role;

comment on function public.world_get_document_index_v1(text,text,integer) is
  'TG4 bounded permission-aware institutional document index/search projection. It searches only visible current published legal text.';
comment on function public.world_get_document_v1(text,text,integer) is
  'TG4 bounded document reader projection with stable provisions, history summary and permitted actions; draft revisions are manager-only.';
comment on function public.world_get_document_archive_v1(text,text) is
  'TG4 organization document Archive projection derived from canonical immutable Versions and DomainEvents. It does not create an Archive copy.';
comment on function public.world_reconcile_document_event_v1(uuid,text,text) is
  'TG4 service-role DomainEvent consumer reconciler for derived Archive, live search and bounded projections.';

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg4.world-document-archive-projection',
      1,
      'forward_fix_only',
      false,
      null,
      'Add permission-aware document index/reader/Archive projections and idempotent DomainEvent consequence reconciliation without creating a duplicate Archive or search truth store.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
