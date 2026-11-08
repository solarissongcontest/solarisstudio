begin;

-- TG4 foundation: canonical legal documents and immutable published versions.
-- This migration adds no second archive authority; the public reader below is
-- a projection over these version rows.

create table if not exists public.world_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  slug text not null,
  title text not null,
  document_type text not null,
  status text not null default 'active',
  visibility text not null default 'private',
  current_version_id uuid,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_documents_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint world_documents_status_check check (status in ('active', 'retired', 'historical')),
  constraint world_documents_visibility_check check (visibility in ('public', 'members', 'private')),
  constraint world_documents_title_check check (length(btrim(title)) between 1 and 240),
  constraint world_documents_type_check check (length(btrim(document_type)) between 1 and 80),
  constraint world_documents_revision_check check (revision >= 1),
  unique (organization_id, slug)
);

create table if not exists public.world_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.world_documents(id) on delete restrict,
  version_number integer not null,
  title text not null,
  full_text text not null,
  content_hash text not null,
  publication_state text not null default 'draft',
  effective_from timestamptz,
  effective_to timestamptz,
  published_at timestamptz,
  supersedes_version_id uuid references public.world_document_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint world_document_versions_number_check check (version_number >= 1),
  constraint world_document_versions_state_check check (publication_state in ('draft', 'published', 'superseded', 'historical_source')),
  constraint world_document_versions_title_check check (length(btrim(title)) between 1 and 240),
  constraint world_document_versions_hash_check check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint world_document_versions_dates_check check (effective_to is null or effective_from is null or effective_to >= effective_from),
  unique (document_id, version_number)
);

alter table public.world_documents
  add constraint world_documents_current_version_fk
  foreign key (current_version_id) references public.world_document_versions(id) on delete restrict;

create index if not exists world_documents_public_lookup_idx
  on public.world_documents(organization_id, visibility, status, slug);
create index if not exists world_document_versions_archive_idx
  on public.world_document_versions(document_id, version_number desc)
  where publication_state in ('published', 'superseded', 'historical_source');

alter table public.world_documents enable row level security;
alter table public.world_document_versions enable row level security;
revoke all on table public.world_documents, public.world_document_versions from public, anon, authenticated;
grant select on table public.world_documents, public.world_document_versions to authenticated;
grant all on table public.world_documents, public.world_document_versions to service_role;

create or replace function public.world_document_publicly_available_v1(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
      from public.world_documents document_row
      join public.world_organizations organization_row
        on organization_row.id = document_row.organization_id
     where document_row.id = p_document_id
       and document_row.visibility = 'public'
       and document_row.status in ('active', 'retired', 'historical')
       and organization_row.public_visibility = 'public'
       and organization_row.status in ('recognized', 'active', 'suspended', 'historical', 'dissolved')
  );
$$;

revoke all on function public.world_document_publicly_available_v1(uuid) from public, anon, authenticated;
grant execute on function public.world_document_publicly_available_v1(uuid) to anon, authenticated, service_role;

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
set search_path = public, pg_catalog
as $$
declare
  v_document_id uuid;
  v_document_slug text;
  v_document_title text;
  v_document_type text;
  v_document_status text;
  v_current_version_id uuid;
  v_organization_name text;
  v_organization_slug text;
  v_versions jsonb;
  v_limit integer := greatest(1, least(coalesce(p_limit, 30), 30));
begin
  if p_organization_slug is null or p_document_slug is null
     or p_organization_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_document_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_before_version is not null and p_before_version <= 1 then
    raise exception 'Invalid public legal archive request' using errcode = '22023';
  end if;

  select document_row.id, document_row.slug, document_row.title,
         document_row.document_type, document_row.status,
         document_row.current_version_id,
         organization_row.official_name, organization_row.slug
    into v_document_id, v_document_slug, v_document_title,
         v_document_type, v_document_status, v_current_version_id,
         v_organization_name, v_organization_slug
    from public.world_documents document_row
    join public.world_organizations organization_row
      on organization_row.id = document_row.organization_id
   where organization_row.slug = p_organization_slug
     and document_row.slug = p_document_slug
     and public.world_document_publicly_available_v1(document_row.id);

  if v_document_id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(to_jsonb(version_row) - 'full_text' order by version_row.version_number desc), '[]'::jsonb)
    into v_versions
    from (
      select version_row.id as "versionId",
             version_row.version_number as "versionNumber",
             version_row.title,
             version_row.publication_state as "publicationState",
             version_row.effective_from as "effectiveFrom",
             version_row.effective_to as "effectiveTo",
             version_row.published_at as "publishedAt",
             version_row.content_hash as "contentHash",
             version_row.supersedes_version_id as "supersedesVersionId"
        from public.world_document_versions version_row
       where version_row.document_id = v_document_id
         and version_row.publication_state in ('published', 'superseded', 'historical_source')
         and (p_before_version is null or version_row.version_number < p_before_version)
       order by version_row.version_number desc
       limit v_limit
    ) version_row;

  return jsonb_build_object(
    'archiveOwner', 'world_document_versions',
    'organizationSlug', v_organization_slug,
    'organizationName', v_organization_name,
    'documentId', v_document_id,
    'documentSlug', v_document_slug,
    'documentTitle', v_document_title,
    'documentType', v_document_type,
    'documentStatus', v_document_status,
    'currentVersionId', v_current_version_id,
    'versions', v_versions,
    'hasMore', jsonb_array_length(v_versions) = v_limit,
    'nextBeforeVersion', case when jsonb_array_length(v_versions) = v_limit
      then (v_versions -> -1 ->> 'versionNumber')::integer else null end
  );
end;
$$;

revoke all on function public.world_get_public_legal_archive_v1(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.world_get_public_legal_archive_v1(text, text, integer, integer)
  to anon, authenticated, service_role;

comment on function public.world_get_public_legal_archive_v1(text, text, integer, integer)
  is 'TG4 bounded public archive over immutable legal document versions. Drafts, full text and private provenance are never returned.';

create or replace function public.world_list_public_legal_documents_v1(
  p_organization_slug text default null,
  p_limit integer default 30
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce(jsonb_agg(to_jsonb(result_row) order by result_row.organization_name, result_row.title), '[]'::jsonb)
    from (
      select organization_row.slug as "organizationSlug",
             organization_row.official_name as "organizationName",
             document_row.slug as "documentSlug",
             document_row.title,
             document_row.document_type as "documentType",
             document_row.status as "documentStatus"
        from public.world_documents document_row
        join public.world_organizations organization_row
          on organization_row.id = document_row.organization_id
       where document_row.visibility = 'public'
         and document_row.status in ('active', 'retired', 'historical')
         and organization_row.public_visibility = 'public'
         and organization_row.status in ('recognized', 'active', 'suspended', 'historical', 'dissolved')
         and (p_organization_slug is null or organization_row.slug = p_organization_slug)
       order by organization_row.official_name, document_row.title
       limit greatest(1, least(coalesce(p_limit, 30), 100))
    ) result_row;
$$;

revoke all on function public.world_list_public_legal_documents_v1(text, integer)
  from public, anon, authenticated;
grant execute on function public.world_list_public_legal_documents_v1(text, integer)
  to anon, authenticated, service_role;

commit;
