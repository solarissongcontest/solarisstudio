begin;

-- TG3: A section hidden from BOTH Country and Wiki is not public content.
-- Previous consolidated SELECT policies allowed direct Data API reads of even
-- hidden sections. These flags already exist in the canonical Page Builder;
-- do not create a second disclosure switch or a second content store.
--
-- Country owners and explicitly authorized Organizer staff retain access to
-- unpublished sections in MySolaris for editing. The actual visibility flags
-- belong to country_profile_sections, never a browser-local preference.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg3.country-section-publication-rls',
      1,
      'forward_fix_only',
      false,
      null,
      'Restrict public Country/Wiki section reads to sections published on at least one surface; retain owner and capability-scoped editing reads.'
    );
  end if;
end
$contract$;

-- Fail closed if an unknown permissive reader policy could bypass publication
-- filters via PostgreSQL's OR composition. This preserves the protection
-- originally specified in #2038 without installing duplicate policy families.
do $publication_preflight$
begin
  if to_regclass('public.country_profile_sections') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'country_profile_sections'
         and column_name = 'visible_on_country'
     )
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'country_profile_sections'
         and column_name = 'visible_on_wiki'
     ) then
    raise exception 'WORLD_COUNTRY_SECTION_PUBLICATION_SCHEMA_NOT_READY'
      using errcode = '55000';
  end if;

  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'country_profile_sections'
      and p.permissive = 'PERMISSIVE'
      and p.cmd in ('SELECT','ALL')
      and p.policyname not in (
        'solaris consolidated anon read',
        'solaris consolidated authenticated read'
      )
  ) then
    raise exception 'WORLD_COUNTRY_SECTION_UNKNOWN_PERMISSIVE_READ_POLICY'
      using errcode = '55000';
  end if;
end
$publication_preflight$;

alter table public.country_profile_sections enable row level security;

-- Consolidated permissive read policies must be REPLACED, not supplemented
-- by another permissive policy, because PostgreSQL ORs permissive policies.
drop policy if exists "solaris consolidated anon read"
  on public.country_profile_sections;
create policy "solaris consolidated anon read"
on public.country_profile_sections
for select to anon
using (
  visible_on_country is true or visible_on_wiki is true
);

drop policy if exists "solaris consolidated authenticated read"
  on public.country_profile_sections;
create policy "solaris consolidated authenticated read"
on public.country_profile_sections
for select to authenticated
using (
  visible_on_country is true
  or visible_on_wiki is true
  or public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.manage', null, true)
);

-- Existing country-owner/Organizer INSERT, UPDATE and DELETE policies are
-- deliberately untouched; ordinary participants gain no new DML authority.
comment on table public.country_profile_sections is
  'Canonical country-authored Page Builder sections. Both-surface-hidden rows are private to their country owner or delegated Organizer managers; public readers only see published sections.';

-- Prove the final role-filtered policies are the only permissive SELECT/ALL
-- readers; a second permissive policy can silently widen publication.
do $publication_postcondition$
begin
  if exists (
    select 1 from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'country_profile_sections'
      and p.permissive = 'PERMISSIVE'
      and p.cmd in ('SELECT','ALL')
      and p.policyname not in (
        'solaris consolidated anon read',
        'solaris consolidated authenticated read'
      )
  ) then
    raise exception 'WORLD_COUNTRY_SECTION_READ_POLICY_OVERRIDDEN'
      using errcode = '55000';
  end if;
  if (select count(*) from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'country_profile_sections'
        and p.policyname in (
          'solaris consolidated anon read',
          'solaris consolidated authenticated read'
        )) <> 2 then
    raise exception 'WORLD_COUNTRY_SECTION_READ_POLICY_MISSING'
      using errcode = '55000';
  end if;
end
$publication_postcondition$;

notify pgrst, 'reload schema';
commit;
