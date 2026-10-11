begin;

-- The canonical read-only enforcement migration immediately before this file
-- recreates the direct-write guard. Reassert the migration/operator exemption
-- using role membership so Supabase CLI migrations can continue safely while
-- production remains read_only/maintenance.

create or replace function private.studio2_guard_direct_client_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_mode text;
begin
  if session_user in ('postgres', 'supabase_admin')
     or pg_has_role(session_user, 'postgres', 'member') then
    return null;
  end if;

  if coalesce(current_setting('studio2.platform_recovery_write', true), '') = 'on' then
    return null;
  end if;

  select state.mode
  into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  if v_mode in ('read_only', 'maintenance') then
    raise exception 'Solaris is currently %, so this write is unavailable', v_mode
      using errcode = '25006';
  end if;

  if v_mode is null then
    raise exception 'Solaris platform operational state is unavailable'
      using errcode = '25006';
  end if;

  return null;
end
$guard$;

revoke all on function private.studio2_guard_direct_client_write()
  from public, anon, authenticated, service_role;

commit;
