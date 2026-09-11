begin;

-- Studio 2 initially referenced a two-argument owns_country helper while the
-- production schema exposes the established auth-scoped owns_country(country_id)
-- function. Provide a compatibility overload without allowing ordinary users
-- to inspect another user's country ownership.
create or replace function public.owns_country(
  _user_id uuid,
  _country_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    _user_id is not null
    and _country_id is not null
    and (
      coalesce(auth.role(), '') = 'service_role'
      or _user_id = auth.uid()
      or public.has_role(auth.uid(), 'organizer'::public.app_role)
    )
    and exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = _user_id
        and ca.country_id = _country_id
    )
$$;

revoke all on function public.owns_country(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.owns_country(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
