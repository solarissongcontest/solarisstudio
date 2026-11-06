begin;

-- Terra Solaris Governance TG2 core. GUARD and UNITY are seed records inside a
-- generic organization model; no GUARD-only or UNITY-only table hierarchy.

create table public.world_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  official_name text not null,
  short_name text not null,
  type text not null default 'international_organization',
  description text,
  emblem_url text,
  banner_url text,
  accent_token text,
  founded_at timestamptz,
  founded_edition_id uuid references public.editions(id) on delete set null,
  recognized_at timestamptz,
  recognition_authority_id uuid references public.world_organizations(id) on delete set null,
  status text not null default 'proposed',
  public_visibility text not null default 'public',
  current_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  constraint world_organizations_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint world_organizations_status_check check (status in ('proposed','recognized','active','suspended','dissolved','historical')),
  constraint world_organizations_visibility_check check (public_visibility in ('public','members','private')),
  constraint world_organizations_name_check check (length(btrim(official_name)) > 0 and length(btrim(short_name)) > 0),
  constraint world_organizations_revision_check check (revision >= 1)
);

create table public.world_organization_organs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  slug text not null,
  name text not null,
  short_name text,
  type text not null default 'assembly',
  description text,
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

create table public.world_organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  membership_type text not null default 'member',
  status text not null default 'member',
  joined_at timestamptz not null default now(),
  joined_edition_id uuid references public.editions(id) on delete set null,
  ended_at timestamptz,
  ended_edition_id uuid references public.editions(id) on delete set null,
  admission_measure_id uuid,
  termination_measure_id uuid,
  termination_reason text,
  created_at timestamptz not null default now(),
  revision bigint not null default 1,
  constraint world_membership_type_check check (membership_type in ('member','observer','associate')),
  constraint world_membership_status_check check (status in ('member','observer','associate','suspended','withdrawn','expelled','former')),
  constraint world_membership_end_check check (
    (status in ('member','observer','associate','suspended') and ended_at is null)
    or (status in ('withdrawn','expelled','former') and ended_at is not null)
  ),
  constraint world_membership_time_check check (ended_at is null or ended_at >= joined_at),
  constraint world_membership_revision_check check (revision >= 1)
);
create unique index world_organization_memberships_one_open_uidx
  on public.world_organization_memberships(organization_id, country_id)
  where ended_at is null;
create index world_organization_memberships_country_idx
  on public.world_organization_memberships(country_id, organization_id, joined_at desc);

create table public.world_organization_representations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  country_id uuid not null references public.countries(id) on delete restrict,
  person_id uuid not null references public.delegation_people(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  role text not null default 'representative',
  voting_authority boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  start_edition_id uuid references public.editions(id) on delete set null,
  end_edition_id uuid references public.editions(id) on delete set null,
  source text not null default 'manual',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  constraint world_representation_role_check check (length(btrim(role)) between 1 and 80),
  constraint world_representation_source_check check (length(btrim(source)) between 1 and 80),
  constraint world_representation_time_check check (ends_at is null or ends_at >= starts_at),
  constraint world_representation_revision_check check (revision >= 1)
);
create unique index world_organization_representations_voting_rep_uidx
  on public.world_organization_representations(organization_id, country_id)
  where ends_at is null and role = 'representative' and voting_authority;
create unique index world_organization_representations_revision_uidx
  on public.world_organization_representations(organization_id, country_id, revision);

create table public.world_representation_proxies (
  id uuid primary key default gen_random_uuid(),
  representation_id uuid not null references public.world_organization_representations(id) on delete restrict,
  proxy_person_id uuid not null references public.delegation_people(id) on delete restrict,
  proxy_user_id uuid references auth.users(id) on delete set null,
  session_id uuid,
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  reason text,
  status text not null default 'requested',
  requested_by_person_id uuid references public.delegation_people(id) on delete set null,
  approved_by_person_id uuid references public.delegation_people(id) on delete set null,
  revoked_at timestamptz,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  constraint world_proxy_status_check check (status in ('requested','approved','rejected','expired','revoked')),
  constraint world_proxy_time_check check (valid_until > valid_from),
  constraint world_proxy_revision_check check (revision >= 1)
);
create index world_representation_proxies_rep_idx
  on public.world_representation_proxies(representation_id, valid_until desc);

create table public.world_organization_offices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  organ_id uuid references public.world_organization_organs(id) on delete restrict,
  slug text not null,
  title text not null,
  office_type text not null,
  appointment_method text not null,
  default_term_length_editions integer,
  succession_policy text,
  display_priority integer not null default 0,
  active boolean not null default true,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  unique (organization_id, slug),
  constraint world_office_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint world_office_title_check check (length(btrim(title)) > 0),
  constraint world_office_term_length_check check (default_term_length_editions is null or default_term_length_editions > 0),
  constraint world_office_revision_check check (revision >= 1)
);

create table public.world_office_terms (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.world_organization_offices(id) on delete restrict,
  holder_person_id uuid not null references public.delegation_people(id) on delete restrict,
  holder_user_id uuid references auth.users(id) on delete set null,
  represented_country_id uuid references public.countries(id) on delete set null,
  start_edition_id uuid references public.editions(id) on delete set null,
  end_edition_id uuid references public.editions(id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  term_kind text not null default 'elected',
  predecessor_term_id uuid references public.world_office_terms(id) on delete set null,
  succession_reason text,
  status text not null default 'active',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  constraint world_office_term_kind_check check (term_kind in ('elected','appointed','acting','interim','historical')),
  constraint world_office_term_status_check check (status in ('active','concluded','superseded','historical')),
  constraint world_office_term_end_check check ((status = 'active' and ends_at is null) or (status <> 'active' and ends_at is not null)),
  constraint world_office_term_time_check check (ends_at is null or ends_at >= starts_at),
  constraint world_office_term_revision_check check (revision >= 1)
);
create unique index world_office_terms_one_active_uidx
  on public.world_office_terms(office_id) where status = 'active';
create unique index world_office_terms_revision_uidx
  on public.world_office_terms(office_id, revision);

-- Existing Permission Engine V2 remains the capability catalogue/grant owner.
-- This table adds the missing organization/country/organ/object scope dimension.
create table public.world_capability_grant_scopes (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.studio2_capability_grants(id) on delete cascade,
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  country_id uuid references public.countries(id) on delete restrict,
  organ_id uuid references public.world_organization_organs(id) on delete restrict,
  object_type text,
  object_id uuid,
  created_at timestamptz not null default now(),
  constraint world_capability_scope_object_pair check ((object_type is null) = (object_id is null)),
  constraint world_capability_scope_object_type check (object_type is null or object_type ~ '^[a-z][a-z0-9_.-]{0,79}$')
);
create unique index world_capability_grant_scopes_uidx
  on public.world_capability_grant_scopes(grant_id, organization_id, country_id, organ_id, object_type, object_id)
  nulls not distinct;

create table public.world_office_capabilities (
  office_id uuid not null references public.world_organization_offices(id) on delete cascade,
  capability text not null references public.studio2_capabilities(key) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  primary key (office_id, capability)
);

create table public.world_country_controller_capabilities (
  capability text primary key references public.studio2_capabilities(key) on update cascade on delete restrict,
  created_at timestamptz not null default now()
);

insert into public.studio2_capabilities(key, domain, label, description, access_level)
values
  ('world.organization.view_private','world','View private organization data','View private organization data when additionally world-scoped.','read'),
  ('world.organization.profile.manage','world','Manage organization profile','Edit organization identity/profile when world-scoped.','operate'),
  ('world.organization.branding.manage','world','Manage organization branding','Manage organization branding when world-scoped.','operate'),
  ('world.organization.settings.manage','world','Manage organization settings','Administer organization configuration when world-scoped.','administer'),
  ('world.membership.apply','world','Apply for membership','Submit a country membership application in scope.','operate'),
  ('world.membership.review','world','Review membership','Perform procedural membership review in scope.','approve'),
  ('world.membership.introduce','world','Introduce membership','Introduce an eligible application to the competent organ.','approve'),
  ('world.membership.execute_admission','world','Execute admission','Materialize a constitutionally approved admission.','approve'),
  ('world.membership.withdraw','world','Withdraw membership','Confirm voluntary withdrawal for the controlled country.','operate'),
  ('world.membership.execute_expulsion','world','Execute expulsion','Materialize a constitutionally approved expulsion.','approve'),
  ('world.membership.suspend','world','Suspend membership','Apply an authorized membership suspension.','approve'),
  ('world.representation.manage','world','Manage representation','Manage country representation in an organization.','operate'),
  ('world.proxy.request','world','Request proxy','Request a representation proxy.','operate'),
  ('world.proxy.approve','world','Approve proxy','Approve or reject a representation proxy.','approve'),
  ('world.office.manage','world','Manage offices','Configure organization offices in scope.','administer'),
  ('world.office.term.assign','world','Assign office term','Start an authorized office term.','approve'),
  ('world.office.term.transition','world','Transition office term','Conclude or transition an office term.','approve')
on conflict (key) do nothing;

insert into public.world_country_controller_capabilities(capability)
values ('world.membership.apply'),('world.membership.withdraw'),('world.representation.manage'),('world.proxy.request')
on conflict do nothing;

create or replace function private.world_proxy_is_effective(
  p_status text, p_valid_from timestamptz, p_valid_until timestamptz, p_at timestamptz
)
returns boolean language sql immutable security invoker set search_path = pg_catalog
as $effective$
  select p_status = 'approved' and p_valid_from <= p_at and p_at < p_valid_until
$effective$;
revoke all on function private.world_proxy_is_effective(text,timestamptz,timestamptz,timestamptz)
  from public, anon, authenticated;

-- Fail closed by default. Public policies are added only to rows intentionally
-- safe for public discovery; auth-linked tables wait for the TG2 scope resolver.
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

revoke all on table public.world_organizations, public.world_organization_organs,
  public.world_organization_memberships, public.world_organization_representations,
  public.world_representation_proxies, public.world_organization_offices,
  public.world_office_terms, public.world_capability_grant_scopes,
  public.world_office_capabilities, public.world_country_controller_capabilities
  from public, anon, authenticated;

grant select on table public.world_organizations, public.world_organization_organs,
  public.world_organization_memberships, public.world_organization_offices to anon, authenticated;
grant all on table public.world_organizations, public.world_organization_organs,
  public.world_organization_memberships, public.world_organization_representations,
  public.world_representation_proxies, public.world_organization_offices,
  public.world_office_terms, public.world_capability_grant_scopes,
  public.world_office_capabilities, public.world_country_controller_capabilities to service_role;

create policy world_organizations_public_read on public.world_organizations
for select to anon, authenticated using (public_visibility = 'public');
create policy world_organs_public_read on public.world_organization_organs
for select to anon, authenticated using (
  visibility = 'public' and exists (
    select 1 from public.world_organizations o
    where o.id = organization_id and o.public_visibility = 'public'
  )
);
create policy world_memberships_public_read on public.world_organization_memberships
for select to anon, authenticated using (exists (
  select 1 from public.world_organizations o
  where o.id = organization_id and o.public_visibility = 'public'
));
create policy world_offices_public_read on public.world_organization_offices
for select to anon, authenticated using (exists (
  select 1 from public.world_organizations o
  where o.id = organization_id and o.public_visibility = 'public'
));

-- Canonical organizations and first institutional structure. Missing historical
-- membership/leader data is intentionally NOT invented here.
insert into public.world_organizations(slug,official_name,short_name,type,description,status,public_visibility)
values
  ('guard','Global Union for Allied Resilience and Defence','GUARD','international_union',
   'Independent Terra Solaris international union; grandfathered as recognized by the canonical governance plan.','active','public'),
  ('unity','UNITY','UNITY','international_organization',
   'Broad international institution of recognized sovereign Terra Solaris countries.','active','public');

insert into public.world_organization_organs(organization_id,slug,name,short_name,type,sort_order)
select o.id,s.slug,s.name,s.short_name,s.type,s.sort_order
from public.world_organizations o
join (values
  ('guard','gag','General Assembly of GUARD','GAG','general_assembly',10),
  ('unity','general-assembly','UNITY General Assembly',null,'general_assembly',10),
  ('unity','ethics-committee','UNITY Ethics Committee',null,'committee',20)
) s(org_slug,slug,name,short_name,type,sort_order) on s.org_slug=o.slug;

insert into public.world_organization_offices(
  organization_id,slug,title,office_type,appointment_method,default_term_length_editions,succession_policy,display_priority
)
select o.id,s.slug,s.title,s.office_type,s.appointment_method,s.term_length,s.succession_policy,s.display_priority
from public.world_organizations o
join (values
  ('guard','chairperson','Chairperson','executive_leader','election',2,
   'Deputy Chairperson becomes Acting Chairperson when the Chairperson leaves office; a new Chairperson election follows.',10),
  ('guard','deputy-chairperson','Deputy Chairperson','deputy_executive','running_mate',2,
   'Operational second-in-command chosen by the Chairperson candidate; not an independently equal executive.',20),
  ('unity','secretary-general','Secretary-General','executive_leader','election',2,
   'Deputy Secretary-General provides acting continuity according to the Charter workflow.',10),
  ('unity','deputy-secretary-general','Deputy Secretary-General','deputy_executive','running_mate',2,
   'Operational deputy chosen by the Secretary-General candidate.',20)
) s(org_slug,slug,title,office_type,appointment_method,term_length,succession_policy,display_priority)
  on s.org_slug=o.slug;

comment on table public.world_organizations is
  'Generic Terra Solaris international organizations. GUARD and UNITY are data, not schema branches.';

-- S13 semantic adoption contract.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg2.world-institution-core',1,'forward_fix_only',false,null,
      'Add generic organizations, organs, memberships, representations, proxies, offices, office terms and world-scope extension tables; seed GUARD and UNITY without inventing historical memberships or officeholders.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
