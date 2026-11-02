begin;

-- Terra Solaris Governance TG2: generic international-institution foundation.
-- The schema is organization-generic. GUARD and UNITY are seed data, not
-- architecture branches.

create table if not exists public.world_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  official_name text not null,
  short_name text not null,
  type text not null default 'international_organization',
  description text null,
  emblem_url text null,
  banner_url text null,
  accent_token text null,
  founded_at timestamptz null,
  founded_edition_id uuid null references public.editions(id) on delete set null,
  recognized_at timestamptz null,
  recognition_authority_id uuid null references public.world_organizations(id) on delete set null,
  status text not null default 'proposed',
  public_visibility text not null default 'public',
  current_document_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  constraint world_organizations_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint world_organizations_names_check check (length(btrim(official_name)) > 0 and length(btrim(short_name)) > 0),
  constraint world_organizations_status_check check (status in ('proposed','recognized','active','suspended','dissolved','historical')),
  constraint world_organizations_visibility_check check (public_visibility in ('public','members','private')),
  constraint world_organizations_revision_check check (revision >= 1)
);

create table if not exists public.world_organization_organs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  slug text not null,
  name text not null,
  short_name text null,
  type text not null default 'assembly',
  description text null,
  visibility text not null default 'public',
  status text not null default 'active',
  sort_order integer not null default 0,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  constraint world_organization_organs_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint world_organization_organs_name_check check (length(btrim(name)) > 0),
  constraint world_organization_organs_visibility_check check (visibility in ('public','members','private')),
  constraint world_organization_organs_status_check check (status in ('active','inactive','historical')),
  constraint world_organization_organs_revision_check check (revision >= 1)
);

create table if not exists public.world_organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  membership_type text not null default 'member',
  status text not null default 'member',
  joined_at timestamptz not null default now(),
  joined_edition_id uuid null references public.editions(id) on delete set null,
  ended_at timestamptz null,
  ended_edition_id uuid null references public.editions(id) on delete set null,
  admission_measure_id uuid null,
  termination_measure_id uuid null,
  termination_reason text null,
  created_at timestamptz not null default now(),
  revision bigint not null default 1,
  constraint world_organization_memberships_type_check check (membership_type in ('member','observer','associate')),
  constraint world_organization_memberships_status_check check (status in ('member','observer','associate','suspended','withdrawn','expelled','former')),
  constraint world_organization_memberships_end_check check (
    (status in ('member','observer','associate','suspended') and ended_at is null)
    or (status in ('withdrawn','expelled','former') and ended_at is not null)
  ),
  constraint world_organization_memberships_time_check check (ended_at is null or ended_at >= joined_at),
  constraint world_organization_memberships_revision_check check (revision >= 1)
);
create unique index if not exists world_organization_memberships_one_open_uidx
  on public.world_organization_memberships(organization_id, country_id)
  where ended_at is null;
create index if not exists world_organization_memberships_country_idx
  on public.world_organization_memberships(country_id, organization_id, joined_at desc);

create table if not exists public.world_organization_representations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  person_id uuid not null references public.delegation_people(id) on delete restrict,
  user_id uuid null references auth.users(id) on delete set null,
  role text not null default 'representative',
  voting_authority boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz null,
  start_edition_id uuid null references public.editions(id) on delete set null,
  end_edition_id uuid null references public.editions(id) on delete set null,
  source text not null default 'manual',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  constraint world_organization_representations_role_check check (length(btrim(role)) between 1 and 80),
  constraint world_organization_representations_source_check check (length(btrim(source)) between 1 and 80),
  constraint world_organization_representations_time_check check (ends_at is null or ends_at >= starts_at),
  constraint world_organization_representations_revision_check check (revision >= 1)
);
create unique index if not exists world_organization_representations_voting_rep_uidx
  on public.world_organization_representations(organization_id, country_id)
  where ends_at is null and role = 'representative' and voting_authority;
create unique index if not exists world_organization_representations_country_revision_uidx
  on public.world_organization_representations(organization_id, country_id, revision);

create table if not exists public.world_representation_proxies (
  id uuid primary key default gen_random_uuid(),
  representation_id uuid not null references public.world_organization_representations(id) on delete restrict,
  proxy_person_id uuid not null references public.delegation_people(id) on delete restrict,
  proxy_user_id uuid null references auth.users(id) on delete set null,
  session_id uuid null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  reason text null,
  status text not null default 'requested',
  requested_by_person_id uuid null references public.delegation_people(id) on delete set null,
  approved_by_person_id uuid null references public.delegation_people(id) on delete set null,
  revoked_at timestamptz null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  constraint world_representation_proxies_status_check check (status in ('requested','approved','rejected','expired','revoked')),
  constraint world_representation_proxies_time_check check (valid_until > valid_from),
  constraint world_representation_proxies_revision_check check (revision >= 1)
);
create index if not exists world_representation_proxies_rep_idx
  on public.world_representation_proxies(representation_id, valid_until desc);

create table if not exists public.world_organization_offices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  organ_id uuid null references public.world_organization_organs(id) on delete restrict,
  slug text not null,
  title text not null,
  office_type text not null,
  appointment_method text not null,
  default_term_length_editions integer null,
  succession_policy text null,
  display_priority integer not null default 0,
  active boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  unique (organization_id, slug),
  constraint world_organization_offices_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint world_organization_offices_title_check check (length(btrim(title)) > 0),
  constraint world_organization_offices_term_check check (default_term_length_editions is null or default_term_length_editions > 0),
  constraint world_organization_offices_revision_check check (revision >= 1)
);

create table if not exists public.world_office_terms (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.world_organization_offices(id) on delete restrict,
  holder_person_id uuid not null references public.delegation_people(id) on delete restrict,
  holder_user_id uuid null references auth.users(id) on delete set null,
  represented_country_id uuid null references public.countries(id) on delete set null,
  start_edition_id uuid null references public.editions(id) on delete set null,
  end_edition_id uuid null references public.editions(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz null,
  term_kind text not null default 'elected',
  predecessor_term_id uuid null references public.world_office_terms(id) on delete set null,
  succession_reason text null,
  status text not null default 'active',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  constraint world_office_terms_kind_check check (term_kind in ('elected','appointed','acting','interim','historical')),
  constraint world_office_terms_status_check check (status in ('active','concluded','superseded','historical')),
  constraint world_office_terms_end_check check ((status = 'active' and ends_at is null) or (status <> 'active' and ends_at is not null)),
  constraint world_office_terms_time_check check (ends_at is null or ends_at >= starts_at),
  constraint world_office_terms_revision_check check (revision >= 1)
);
create unique index if not exists world_office_terms_one_active_uidx
  on public.world_office_terms(office_id) where status = 'active';
create unique index if not exists world_office_terms_revision_uidx
  on public.world_office_terms(office_id, revision);

-- Permission Engine V2 remains the capability catalogue/grant authority. This
-- additive table adds world object scope to those existing grants instead of
-- creating a competing capability engine.
create table if not exists public.world_capability_grant_scopes (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.studio2_capability_grants(id) on delete cascade,
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  country_id uuid null references public.countries(id) on delete restrict,
  organ_id uuid null references public.world_organization_organs(id) on delete restrict,
  object_type text null,
  object_id uuid null,
  created_at timestamptz not null default now(),
  constraint world_capability_grant_scopes_object_pair check ((object_type is null) = (object_id is null)),
  constraint world_capability_grant_scopes_object_type_check check (object_type is null or object_type ~ '^[a-z][a-z0-9_.-]{0,79}$')
);
create unique index if not exists world_capability_grant_scopes_uidx
  on public.world_capability_grant_scopes(grant_id, organization_id, country_id, organ_id, object_type, object_id)
  nulls not distinct;

create table if not exists public.world_office_capabilities (
  office_id uuid not null references public.world_organization_offices(id) on delete cascade,
  capability text not null references public.studio2_capabilities(key) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  primary key (office_id, capability)
);

create table if not exists public.world_country_controller_capabilities (
  capability text primary key references public.studio2_capabilities(key) on update cascade on delete restrict,
  created_at timestamptz not null default now()
);

-- TG2 capability catalogue. Later waves add measure/vote/document/chat/court
-- capabilities without changing this scope model.
insert into public.studio2_capabilities(key, domain, label, description, access_level)
values
  ('world.organization.view_private','world','View private organization data','View private organization/member-space metadata when additionally world-scoped.','read'),
  ('world.organization.profile.manage','world','Manage organization profile','Edit organization identity and public profile when world-scoped.','operate'),
  ('world.organization.branding.manage','world','Manage organization branding','Manage organization emblem/banner/accent when world-scoped.','operate'),
  ('world.organization.settings.manage','world','Manage organization settings','Administer organization configuration when world-scoped.','administer'),
  ('world.membership.apply','world','Apply for membership','Submit a country membership application in scope.','operate'),
  ('world.membership.review','world','Review membership','Perform procedural membership review in scope.','approve'),
  ('world.membership.introduce','world','Introduce membership','Introduce an eligible membership application to the competent organ.','approve'),
  ('world.membership.execute_admission','world','Execute admission','Materialize a constitutionally approved membership admission.','approve'),
  ('world.membership.withdraw','world','Withdraw membership','Confirm voluntary withdrawal for the controlled country.','operate'),
  ('world.membership.execute_expulsion','world','Execute expulsion','Materialize a constitutionally approved membership expulsion.','approve'),
  ('world.membership.suspend','world','Suspend membership','Apply an authorized membership suspension.','approve'),
  ('world.representation.manage','world','Manage representation','Manage a country representative in an organization.','operate'),
  ('world.proxy.request','world','Request proxy','Request a representation proxy.','operate'),
  ('world.proxy.approve','world','Approve proxy','Approve or reject an organization proxy request.','approve'),
  ('world.office.manage','world','Manage offices','Configure organization offices when authorized.','administer'),
  ('world.office.term.assign','world','Assign office term','Start an authorized office term.','approve'),
  ('world.office.term.transition','world','Transition office term','Conclude, supersede or transition an office term.','approve')
on conflict (key) do nothing;

-- Explicit data-driven self-service capabilities of the canonical country
-- controller. More capabilities can be added in later waves without changing
-- authorization code.
insert into public.world_country_controller_capabilities(capability)
values
  ('world.membership.apply'),
  ('world.membership.withdraw'),
  ('world.representation.manage'),
  ('world.proxy.request')
on conflict do nothing;

-- Application-time proxy expiry: an approved proxy stops being effective at
-- valid_until even if a background job has not yet materialized status=expired.
create or replace function private.world_proxy_is_effective(
  p_status text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_at timestamptz
)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $effective$
  select p_status = 'approved'
     and p_valid_from <= p_at
     and p_at < p_valid_until
$effective$;
revoke all on function private.world_proxy_is_effective(text, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;

-- Canonical world capability check. Existing Permission Engine grants remain
-- the grant identity. World scope is mandatory for explicit grants; offices
-- derive capabilities from explicit office->capability configuration; current
-- country authority derives only the small data-driven self-service set above.
create or replace function public.world_access_allowed(
  p_capability text,
  p_organization_id uuid,
  p_country_id uuid default null,
  p_organ_id uuid default null,
  p_object_type text default null,
  p_object_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $allowed$
  select coalesce(
    (select auth.uid()) is not null
    and p_organization_id is not null
    and exists (select 1 from public.studio2_capabilities c where c.key = p_capability)
    and (
      public.studio2_access_allowed('system.manage', null, false)
      or exists (
        select 1
        from public.studio2_capability_grants g
        join public.world_capability_grant_scopes s on s.grant_id = g.id
        where g.user_id = (select auth.uid())
          and g.capability = p_capability
          and g.edition_id is null
          and (g.expires_at is null or g.expires_at > now())
          and s.organization_id = p_organization_id
          and (s.country_id is null or s.country_id is not distinct from p_country_id)
          and (s.organ_id is null or s.organ_id is not distinct from p_organ_id)
          and (
            s.object_type is null
            or (s.object_type is not distinct from p_object_type and s.object_id is not distinct from p_object_id)
          )
      )
      or exists (
        select 1
        from public.world_office_terms term
        join public.world_organization_offices office on office.id = term.office_id
        join public.world_office_capabilities office_cap on office_cap.office_id = office.id
        where term.status = 'active'
          and term.ends_at is null
          and term.holder_user_id = (select auth.uid())
          and office.active
          and office.organization_id = p_organization_id
          and office_cap.capability = p_capability
          and (office.organ_id is null or office.organ_id is not distinct from p_organ_id)
      )
      or exists (
        select 1
        from public.world_country_controller_capabilities controller_cap
        join public.country_accounts account
          on account.user_id = (select auth.uid())
         and account.country_id = p_country_id
         and account.status = 'active'
        where controller_cap.capability = p_capability
      )
    ),
    false
  )
$allowed$;
revoke all on function public.world_access_allowed(text, uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.world_access_allowed(text, uuid, uuid, uuid, text, uuid) to authenticated, service_role;

-- RLS / grants. Public canonical tables are readable only when the owning
-- organization says public. Tables containing auth-user linkage remain behind
-- safe projections and authenticated scoped reads.
foreach
-- placeholder removed below; statements are explicit for migration clarity.

alter table public.world_organizations enable row level security;
alter table public.world_organization_organs enable row level security;
alter table public.world_organization_memberships enable row level security;
alter table public.world_organization_representations enable row level security;
alter table public.world_representation_proxies enable row level security;
alter table public.world_organization_offices enable row level security;
alter table public.world_office_terms enable row level security;
alter table public.world_capability_grant_scopes enable row level security;
alter table public.world_office_capabilities enable row level security;
alter table public.world_country_controller_capabilities enable row level security;

revoke all on table public.world_organizations from public, anon, authenticated;
revoke all on table public.world_organization_organs from public, anon, authenticated;
revoke all on table public.world_organization_memberships from public, anon, authenticated;
revoke all on table public.world_organization_representations from public, anon, authenticated;
revoke all on table public.world_representation_proxies from public, anon, authenticated;
revoke all on table public.world_organization_offices from public, anon, authenticated;
revoke all on table public.world_office_terms from public, anon, authenticated;
revoke all on table public.world_capability_grant_scopes from public, anon, authenticated;
revoke all on table public.world_office_capabilities from public, anon, authenticated;
revoke all on table public.world_country_controller_capabilities from public, anon, authenticated;

grant select on table public.world_organizations, public.world_organization_organs,
  public.world_organization_memberships, public.world_organization_offices to anon, authenticated;
grant select on table public.world_organization_representations, public.world_representation_proxies,
  public.world_office_terms to authenticated;
grant all on table public.world_organizations, public.world_organization_organs,
  public.world_organization_memberships, public.world_organization_representations,
  public.world_representation_proxies, public.world_organization_offices,
  public.world_office_terms, public.world_capability_grant_scopes,
  public.world_office_capabilities, public.world_country_controller_capabilities to service_role;

drop policy if exists world_organizations_public_read on public.world_organizations;
create policy world_organizations_public_read on public.world_organizations
for select to anon, authenticated
using (public_visibility = 'public');

drop policy if exists world_organs_public_read on public.world_organization_organs;
create policy world_organs_public_read on public.world_organization_organs
for select to anon, authenticated
using (
  visibility = 'public' and exists (
    select 1 from public.world_organizations organization
    where organization.id = organization_id and organization.public_visibility = 'public'
  )
);

drop policy if exists world_memberships_public_read on public.world_organization_memberships;
create policy world_memberships_public_read on public.world_organization_memberships
for select to anon, authenticated
using (exists (
  select 1 from public.world_organizations organization
  where organization.id = organization_id and organization.public_visibility = 'public'
));

drop policy if exists world_offices_public_read on public.world_organization_offices;
create policy world_offices_public_read on public.world_organization_offices
for select to anon, authenticated
using (exists (
  select 1 from public.world_organizations organization
  where organization.id = organization_id and organization.public_visibility = 'public'
));

drop policy if exists world_representations_scoped_read on public.world_organization_representations;
create policy world_representations_scoped_read on public.world_organization_representations
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.world_access_allowed('world.organization.view_private', organization_id, country_id, null, null, null)
  or exists (
    select 1 from public.world_organizations organization
    where organization.id = organization_id and organization.public_visibility = 'public'
  )
);

drop policy if exists world_proxies_scoped_read on public.world_representation_proxies;
create policy world_proxies_scoped_read on public.world_representation_proxies
for select to authenticated
using (
  proxy_user_id = (select auth.uid())
  or exists (
    select 1
    from public.world_organization_representations representation
    where representation.id = representation_id
      and (
        representation.user_id = (select auth.uid())
        or public.world_access_allowed('world.organization.view_private', representation.organization_id, representation.country_id, null, 'representation', representation.id)
      )
  )
);

drop policy if exists world_office_terms_scoped_read on public.world_office_terms;
create policy world_office_terms_scoped_read on public.world_office_terms
for select to authenticated
using (
  holder_user_id = (select auth.uid())
  or exists (
    select 1
    from public.world_organization_offices office
    join public.world_organizations organization on organization.id = office.organization_id
    where office.id = office_id
      and (
        organization.public_visibility = 'public'
        or public.world_access_allowed('world.organization.view_private', office.organization_id, represented_country_id, office.organ_id, 'office', office.id)
      )
  )
);

-- Safe public organization projection. Auth user ids and capability grant scope
-- never leave the database through this projection.
create or replace function public.world_organization_projection_v1(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $projection$
  select jsonb_build_object(
    'organization', jsonb_build_object(
      'id', organization.id,
      'slug', organization.slug,
      'officialName', organization.official_name,
      'shortName', organization.short_name,
      'type', organization.type,
      'description', organization.description,
      'emblemUrl', organization.emblem_url,
      'bannerUrl', organization.banner_url,
      'accentToken', organization.accent_token,
      'status', organization.status,
      'revision', organization.revision
    ),
    'organs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', organ.id, 'slug', organ.slug, 'name', organ.name,
        'shortName', organ.short_name, 'type', organ.type, 'status', organ.status,
        'sortOrder', organ.sort_order, 'revision', organ.revision
      ) order by organ.sort_order, organ.name)
      from public.world_organization_organs organ
      where organ.organization_id = organization.id and organ.visibility = 'public'
    ), '[]'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', membership.id, 'countryId', membership.country_id,
        'membershipType', membership.membership_type, 'status', membership.status,
        'joinedAt', membership.joined_at, 'endedAt', membership.ended_at,
        'revision', membership.revision
      ) order by membership.joined_at, membership.country_id)
      from public.world_organization_memberships membership
      where membership.organization_id = organization.id
    ), '[]'::jsonb),
    'representatives', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', representation.id, 'countryId', representation.country_id,
        'personId', representation.person_id, 'displayName', person.display_name,
        'role', representation.role, 'votingAuthority', representation.voting_authority,
        'startsAt', representation.starts_at, 'endsAt', representation.ends_at,
        'revision', representation.revision
      ) order by representation.country_id, representation.starts_at)
      from public.world_organization_representations representation
      join public.delegation_people person on person.id = representation.person_id
      where representation.organization_id = organization.id
    ), '[]'::jsonb),
    'offices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', office.id, 'slug', office.slug, 'title', office.title,
        'officeType', office.office_type, 'appointmentMethod', office.appointment_method,
        'defaultTermLengthEditions', office.default_term_length_editions,
        'successionPolicy', office.succession_policy, 'active', office.active,
        'revision', office.revision,
        'currentTerm', (
          select jsonb_build_object(
            'id', term.id, 'holderPersonId', term.holder_person_id,
            'holderDisplayName', holder.display_name,
            'representedCountryId', term.represented_country_id,
            'startEditionId', term.start_edition_id, 'endEditionId', term.end_edition_id,
            'startsAt', term.starts_at, 'endsAt', term.ends_at,
            'termKind', term.term_kind, 'status', term.status, 'revision', term.revision
          )
          from public.world_office_terms term
          join public.delegation_people holder on holder.id = term.holder_person_id
          where term.office_id = office.id and term.status = 'active'
          limit 1
        )
      ) order by office.display_priority, office.title)
      from public.world_organization_offices office
      where office.organization_id = organization.id and office.active
    ), '[]'::jsonb)
  )
  from public.world_organizations organization
  where organization.slug = lower(btrim(p_slug))
    and organization.public_visibility = 'public'
$projection$;
revoke all on function public.world_organization_projection_v1(text) from public, anon, authenticated;
grant execute on function public.world_organization_projection_v1(text) to anon, authenticated, service_role;

-- Canonical R2 representative assignment. The command is usable by the current
-- country controller through the data-driven self-service capability or by an
-- explicitly world-scoped office/grant. It never trusts frontend role labels.
create or replace function public.world_assign_organization_representative_v1(
  p_organization_id uuid,
  p_country_id uuid,
  p_person_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_revision bigint default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $assign$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_existing public.world_organization_representations%rowtype;
  v_revision bigint;
  v_user_id uuid;
  v_result jsonb;
begin
  if not public.world_access_allowed('world.representation.manage', p_organization_id, p_country_id, null, null, null) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_organization_id is null or p_country_id is null or p_person_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, coalesce(p_correlation_id, p_operation_id),
    'world.representation.assign', 'R2',
    jsonb_build_object('organizationId', p_organization_id, 'countryId', p_country_id, 'subjectType', 'world_representation'),
    jsonb_build_object('organizationId', p_organization_id, 'countryId', p_country_id,
      'personId', p_person_id, 'expectedRevision', p_expected_revision)
  );
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', true);
  end if;

  if not exists (
    select 1 from public.world_organization_memberships membership
    where membership.organization_id = p_organization_id
      and membership.country_id = p_country_id
      and membership.ended_at is null
      and membership.status in ('member','observer','associate')
  ) then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;
  if not exists (select 1 from public.delegation_people person where person.id = p_person_id) then
    raise exception using errcode = '23503', message = 'VALIDATION';
  end if;

  select representation.* into v_existing
  from public.world_organization_representations representation
  where representation.organization_id = p_organization_id
    and representation.country_id = p_country_id
    and representation.ends_at is null
    and representation.role = 'representative'
    and representation.voting_authority
  for update;

  if p_expected_revision is not null
     and coalesce(v_existing.revision, 0) is distinct from p_expected_revision then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if v_existing.id is not null and v_existing.person_id = p_person_id then
    v_result := jsonb_build_object('ok', true, 'changed', false,
      'representationId', v_existing.id, 'revision', v_existing.revision, 'operationId', v_operation_id);
    perform private.studio2_complete_operation(v_operation_id, v_result);
    return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', false);
  end if;

  select coalesce(max(representation.revision), 0) + 1 into v_revision
  from public.world_organization_representations representation
  where representation.organization_id = p_organization_id and representation.country_id = p_country_id;

  if v_existing.id is not null then
    update public.world_organization_representations
    set ends_at = now(), end_edition_id = null
    where id = v_existing.id;
  end if;

  select term.user_id into v_user_id
  from public.world_country_control_terms term
  where term.country_id = p_country_id
    and term.person_id = p_person_id
    and term.ended_at is null;

  insert into public.world_organization_representations(
    organization_id, country_id, person_id, user_id, role, voting_authority,
    starts_at, source, revision
  ) values (
    p_organization_id, p_country_id, p_person_id, v_user_id, 'representative', true,
    now(), case when v_user_id is null then 'explicit_person' else 'country_controller' end, v_revision
  )
  returning id into v_existing.id;

  perform private.v3_emit_domain_event(
    'world.representation.changed', 'world_representation', v_existing.id::text,
    v_revision, v_operation_id, null, null,
    jsonb_build_object('organizationId', p_organization_id, 'countryId', p_country_id,
      'representationId', v_existing.id, 'personId', p_person_id, 'revision', v_revision),
    1, array[]::text[]
  );

  v_result := jsonb_build_object('ok', true, 'changed', true,
    'representationId', v_existing.id, 'revision', v_revision, 'operationId', v_operation_id);
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id) || jsonb_build_object('replayed', false);
end
$assign$;
revoke all on function public.world_assign_organization_representative_v1(uuid, uuid, uuid, uuid, text, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.world_assign_organization_representative_v1(uuid, uuid, uuid, uuid, text, bigint, uuid)
  to authenticated, service_role;

-- Idempotent seed of current canonical organizations, organs and offices.
insert into public.world_organizations(slug, official_name, short_name, type, description, status, public_visibility)
values
  ('guard','Global Union for Allied Resilience and Defence','GUARD','international_union',
    'Independent Terra Solaris international union; grandfathered as recognized under the canonical governance plan.','active','public'),
  ('unity','UNITY','UNITY','international_organization',
    'Broad international institution of recognized sovereign Terra Solaris countries.','active','public')
on conflict (slug) do update set
  official_name = excluded.official_name,
  short_name = excluded.short_name,
  type = excluded.type,
  description = excluded.description,
  updated_at = now();

insert into public.world_organization_organs(organization_id, slug, name, short_name, type, visibility, status, sort_order)
select organization.id, seed.slug, seed.name, seed.short_name, seed.type, 'public', 'active', seed.sort_order
from public.world_organizations organization
join (values
  ('guard','gag','General Assembly of GUARD','GAG','general_assembly',10),
  ('unity','general-assembly','UNITY General Assembly',null,'general_assembly',10),
  ('unity','ethics-committee','UNITY Ethics Committee',null,'committee',20)
) as seed(org_slug, slug, name, short_name, type, sort_order)
  on seed.org_slug = organization.slug
on conflict (organization_id, slug) do update set
  name = excluded.name, short_name = excluded.short_name, type = excluded.type,
  visibility = excluded.visibility, status = excluded.status, sort_order = excluded.sort_order,
  updated_at = now();

insert into public.world_organization_offices(
  organization_id, organ_id, slug, title, office_type, appointment_method,
  default_term_length_editions, succession_policy, display_priority, active
)
select organization.id, null, seed.slug, seed.title, seed.office_type, seed.appointment_method,
  seed.term_length, seed.succession_policy, seed.display_priority, true
from public.world_organizations organization
join (values
  ('guard','chairperson','Chairperson','executive_leader','election',2,
    'Deputy Chairperson becomes Acting Chairperson when the Chairperson leaves office; a new Chairperson election follows.',10),
  ('guard','deputy-chairperson','Deputy Chairperson','deputy_executive','running_mate',2,
    'Operational second-in-command chosen by the Chairperson candidate; not an independently equal executive.',20),
  ('unity','secretary-general','Secretary-General','executive_leader','election',2,
    'Deputy Secretary-General provides acting continuity according to the Charter workflow.',10),
  ('unity','deputy-secretary-general','Deputy Secretary-General','deputy_executive','running_mate',2,
    'Operational deputy chosen by the Secretary-General candidate.',20)
) as seed(org_slug, slug, title, office_type, appointment_method, term_length, succession_policy, display_priority)
  on seed.org_slug = organization.slug
on conflict (organization_id, slug) do update set
  title = excluded.title, office_type = excluded.office_type,
  appointment_method = excluded.appointment_method,
  default_term_length_editions = excluded.default_term_length_editions,
  succession_policy = excluded.succession_policy,
  display_priority = excluded.display_priority,
  active = true;

-- Foundation office-capability bundles. These are explicit authorization data,
-- not frontend title checks.
insert into public.world_office_capabilities(office_id, capability)
select office.id, cap.capability
from public.world_organization_offices office
join public.world_organizations organization on organization.id = office.organization_id
join (values
  ('guard','chairperson','world.organization.profile.manage'),
  ('guard','chairperson','world.membership.review'),
  ('guard','chairperson','world.membership.introduce'),
  ('guard','chairperson','world.membership.execute_admission'),
  ('guard','chairperson','world.membership.execute_expulsion'),
  ('guard','chairperson','world.membership.suspend'),
  ('guard','chairperson','world.representation.manage'),
  ('guard','chairperson','world.proxy.approve'),
  ('guard','chairperson','world.office.manage'),
  ('guard','chairperson','world.office.term.assign'),
  ('guard','chairperson','world.office.term.transition'),
  ('guard','deputy-chairperson','world.organization.profile.manage'),
  ('guard','deputy-chairperson','world.membership.review'),
  ('guard','deputy-chairperson','world.representation.manage'),
  ('guard','deputy-chairperson','world.proxy.approve'),
  ('unity','secretary-general','world.organization.profile.manage'),
  ('unity','secretary-general','world.membership.review'),
  ('unity','secretary-general','world.membership.execute_expulsion'),
  ('unity','secretary-general','world.membership.suspend'),
  ('unity','secretary-general','world.representation.manage'),
  ('unity','secretary-general','world.proxy.approve'),
  ('unity','secretary-general','world.office.manage'),
  ('unity','secretary-general','world.office.term.assign'),
  ('unity','secretary-general','world.office.term.transition'),
  ('unity','deputy-secretary-general','world.organization.profile.manage'),
  ('unity','deputy-secretary-general','world.membership.review'),
  ('unity','deputy-secretary-general','world.representation.manage'),
  ('unity','deputy-secretary-general','world.proxy.approve')
) as cap(org_slug, office_slug, capability)
  on cap.org_slug = organization.slug and cap.office_slug = office.slug
on conflict do nothing;

comment on table public.world_organizations is 'Generic Terra Solaris international organizations. GUARD and UNITY are seed records, not hardcoded schema branches.';
comment on function public.world_access_allowed(text, uuid, uuid, uuid, text, uuid) is 'Permission Engine V2 extension for organization/country/organ/object-scoped Terra Solaris capabilities.';

-- S13 semantic adoption contract.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg2.world-institution-foundation', 1, 'forward_fix_only', false, null,
      'Add generic organizations/organs/memberships/representations/proxies/offices, world-scoped capability resolution, public institution projection, GUARD/UNITY seeds and receipted representative assignment.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
