begin;

-- World TG3/TG16: publication enforcement for the EXISTING country section
-- authority. A section hidden from both Country and Wiki must not be
-- retrievable by anonymous or unrelated signed-in users through PostgREST.
-- This forward-only migration does not alter stored content or authoring rights.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.world.country-section-publication-rls',
      1,
      'forward_fix_only',
      false,
      null,
      'Enforce canonical Country/Wiki section visibility in database SELECT policies while retaining exact country-owner and existing delegation.manage authoring access.'
    );
  end if;
end
$contract$;

-- An unseen permissive SELECT/ALL policy could OR past the following policies.
-- Do not silently declare a publication boundary until every reader path is
-- reconciled. The known consolidated policy names are from current main.
do $preflight$
begin
  if to_regclass('public.country_profile_sections') is null
     or not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'country_profile_sections'
         and column_name = 'visible_on_country'
     )
     or not exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'country_profile_sections'
         and column_name = 'visible_on_wiki'
     ) then
    raise exception 'WORLD_COUNTRY_SECTION_PUBLICATION_SCHEMA_NOT_READY'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_policies p
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
$preflight$;

alter table public.country_profile_sections enable row level security;

drop policy if exists "solaris consolidated anon read"
  on public.country_profile_sections;
drop policy if exists "solaris consolidated authenticated read"
  on public.country_profile_sections;

create policy "country sections published anon read"
on public.country_profile_sections
for select to anon
using (
  coalesce(visible_on_country, false)
  or coalesce(visible_on_wiki, false)
);

create policy "country sections published or authorized authenticated read"
on public.country_profile_sections
for select to authenticated
using (
  coalesce(visible_on_country, false)
  or coalesce(visible_on_wiki, false)
  or public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.manage', null, true)
);

-- Authoring INSERT / UPDATE / DELETE authority stays with the pre-existing
-- owner/capability policies. Never add a generic authenticated write grant.
comment on policy "country sections published anon read"
  on public.country_profile_sections is
  'Anonymous World readers may fetch only sections explicitly visible on Country or Wiki. The content owner can still hide drafts from both.';
comment on policy "country sections published or authorized authenticated read"
  on public.country_profile_sections is
  'Published Country/Wiki sections are world-readable; unlisted sections are readable only by the current country controller or explicitly authorized delegation manager.';

-- Assert our effective policy set, so a future migration cannot silently
-- leave a second permissive SELECT/ALL policy as an authorization bypass.
do $postcondition$
begin
  if exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'country_profile_sections'
      and p.permissive = 'PERMISSIVE'
      and p.cmd in ('SELECT','ALL')
      and p.policyname not in (
        'country sections published anon read',
        'country sections published or authorized authenticated read'
      )
  ) then
    raise exception 'WORLD_COUNTRY_SECTION_READ_POLICY_OVERRIDDEN'
      using errcode = '55000';
  end if;
  if (select count(*) from pg_policies p
      where p.schemaname = 'public'
        and p.tablename = 'country_profile_sections'
        and p.policyname in (
          'country sections published anon read',
          'country sections published or authorized authenticated read'
        )) <> 2 then
    raise exception 'WORLD_COUNTRY_SECTION_READ_POLICY_MISSING'
      using errcode = '55000';
  end if;
end
$postcondition$;

notify pgrst, 'reload schema';
commit;
