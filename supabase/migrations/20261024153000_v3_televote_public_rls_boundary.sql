begin;

-- System V3 security hardening: preserve the public Televoting experiences that
-- legitimately need an open ballot or a published result without leaving draft
-- round configuration and future entries anonymously readable.
--
-- The legacy Televoting schema originally granted broad public SELECT access to
-- rounds, round_entries and round_countries. Permission Engine v2 later added
-- Organizer capability policies, but the public SELECT union was intentionally
-- preserved by final RLS hygiene. That means a browser can still read draft
-- operational configuration that Public V3 does not need.
--
-- Compatibility boundary:
--   * an OPEN round remains public so the voting booth can render;
--   * a PUBLISHED-result round remains public so historical result readers work;
--   * a CLOSED round remains readable only when it is canonically bound to a
--     published Solaris show, so Show Mode / V3 Live can truthfully show voting
--     closure;
--   * entries/country membership are public only while voting is open or after
--     the round result is published;
--   * Organizer readers retain voting.manage access to all states.
--
-- This deliberately leaves televoting.countries / televoting.editions readable:
-- they are presentation identity used by the current public ballot/results
-- surfaces and do not contain ballot or future-entry payloads.
select public.v3_register_migration_contract(
  '20261024153000_v3_televote_public_rls_boundary',
  1,
  'forward_fix_only',
  false,
  null,
  'Restrict raw public Televoting configuration to open, published, or canonically show-bound states'
);

do $preflight$
begin
  if to_regclass('televoting.rounds') is null
     or to_regclass('televoting.round_entries') is null
     or to_regclass('televoting.round_countries') is null then
    raise exception 'Televoting public RLS boundary requires rounds, round_entries and round_countries';
  end if;

  if to_regclass('public.televoting_round_bindings') is null
     or to_regclass('public.shows') is null then
    raise exception 'Televoting public RLS boundary requires canonical round/show bindings';
  end if;
end
$preflight$;

-- Bindings are Organizer-only by design, so an anon RLS policy cannot safely
-- query them directly: nested RLS would make every binding look absent. Expose
-- one bounded security-definer predicate instead. It reveals only whether a
-- specific remote round is attached to a show whose canonical row is public.
-- It does not expose binding metadata, edition scope, or unpublished shows.
create or replace function public.v3_public_televote_round_show_visible(
  p_round_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $visible$
  select exists (
    select 1
    from public.televoting_round_bindings binding
    join public.shows show_row
      on show_row.id = binding.show_id
    where binding.remote_round_id = p_round_id::text
      and binding.show_id is not null
      and show_row.published = true
  );
$visible$;

revoke all on function public.v3_public_televote_round_show_visible(uuid)
  from public;
grant execute on function public.v3_public_televote_round_show_visible(uuid)
  to anon, authenticated, service_role;

-- A raw round row is public only when Public Solaris has a legitimate reason to
-- know it exists. Draft rounds are never public. Closed-but-unpublished rounds
-- are exposed only when linked to a published canonical show, because Live /
-- Show Mode needs the authoritative closed state without exposing every
-- historical test round.
drop policy if exists "solaris consolidated anon read" on televoting.rounds;
create policy "solaris consolidated anon read"
on televoting.rounds
for select
to anon
using (
  status = 'open'::televoting.round_status
  or results_status = 'published'
  or (
    status = 'closed'::televoting.round_status
    and public.v3_public_televote_round_show_visible(id)
  )
);

drop policy if exists "solaris consolidated authenticated read" on televoting.rounds;
create policy "solaris consolidated authenticated read"
on televoting.rounds
for select
to authenticated
using (
  public.studio2_access_allowed('voting.manage', null, false)
  or status = 'open'::televoting.round_status
  or results_status = 'published'
  or (
    status = 'closed'::televoting.round_status
    and public.v3_public_televote_round_show_visible(id)
  )
);

-- Ballot composition is public while the ballot is actually open, and remains
-- public once its result is published. A closed unpublished ballot does not need
-- to leak its entry/configuration payload merely so Live can say "voting closed".
drop policy if exists "solaris consolidated anon read" on televoting.round_entries;
create policy "solaris consolidated anon read"
on televoting.round_entries
for select
to anon
using (
  exists (
    select 1
    from televoting.rounds round_row
    where round_row.id = round_entries.round_id
      and (
        round_row.status = 'open'::televoting.round_status
        or round_row.results_status = 'published'
      )
  )
);

drop policy if exists "solaris consolidated authenticated read" on televoting.round_entries;
create policy "solaris consolidated authenticated read"
on televoting.round_entries
for select
to authenticated
using (
  public.studio2_access_allowed('voting.manage', null, false)
  or exists (
    select 1
    from televoting.rounds round_row
    where round_row.id = round_entries.round_id
      and (
        round_row.status = 'open'::televoting.round_status
        or round_row.results_status = 'published'
      )
  )
);

-- round_countries is the legacy country projection of the same ballot
-- composition. Keep its visibility aligned with round_entries so one table
-- cannot bypass the other's publication boundary.
drop policy if exists "solaris consolidated anon read" on televoting.round_countries;
create policy "solaris consolidated anon read"
on televoting.round_countries
for select
to anon
using (
  exists (
    select 1
    from televoting.rounds round_row
    where round_row.id = round_countries.round_id
      and (
        round_row.status = 'open'::televoting.round_status
        or round_row.results_status = 'published'
      )
  )
);

drop policy if exists "solaris consolidated authenticated read" on televoting.round_countries;
create policy "solaris consolidated authenticated read"
on televoting.round_countries
for select
to authenticated
using (
  public.studio2_access_allowed('voting.manage', null, false)
  or exists (
    select 1
    from televoting.rounds round_row
    where round_row.id = round_countries.round_id
      and (
        round_row.status = 'open'::televoting.round_status
        or round_row.results_status = 'published'
      )
  )
);

-- Fail closed if a later edit accidentally recreates unconditional browser
-- access on any of the three operational tables or drops Organizer access.
do $verify$
declare
  v_unconditional integer;
  v_organizer_missing integer;
  v_helper_security_definer boolean;
begin
  select count(*)
  into v_unconditional
  from pg_policies p
  where p.schemaname = 'televoting'
    and p.tablename in ('rounds', 'round_entries', 'round_countries')
    and p.cmd = 'SELECT'
    and ('anon' = any(p.roles) or 'authenticated' = any(p.roles))
    and regexp_replace(coalesce(p.qual, ''), '[()[:space:]]', '', 'g') = 'true';

  if v_unconditional <> 0 then
    raise exception 'Unconditional browser Televoting configuration policy remains: %', v_unconditional;
  end if;

  select p.prosecdef
  into v_helper_security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'v3_public_televote_round_show_visible'
    and pg_get_function_identity_arguments(p.oid) = 'p_round_id uuid';

  if coalesce(v_helper_security_definer, false) is not true then
    raise exception 'Public Televote show-visibility predicate is not SECURITY DEFINER';
  end if;

  select count(*)
  into v_organizer_missing
  from (values ('rounds'), ('round_entries'), ('round_countries')) as required(table_name)
  where not exists (
    select 1
    from pg_policies p
    where p.schemaname = 'televoting'
      and p.tablename = required.table_name
      and p.cmd = 'SELECT'
      and 'authenticated' = any(p.roles)
      and coalesce(p.qual, '') ilike '%studio2_access_allowed%voting.manage%'
  );

  if v_organizer_missing <> 0 then
    raise exception 'Organizer Televoting read capability missing after public RLS hardening: %', v_organizer_missing;
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;
