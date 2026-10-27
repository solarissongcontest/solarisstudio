begin;

select public.v3_register_migration_contract(
  'v3.session.data-api-active-session-guard',
  1,
  'forward_fix_only',
  false,
  null,
  'Require canonical active Auth sessions before authenticated Data API requests while preserving the existing operational-mode hook. No backfill; security recovery is forward-only.'
);

-- Auth access JWTs outlive auth.sessions deletion. R3 freshness already checks
-- the canonical session row, but ordinary Data API reads/RPCs did not. Extend
-- the existing pre-request hook before *any* operational-mode early return.
-- Preserve its maintenance/Confirmation exceptions and pinned privileges.
do $migration$
declare
  v_definition text;
  v_anchor constant text := E'begin\n  select state.mode';
begin
  select pg_get_functiondef('private.studio2_data_api_operational_gate()'::regprocedure)
  into v_definition;
  if v_definition is null or position(v_anchor in v_definition) = 0 then
    raise exception 'Unexpected Data API gate; refusing active-session patch';
  end if;
  if position('private.v3_require_active_auth_session()' in v_definition) > 0 then
    raise exception 'Data API active-session guard is already installed';
  end if;

  execute replace(v_definition, v_anchor, $guard$begin
  -- PostgREST validates the JWT before entering this hook. Anonymous public
  -- reads and service workers keep their own authority; every authenticated
  -- request must prove its signed session_id still exists for its signed user.
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated' then
    perform private.v3_require_active_auth_session();
  end if;

  select state.mode$guard$);
end
$migration$;

-- Fail closed if the pre-request hook has been replaced or disabled. Do not
-- overwrite another hook and silently discard its security checks.
do $binding$
begin
  if not exists (
    select 1 from pg_db_role_setting settings
    join pg_roles role_row on role_row.oid = settings.setrole
    cross join lateral unnest(settings.setconfig) config(value)
    where role_row.rolname = 'authenticator'
      and settings.setdatabase = 0
      and config.value = 'pgrst.db_pre_request=private.studio2_data_api_operational_gate'
  ) then
    raise exception 'Canonical Data API pre-request hook is not configured';
  end if;
end
$binding$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
