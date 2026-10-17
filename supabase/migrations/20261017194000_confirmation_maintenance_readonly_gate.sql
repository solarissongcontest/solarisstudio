begin;

-- Emergency Confirmation maintenance operations must remain usable while the
-- wider Solaris platform is intentionally read_only. Keep this exception
-- domain-scoped and fail closed everywhere else.
--
-- The Data API pre-request gate blocks POST RPCs before their own capability
-- checks execute. The approved Confirmation maintenance surface therefore needs
-- an explicit allowlist here. Mutation RPCs also mark the current transaction
-- with a narrow context so the table-level direct-write trigger can distinguish
-- this approved path from arbitrary client writes.
create or replace function private.studio2_data_api_operational_gate()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_mode text;
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
  v_rpc_name text;
  v_read_only_rpc boolean := false;
begin
  select state.mode
  into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  if v_mode is null then
    raise exception 'Solaris platform operational state is unavailable'
      using errcode = '25006';
  end if;

  if v_mode in ('normal', 'degraded') then
    return;
  end if;

  if v_method in ('GET', 'HEAD', 'OPTIONS') then
    return;
  end if;

  if v_path like '/rpc/%' then
    v_rpc_name := split_part(split_part(v_path, '/', 3), '?', 1);

    if v_mode = 'read_only' then
      -- Read-only Confirmation maintenance RPCs are VOLATILE for historical
      -- reasons but perform no writes. Allow only the exact emergency surface.
      if v_rpc_name in (
        'studio2_confirmation_round_change_preview',
        'public_resolve_edit_token'
      ) then
        return;
      end if;

      -- Approved Confirmation mutations. The transaction-local marker is
      -- consumed by the public-table write guard below. Each RPC still enforces
      -- its own Organizer capability or edit-token/country-account authority.
      if v_rpc_name in (
        'studio2_apply_confirmation_round_change',
        'admin_update_confirmation_controls',
        'public_create_country_account_edit_token',
        'v3_submit_confirmation'
      ) then
        perform set_config('studio2.confirmation_maintenance_write', 'on', true);
        return;
      end if;
    end if;

    -- Explicit platform recovery mutations. These remain available in both
    -- read_only and maintenance so operators can recover the platform itself.
    if v_rpc_name in (
      'studio2_apply_platform_mode_change',
      'studio2_platform_exit_database_preflight',
      'studio2_record_platform_exit_preflight'
    ) then
      return;
    end if;

    -- PostgREST invokes read RPCs with POST too. Allow only functions whose
    -- entire public overload set is declared STABLE/IMMUTABLE. A missing,
    -- ambiguous-volatility or VOLATILE RPC fails closed.
    select coalesce(bool_and(proc.provolatile in ('s', 'i')), false)
    into v_read_only_rpc
    from pg_proc proc
    join pg_namespace namespace on namespace.oid = proc.pronamespace
    where namespace.nspname = 'public'
      and proc.proname = v_rpc_name;

    if v_read_only_rpc then
      return;
    end if;
  end if;

  raise exception 'Solaris is currently %, so normal writes are unavailable', v_mode
    using errcode = '25006',
          hint = 'Use an explicitly authorized recovery operation or wait until the platform mode changes.';
end;
$$;

create or replace function private.studio2_guard_direct_client_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
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

  -- This marker is set only by the exact Confirmation RPC allowlist in the
  -- pre-request gate above. Never honor it in full maintenance mode.
  if v_mode = 'read_only'
     and coalesce(current_setting('studio2.confirmation_maintenance_write', true), '') = 'on' then
    return null;
  end if;

  if v_mode in ('read_only', 'maintenance') then
    raise exception 'Solaris is currently %, so this write is unavailable', v_mode
      using errcode = '25006';
  end if;

  if v_mode is null then
    raise exception 'Solaris platform operational state is unavailable'
      using errcode = '25006';
  end if;

  return null;
end;
$$;

-- Preserve the canonical V3 submit implementation unchanged behind a new
-- internal entry point. The public signature is recreated as a policy wrapper
-- so normal/degraded behavior remains identical, while read_only accepts only
-- an existing-response edit carrying a valid edit-token hash.
alter function public.v3_submit_confirmation(jsonb, uuid, text, text)
  rename to v3_submit_confirmation_core;

revoke all on function public.v3_submit_confirmation_core(jsonb, uuid, text, text)
  from public, anon, authenticated, service_role;

create or replace function public.v3_submit_confirmation(
  payload jsonb,
  _idempotency_key uuid,
  _request_hash text,
  _browser_session_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_mode text;
begin
  select state.mode
  into v_mode
  from public.studio2_platform_operational_state state
  where state.singleton = true;

  if v_mode is null then
    raise exception 'Solaris platform operational state is unavailable'
      using errcode = '25006';
  end if;

  if v_mode = 'maintenance' then
    raise exception 'Solaris is currently maintenance, so Confirmation writes are unavailable'
      using errcode = '25006';
  end if;

  if v_mode = 'read_only'
     and nullif(btrim(coalesce(payload ->> 'edit_token_hash', '')), '') is null then
    raise exception 'Read-only Confirmation writes require an existing-response edit token'
      using errcode = '25006';
  end if;

  return public.v3_submit_confirmation_core(
    payload,
    _idempotency_key,
    _request_hash,
    _browser_session_id
  );
end;
$$;

revoke all on function public.v3_submit_confirmation(jsonb, uuid, text, text)
  from public;
grant execute on function public.v3_submit_confirmation(jsonb, uuid, text, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
