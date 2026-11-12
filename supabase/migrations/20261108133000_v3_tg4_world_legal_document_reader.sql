begin;

create or replace function public.world_get_public_legal_document_version_v1(
  p_organization_slug text,
  p_document_slug text,
  p_version_number integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if p_organization_slug is null or p_document_slug is null
     or p_organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_document_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_version_number is not null and p_version_number < 1 then
    raise exception 'Invalid public legal document request' using errcode = '22023';
  end if;

  select jsonb_build_object(
      'organizationSlug', organization_row.slug,
      'organizationName', organization_row.official_name,
      'documentSlug', document_row.slug,
      'documentTitle', document_row.title,
      'documentType', document_row.document_type,
      'documentStatus', document_row.status,
      'versionId', version_row.id,
      'versionNumber', version_row.version_number,
      'versionTitle', version_row.title,
      'fullText', version_row.full_text,
      'contentHash', version_row.content_hash,
      'publicationState', version_row.publication_state,
      'effectiveFrom', version_row.effective_from,
      'effectiveTo', version_row.effective_to,
      'publishedAt', version_row.published_at
    )
    into v_result
    from public.world_documents document_row
    join public.world_organizations organization_row
      on organization_row.id = document_row.organization_id
    join public.world_document_versions version_row
      on version_row.document_id = document_row.id
   where organization_row.slug = p_organization_slug
     and document_row.slug = p_document_slug
     and document_row.visibility = 'public'
     and document_row.status in ('active', 'retired', 'historical')
     and organization_row.public_visibility = 'public'
     and organization_row.status in ('recognized', 'active', 'suspended', 'historical', 'dissolved')
     and version_row.publication_state in ('published', 'superseded', 'historical_source')
     and (p_version_number is null or version_row.version_number = p_version_number)
   order by version_row.version_number desc
   limit 1;

  return v_result;
end;
$$;

revoke all on function public.world_get_public_legal_document_version_v1(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.world_get_public_legal_document_version_v1(text, text, integer)
  to anon, authenticated, service_role;

comment on function public.world_get_public_legal_document_version_v1(text, text, integer)
  is 'TG4 public reader over published legal document versions; private documents and draft versions are never returned.';

commit;
