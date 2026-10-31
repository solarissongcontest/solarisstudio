begin;

-- Country-account authentication and recovery stay intentionally available on
-- the maintenance Confirmation surface while the wider Data API is restricted.
-- Their abuse protection therefore has to be able to persist its private,
-- hashed, short-lived counters in read_only/maintenance too.
--
-- Keep this exception narrower than a role bypass: only the exact limiter RPC
-- may cross the PostgREST operational gate. The RPC itself remains
-- service_role-only and continues to own all validation/counter semantics.
do $migration$
declare
  v_definition text;
  v_anchor text := $anchor$    -- Explicit platform recovery mutations. These remain available in both
$anchor$;
  v_exception text := $exception$    -- Country-auth rate limiting is security infrastructure, not a
    -- general application write. It must remain operational anywhere the
    -- maintenance authentication/recovery surface is intentionally reachable.
    -- The function ACL remains the caller boundary: service_role only.
    if v_rpc_name = 'country_auth_consume_rate_limit' then
      return;
    end if;

$exception$;
begin
  select pg_get_functiondef('private.studio2_data_api_operational_gate()'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'studio2_data_api_operational_gate() is missing';
  end if;

  -- Preserve the production PostgREST path fix. Refuse to patch an older or
  -- unexpected gate shape rather than silently replacing newer logic.
  if position('if position(''/rpc/'' in v_path) > 0 then' in v_definition) = 0 then
    raise exception 'unexpected Data API gate RPC path parser; refusing country-auth patch';
  end if;

  if position('studio2_apply_confirmation_round_change' in v_definition) = 0
     or position('studio2_apply_platform_mode_change' in v_definition) = 0 then
    raise exception 'expected Confirmation/platform recovery exceptions are missing; refusing country-auth patch';
  end if;

  if position('if v_rpc_name = ''country_auth_consume_rate_limit'' then' in v_definition) > 0 then
    raise exception 'country_auth_consume_rate_limit is already present in the Data API gate';
  end if;

  if position(v_anchor in v_definition) = 0 then
    raise exception 'expected platform-recovery anchor is missing; refusing country-auth patch';
  end if;

  v_definition := replace(v_definition, v_anchor, v_exception || v_anchor);
  execute v_definition;
end
$migration$;

-- Fail the migration if the narrow function ACL has drifted. The gate exception
-- must never become a way for browser roles to choose or reset protection
-- budgets directly.
do $acl$
begin
  if not has_function_privilege(
    'service_role',
    'public.country_auth_consume_rate_limit(text,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'service_role lost country_auth_consume_rate_limit execution';
  end if;

  if has_function_privilege(
       'anon',
       'public.country_auth_consume_rate_limit(text,text,integer,integer)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.country_auth_consume_rate_limit(text,text,integer,integer)',
       'EXECUTE'
     ) then
    raise exception 'browser role can execute country_auth_consume_rate_limit';
  end if;
end
$acl$;

notify pgrst, 'reload schema';

commit;
