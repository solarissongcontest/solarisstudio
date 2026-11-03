begin;

-- Terra Solaris Governance TG4: generic institutional/legal document state.
-- Canonical legal truth is Work -> Version -> stable Provision identity ->
-- version-specific Provision representation -> Artifact. Existing V3 Archive
-- remains the history owner; no parallel world_archive store is introduced.

create table public.world_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  slug text not null,
  document_type text not null,
  title text not null,
  status text not null default 'active',
  visibility text not null default 'public',
  current_version_id uuid,
  record_class text not null default 'working',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  constraint world_documents_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint world_documents_type_check check (document_type in (
    'charter','rulebook','annex','treaty','protocol','procedural_rules',
    'report','minutes','communique','other'
  )),
  constraint world_documents_title_check check (length(btrim(title)) between 1 and 240),
  constraint world_documents_status_check check (status in ('active','retired','historical')),
  constraint world_documents_visibility_check check (visibility in ('public','members','private')),
  constraint world_documents_record_class_check check (record_class in ('working','official','permanent')),
  constraint world_documents_revision_check check (revision >= 1)
);
create index world_documents_org_type_idx
  on public.world_documents(organization_id, document_type, status, title);
create index world_documents_visibility_idx
  on public.world_documents(visibility, status, organization_id);

create table public.world_document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.world_documents(id) on delete restrict,
  version_number integer not null,
  title text not null,
  structured_content jsonb not null default '{}'::jsonb,
  plain_text text not null default '',
  effective_from timestamptz,
  effective_to timestamptz,
  publication_state text not null default 'draft',
  published_at timestamptz,
  supersedes_version_id uuid,
  superseded_by_version_id uuid,
  source_description text,
  source_provenance jsonb not null default '{}'::jsonb,
  content_hash text,
  record_class text not null default 'working',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (id, document_id),
  constraint world_document_versions_number_check check (version_number >= 1),
  constraint world_document_versions_title_check check (length(btrim(title)) between 1 and 240),
  constraint world_document_versions_structured_check check (jsonb_typeof(structured_content) = 'object'),
  constraint world_document_versions_provenance_check check (jsonb_typeof(source_provenance) = 'object'),
  constraint world_document_versions_effective_check check (effective_to is null or (effective_from is not null and effective_to > effective_from)),
  constraint world_document_versions_state_check check (publication_state in ('draft','published','superseded','historical_source')),
  constraint world_document_versions_publication_shape_check check (
    (publication_state = 'draft' and published_at is null and content_hash is null and record_class = 'working')
    or
    (publication_state = 'published' and published_at is not null and content_hash is not null and record_class = 'official')
    or
    (publication_state in ('superseded','historical_source') and published_at is not null and content_hash is not null and record_class = 'permanent')
  ),
  constraint world_document_versions_hash_check check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  constraint world_document_versions_revision_check check (revision >= 1),
  constraint world_document_versions_no_self_supersedes check (supersedes_version_id is null or supersedes_version_id <> id),
  constraint world_document_versions_no_self_superseded_by check (superseded_by_version_id is null or superseded_by_version_id <> id)
);

alter table public.world_document_versions
  add constraint world_document_versions_supersedes_fk
  foreign key (supersedes_version_id) references public.world_document_versions(id) on delete restrict;
alter table public.world_document_versions
  add constraint world_document_versions_superseded_by_fk
  foreign key (superseded_by_version_id) references public.world_document_versions(id) on delete restrict;
alter table public.world_documents
  add constraint world_documents_current_version_fk
  foreign key (current_version_id) references public.world_document_versions(id) on delete restrict;

create index world_document_versions_document_state_idx
  on public.world_document_versions(document_id, publication_state, version_number desc);
create index world_document_versions_effective_idx
  on public.world_document_versions(document_id, effective_from desc, effective_to);
create index world_document_versions_plain_search_idx
  on public.world_document_versions using gin (to_tsvector('simple', plain_text));

create table public.world_document_provisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.world_documents(id) on delete restrict,
  semantic_key text not null,
  lifecycle_status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (document_id, semantic_key),
  unique (id, document_id),
  constraint world_document_provisions_key_check check (semantic_key ~ '^[a-z0-9]+(?:[.:-][a-z0-9]+)*$'),
  constraint world_document_provisions_lifecycle_check check (lifecycle_status in ('active','repealed','historical'))
);
create index world_document_provisions_document_idx
  on public.world_document_provisions(document_id, semantic_key);

create table public.world_document_version_provisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  document_version_id uuid not null,
  provision_id uuid not null,
  parent_provision_id uuid,
  display_label text,
  heading text,
  body_structured jsonb not null default '{}'::jsonb,
  body_plain_text text not null default '',
  sort_order integer not null,
  anchor text not null,
  version_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_version_id, provision_id),
  unique (document_version_id, anchor),
  constraint world_document_version_provisions_version_fk
    foreign key (document_version_id, document_id)
    references public.world_document_versions(id, document_id) on delete restrict,
  constraint world_document_version_provisions_provision_fk
    foreign key (provision_id, document_id)
    references public.world_document_provisions(id, document_id) on delete restrict,
  constraint world_document_version_provisions_parent_fk
    foreign key (parent_provision_id, document_id)
    references public.world_document_provisions(id, document_id) on delete restrict,
  constraint world_document_version_provisions_parent_check check (parent_provision_id is null or parent_provision_id <> provision_id),
  constraint world_document_version_provisions_anchor_check check (anchor ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint world_document_version_provisions_heading_check check (heading is null or length(btrim(heading)) between 1 and 240),
  constraint world_document_version_provisions_body_check check (jsonb_typeof(body_structured) = 'object'),
  constraint world_document_version_provisions_order_check check (sort_order >= 0),
  constraint world_document_version_provisions_status_check check (version_status in ('active','repealed','omitted'))
);
create index world_document_version_provisions_toc_idx
  on public.world_document_version_provisions(document_version_id, sort_order, id);
create index world_document_version_provisions_plain_search_idx
  on public.world_document_version_provisions using gin (to_tsvector('simple', coalesce(heading,'') || ' ' || body_plain_text));

create table public.world_document_artifacts (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.world_document_versions(id) on delete restrict,
  artifact_format text not null,
  storage_reference text,
  status text not null default 'pending',
  generated_at timestamptz,
  content_hash text,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint world_document_artifacts_format_check check (artifact_format in ('solaris_native','pdf','html','json','other')),
  constraint world_document_artifacts_status_check check (status in ('pending','ready','failed','superseded')),
  constraint world_document_artifacts_ready_check check ((status = 'ready') = (generated_at is not null and content_hash is not null)),
  constraint world_document_artifacts_hash_check check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  constraint world_document_artifacts_provenance_check check (jsonb_typeof(provenance) = 'object')
);
create unique index world_document_artifacts_one_ready_format_uidx
  on public.world_document_artifacts(document_version_id, artifact_format)
  where status = 'ready';
create index world_document_artifacts_version_idx
  on public.world_document_artifacts(document_version_id, status, artifact_format);

-- Prevent a document from pointing at another document's version, or at a
-- draft/superseded version as its current authoritative text.
create or replace function private.world_document_current_version_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
declare
  v_document_id uuid;
  v_state text;
begin
  if new.current_version_id is null then
    return new;
  end if;
  select version_row.document_id, version_row.publication_state
  into v_document_id, v_state
  from public.world_document_versions version_row
  where version_row.id = new.current_version_id;
  if v_document_id is distinct from new.id or v_state is distinct from 'published' then
    raise exception using errcode = '23514', message = 'CURRENT_VERSION_MISMATCH';
  end if;
  return new;
end
$guard$;
revoke all on function private.world_document_current_version_guard() from public, anon, authenticated;
create trigger world_documents_current_version_guard
before insert or update of current_version_id on public.world_documents
for each row execute function private.world_document_current_version_guard();

-- Once legal text is published its substance is immutable. A published row may
-- only transition to superseded while adding end/supersession metadata. A
-- superseded or historical-source row is permanently immutable.
create or replace function private.world_document_version_immutability_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
begin
  if tg_op = 'DELETE' and old.publication_state <> 'draft' then
    raise exception using errcode = '55000', message = 'PUBLISHED_DOCUMENT_VERSION_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;

  if old.publication_state in ('superseded','historical_source') then
    raise exception using errcode = '55000', message = 'PUBLISHED_DOCUMENT_VERSION_IMMUTABLE';
  end if;

  if old.publication_state = 'published' then
    if new.publication_state <> 'superseded'
       or new.document_id is distinct from old.document_id
       or new.version_number is distinct from old.version_number
       or new.title is distinct from old.title
       or new.structured_content is distinct from old.structured_content
       or new.plain_text is distinct from old.plain_text
       or new.effective_from is distinct from old.effective_from
       or new.published_at is distinct from old.published_at
       or new.supersedes_version_id is distinct from old.supersedes_version_id
       or new.source_description is distinct from old.source_description
       or new.source_provenance is distinct from old.source_provenance
       or new.content_hash is distinct from old.content_hash
       or new.revision is distinct from old.revision
       or new.record_class is distinct from 'permanent'
       or new.effective_to is null
       or new.superseded_by_version_id is null then
      raise exception using errcode = '55000', message = 'PUBLISHED_DOCUMENT_VERSION_IMMUTABLE';
    end if;
  end if;
  return new;
end
$guard$;
revoke all on function private.world_document_version_immutability_guard() from public, anon, authenticated;
create trigger world_document_versions_immutability_guard
before update or delete on public.world_document_versions
for each row execute function private.world_document_version_immutability_guard();

-- Published/superseded effective periods for one document may touch at a
-- boundary but may never overlap. This is enforced without a second timeline.
create or replace function private.world_document_effective_period_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $guard$
begin
  if new.publication_state in ('published','superseded') and new.effective_from is not null then
    if exists (
      select 1
      from public.world_document_versions other_row
      where other_row.document_id = new.document_id
        and other_row.id <> new.id
        and other_row.publication_state in ('published','superseded')
        and other_row.effective_from is not null
        and tstzrange(other_row.effective_from, other_row.effective_to, '[)')
            && tstzrange(new.effective_from, new.effective_to, '[)')
    ) then
      raise exception using errcode = '23P01', message = 'DOCUMENT_EFFECTIVE_PERIOD_OVERLAP';
    end if;
  end if;
  return new;
end
$guard$;
revoke all on function private.world_document_effective_period_guard() from public, anon, authenticated;
create trigger world_document_versions_effective_period_guard
before insert or update of publication_state, effective_from, effective_to
on public.world_document_versions
for each row execute function private.world_document_effective_period_guard();

-- A small safe membership predicate is used only by document RLS. It returns no
-- membership rows or auth identifiers and cannot mutate state.
create or replace function public.world_document_member_allowed_v1(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $member$
  select coalesce(
    auth.uid() is not null and exists (
      select 1
      from public.country_accounts account_row
      join public.world_organization_memberships membership_row
        on membership_row.country_id = account_row.country_id
       and membership_row.organization_id = p_organization_id
       and membership_row.ended_at is null
       and membership_row.status in ('member','observer','associate')
      where account_row.user_id = auth.uid()
        and account_row.status = 'active'
    ), false
  )
$member$;
revoke all on function public.world_document_member_allowed_v1(uuid) from public, anon, authenticated;
grant execute on function public.world_document_member_allowed_v1(uuid) to authenticated, service_role;

-- Existing Permission Engine V2 remains authoritative. TG4 adds only two
-- generic world capabilities; office titles are never checked at runtime.
insert into public.studio2_capabilities(key, domain, label, description, access_level)
values
  ('world.document.manage','world','Manage institutional documents','Create and edit institutional document drafts within world scope.','operate'),
  ('world.document.publish','world','Publish institutional documents','Publish immutable institutional legal versions within world scope.','approve')
on conflict (key) do nothing;

insert into public.world_office_capabilities(office_id, capability)
select office_row.id, seed.capability
from public.world_organization_offices office_row
join public.world_organizations organization_row
  on organization_row.id = office_row.organization_id
join (values
  ('guard','chairperson','world.document.manage'),
  ('guard','chairperson','world.document.publish'),
  ('guard','deputy-chairperson','world.document.manage'),
  ('unity','secretary-general','world.document.manage'),
  ('unity','secretary-general','world.document.publish'),
  ('unity','deputy-secretary-general','world.document.manage')
) seed(organization_slug, office_slug, capability)
  on seed.organization_slug = organization_row.slug
 and seed.office_slug = office_row.slug
on conflict do nothing;

-- Fail closed at the Data API boundary. Browser roles receive SELECT only;
-- canonical mutations are exclusively through guarded server RPCs.
alter table public.world_documents enable row level security;
alter table public.world_document_versions enable row level security;
alter table public.world_document_provisions enable row level security;
alter table public.world_document_version_provisions enable row level security;
alter table public.world_document_artifacts enable row level security;

revoke all on table public.world_documents,
  public.world_document_versions,
  public.world_document_provisions,
  public.world_document_version_provisions,
  public.world_document_artifacts from public, anon, authenticated;

grant select on table public.world_documents,
  public.world_document_versions,
  public.world_document_provisions,
  public.world_document_version_provisions,
  public.world_document_artifacts to anon, authenticated;
grant all on table public.world_documents,
  public.world_document_versions,
  public.world_document_provisions,
  public.world_document_version_provisions,
  public.world_document_artifacts to service_role;

create policy world_documents_anon_read on public.world_documents
for select to anon
using (visibility = 'public');
create policy world_documents_authenticated_read on public.world_documents
for select to authenticated
using (
  visibility = 'public'
  or (visibility = 'members' and public.world_document_member_allowed_v1(organization_id))
  or public.world_access_allowed('world.document.manage', organization_id, null, null, 'document', id)
  or public.world_access_allowed('world.document.publish', organization_id, null, null, 'document', id)
  or public.world_access_allowed('world.organization.view_private', organization_id, null, null, 'document', id)
);

create policy world_document_versions_anon_read on public.world_document_versions
for select to anon
using (
  publication_state in ('published','superseded','historical_source')
  and exists (
    select 1 from public.world_documents document_row
    where document_row.id = document_id and document_row.visibility = 'public'
  )
);
create policy world_document_versions_authenticated_read on public.world_document_versions
for select to authenticated
using (
  exists (
    select 1 from public.world_documents document_row
    where document_row.id = document_id
      and (
        (
          publication_state in ('published','superseded','historical_source')
          and (
            document_row.visibility = 'public'
            or (document_row.visibility = 'members' and public.world_document_member_allowed_v1(document_row.organization_id))
          )
        )
        or public.world_access_allowed('world.document.manage', document_row.organization_id, null, null, 'document', document_row.id)
        or public.world_access_allowed('world.document.publish', document_row.organization_id, null, null, 'document', document_row.id)
      )
  )
);

create policy world_document_provisions_anon_read on public.world_document_provisions
for select to anon
using (exists (
  select 1
  from public.world_document_version_provisions version_provision
  join public.world_document_versions version_row on version_row.id = version_provision.document_version_id
  join public.world_documents document_row on document_row.id = version_row.document_id
  where version_provision.provision_id = world_document_provisions.id
    and version_row.publication_state in ('published','superseded','historical_source')
    and document_row.visibility = 'public'
));
create policy world_document_provisions_authenticated_read on public.world_document_provisions
for select to authenticated
using (
  exists (
    select 1
    from public.world_documents document_row
    where document_row.id = document_id
      and (
        public.world_access_allowed('world.document.manage', document_row.organization_id, null, null, 'document', document_row.id)
        or public.world_access_allowed('world.document.publish', document_row.organization_id, null, null, 'document', document_row.id)
      )
  )
  or exists (
    select 1
    from public.world_document_version_provisions version_provision
    join public.world_document_versions version_row on version_row.id = version_provision.document_version_id
    join public.world_documents document_row on document_row.id = version_row.document_id
    where version_provision.provision_id = world_document_provisions.id
      and version_row.publication_state in ('published','superseded','historical_source')
      and (
        document_row.visibility = 'public'
        or (document_row.visibility = 'members' and public.world_document_member_allowed_v1(document_row.organization_id))
      )
  )
);

create policy world_document_version_provisions_anon_read on public.world_document_version_provisions
for select to anon
using (exists (
  select 1
  from public.world_document_versions version_row
  join public.world_documents document_row on document_row.id = version_row.document_id
  where version_row.id = document_version_id
    and version_row.publication_state in ('published','superseded','historical_source')
    and document_row.visibility = 'public'
));
create policy world_document_version_provisions_authenticated_read on public.world_document_version_provisions
for select to authenticated
using (exists (
  select 1
  from public.world_document_versions version_row
  join public.world_documents document_row on document_row.id = version_row.document_id
  where version_row.id = document_version_id
    and (
      (
        version_row.publication_state in ('published','superseded','historical_source')
        and (
          document_row.visibility = 'public'
          or (document_row.visibility = 'members' and public.world_document_member_allowed_v1(document_row.organization_id))
        )
      )
      or public.world_access_allowed('world.document.manage', document_row.organization_id, null, null, 'document', document_row.id)
      or public.world_access_allowed('world.document.publish', document_row.organization_id, null, null, 'document', document_row.id)
    )
));

create policy world_document_artifacts_anon_read on public.world_document_artifacts
for select to anon
using (
  status = 'ready'
  and exists (
    select 1
    from public.world_document_versions version_row
    join public.world_documents document_row on document_row.id = version_row.document_id
    where version_row.id = document_version_id
      and version_row.publication_state in ('published','superseded','historical_source')
      and document_row.visibility = 'public'
  )
);
create policy world_document_artifacts_authenticated_read on public.world_document_artifacts
for select to authenticated
using (exists (
  select 1
  from public.world_document_versions version_row
  join public.world_documents document_row on document_row.id = version_row.document_id
  where version_row.id = document_version_id
    and (
      (
        status = 'ready'
        and version_row.publication_state in ('published','superseded','historical_source')
        and (
          document_row.visibility = 'public'
          or (document_row.visibility = 'members' and public.world_document_member_allowed_v1(document_row.organization_id))
        )
      )
      or public.world_access_allowed('world.document.manage', document_row.organization_id, null, null, 'document', document_row.id)
      or public.world_access_allowed('world.document.publish', document_row.organization_id, null, null, 'document', document_row.id)
    )
));

-- S13 semantic adoption contract is registered in the same migration so the
-- migration cannot exist as an unclassified ledger entry.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg4.world-document-state',
      1,
      'forward_fix_only',
      false,
      null,
      'Add the generic Terra Solaris Work/Version/Provision/Artifact legal-document state model, fail-closed RLS, document capabilities, published-history immutability and migration-ledger adoption.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
