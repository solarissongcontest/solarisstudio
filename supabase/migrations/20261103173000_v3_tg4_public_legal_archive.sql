begin;

-- TG4 publication-only legal archive projection.
-- This does not create an Archive table or a second document authority.
-- Canonical truth remains world_documents -> world_document_versions.
-- Callers, including signed-in managers, receive the SAME public-only shape.
create or replace function public.world_get_public_legal_archive_v1(
  p_organization_slug text,
  p_document_slug text,
  p_before_version integer default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $archive$
declare
  v_document_id uuid;
  v_organization_id uuid;
  v_organization_name text;
  v_document_title text;
  v_document_type text;
  v_document_status text;
  v_current_version_id uuid;
  v_versions jsonb;
  v_count integer;
  v_has_more boolean;
  v_next_before integer;
begin
  -- Invalid or malformed slugs never result in broad data scans.
  if p_organization_slug is null or p_document_slug is null
     or length(p_organization_slug) > 100 or length(p_document_slug) > 100
     or p_organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_document_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_limit is null or p_limit not between 1 and 100
     or (p_before_version is not null and p_before_version < 1) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select document_row.id, organization_row.id, organization_row.official_name,
         document_row.title, document_row.document_type,
         document_row.status, document_row.current_version_id
    into v_document_id, v_organization_id, v_organization_name,
         v_document_title, v_document_type, v_document_status,
         v_current_version_id
  from public.world_documents document_row
  join public.world_organizations organization_row
    on organization_row.id = document_row.organization_id
  where document_row.slug = p_document_slug
    and organization_row.slug = p_organization_slug
    and organization_row.public_visibility = 'public'
    and document_row.visibility = 'public'
  limit 1;

  if v_document_id is null then
    -- Do not reveal whether a private or unlisted Work exists.
    return null;
  end if;

  select count(*) into v_count
  from (
    select version_row.id
    from public.world_document_versions version_row
    where version_row.document_id = v_document_id
      and version_row.publication_state in ('published','superseded','historical_source')
      and (p_before_version is null or version_row.version_number < p_before_version)
    order by version_row.version_number desc
    limit p_limit + 1
  ) bounded;
  v_has_more := v_count > p_limit;

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
    'fullTextAvailable', (
      length(btrim(version_row.plain_text)) > 0
      or version_row.structured_content <> '{}'::jsonb
      or exists (
        select 1 from public.world_document_version_provisions provision_row
        where provision_row.document_version_id = version_row.id
          and (
            length(btrim(provision_row.body_plain_text)) > 0
            or provision_row.body_structured <> '{}'::jsonb
          )
      )
    )
  ) order by version_row.version_number desc), '[]'::jsonb),
  min(version_row.version_number)
  into v_versions, v_next_before
  from (
    select * from public.world_document_versions version_row
    where version_row.document_id = v_document_id
      and version_row.publication_state in ('published','superseded','historical_source')
      and (p_before_version is null or version_row.version_number < p_before_version)
    order by version_row.version_number desc
    limit p_limit
  ) version_row;

  return jsonb_build_object(
    'archiveOwner', 'world_document_versions+domain_events',
    'organizationId', v_organization_id,
    'organizationSlug', p_organization_slug,
    'organizationName', v_organization_name,
    'documentId', v_document_id,
    'documentSlug', p_document_slug,
    'documentTitle', v_document_title,
    'documentType', v_document_type,
    'documentStatus', v_document_status,
    'currentVersionId', v_current_version_id,
    'versions', v_versions,
    'hasMore', v_has_more,
    'nextBeforeVersion', case when v_has_more then v_next_before else null end,
    'serverTime', now()
  );
end
$archive$;

revoke all on function public.world_get_public_legal_archive_v1(text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.world_get_public_legal_archive_v1(text,text,integer,integer)
  to anon, authenticated;

comment on function public.world_get_public_legal_archive_v1(text,text,integer,integer) is
  'TG4 public-only keyset Archive of immutable legal Versions. Never returns drafts, private organization records or manager-only provenance. Canonical history remains in world_document_versions.';

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg4.world-public-legal-archive',
      1,
      'forward_fix_only',
      false,
      null,
      'Public-only bounded keyset Archive over immutable published/superseded/historical legal versions; no new Archive state or draft/provenance exposure.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
