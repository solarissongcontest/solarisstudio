begin;

-- TG1 additive hardening: only publish durable controller identity when the
-- historical term still matches the CURRENT active country_accounts owner.
-- country_accounts is authoritative; terms remain historical evidence.
-- In particular, a country-account transfer before the world-term handoff
-- must not publicly attribute the new controller to the previous person.
create or replace function public.world_country_identity_v1(p_country_id uuid default null)
returns table (
  country_id uuid,
  country_name text,
  short_code text,
  native_name text,
  controller_person_id uuid,
  controller_display_name text,
  control_started_at timestamptz,
  capital text,
  government_type text,
  leader_name text,
  leader_title text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $projection$
  select
    c.id, c.name, c.short_code, c.native_name,
    term.person_id, person.display_name, term.started_at,
    profile.capital, profile.government_type, profile.leader_name, profile.leader_title
  from public.countries c
  left join public.country_profiles profile on profile.country_id = c.id
  left join public.country_accounts current_account
    on current_account.country_id = c.id
   and current_account.status = 'active'
  left join public.world_country_control_terms term
    on term.country_id = c.id
   and term.ended_at is null
   and term.user_id = current_account.user_id
  left join public.delegation_people person on person.id = term.person_id
  where p_country_id is null or c.id = p_country_id
  order by c.name, c.id
$projection$;

revoke all on function public.world_country_identity_v1(uuid) from public, anon, authenticated;
grant execute on function public.world_country_identity_v1(uuid) to anon, authenticated, service_role;

comment on function public.world_country_identity_v1(uuid) is
  'Public-safe country identity: durable controller identity is included only when its open history term matches the canonical current active country account.';

-- Record the forward-only semantic migration for S13 adoption.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg1.world-current-controller-projection-guard',
      1,
      'forward_fix_only',
      false,
      null,
      'Suppress stale historical controller identity in public country projections after canonical country-account reassignment or deactivation.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
