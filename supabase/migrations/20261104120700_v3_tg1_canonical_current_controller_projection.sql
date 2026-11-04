begin;

-- TG1 history is not the current-owner authority. Existing country-account
-- transfers can occur before an institution history backfill/reconciliation.
-- An open history term for the OLD user must not be reported as current.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg1.world-current-controller-projection-truth',
      1,
      'forward_fix_only',
      false,
      null,
      'Derive current public controller identity only where the open durable-person term matches the active canonical country account.'
    );
  end if;
end
$contract$;

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
  left join public.country_accounts account_row
    on account_row.country_id = c.id
   and account_row.status = 'active'
  left join public.world_country_control_terms term
    on term.country_id = c.id
   and term.ended_at is null
   and term.user_id = account_row.user_id
  left join public.delegation_people person on person.id = term.person_id
  where p_country_id is null or c.id = p_country_id
  order by c.name, c.id
$projection$;

revoke all on function public.world_country_identity_v1(uuid) from public, anon, authenticated;
grant execute on function public.world_country_identity_v1(uuid) to anon, authenticated, service_role;

comment on function public.world_country_identity_v1(uuid) is
  'Public current political identity projected from active country_accounts matched to durable person history; stale/unlinked history cannot impersonate the active controller. No login IDs returned.';

notify pgrst, 'reload schema';
commit;
