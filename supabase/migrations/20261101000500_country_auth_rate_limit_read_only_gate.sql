begin;

-- Country authentication must keep its abuse-protection counters operational
-- while Solaris intentionally serves the narrow maintenance Confirmation login
-- surface. The limiter itself remains service-role-only and writes only hashed,
-- short-lived state in private.country_auth_rate_limits. Allow exactly that RPC
-- through the PostgREST pre-request gate in read_only/maintenance; every other
-- mutation continues to use the existing fail-closed gate behavior.
do $migration$
declare
  v_definition text;
  v_anchor text := E'    v_rpc_name := split_part(split_part(v_path, ''/rpc/'', 2), ''?'', 1);\n\n    if v_mode = ''read_only'' then';
  v_replacement text := E'    v_rpc_name := split_part(split_part(v_path, ''/rpc/'', 2), ''?'', 1);\n\n    -- Authentication protection is infrastructure, not a general application\n    -- write. The function remains executable only by service_role and persists\n    -- only hashed short-lived counters in the private schema. Keep this exact\n    -- exception available in read_only and maintenance so the intentionally\n    -- exposed maintenance login/recovery surface cannot lose its rate limiter.\n    if v_rpc_name = ''country_auth_consume_rate_limit'' then\n      return;\n    end if;\n\n    if v_mode = ''read_only'' then';
begin
  select pg_get_functiondef('private.studio2_data_api_operational_gate()'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'studio2_data_api_operational_gate() is missing';
  end if;

  if position('country_auth_consume_rate_limit' in v_definition) > 0 then
    raise exception 'country_auth_consume_rate_limit is already present in the Data API gate; refusing ambiguous patch';
  end if;

  if position(v_anchor in v_definition) = 0 then
    raise exception 'unexpected Data API gate RPC parser/read_only anchor; refusing auth limiter patch';
  end if;

  v_definition := replace(v_definition, v_anchor, v_replacement);
  execute v_definition;
end
$migration$;

-- Reassert the limiter privilege boundary explicitly. Passing the pre-request
-- gate must never make this security-definer RPC callable by public clients.
revoke all on function public.country_auth_consume_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.country_auth_consume_rate_limit(text, text, integer, integer)
  to service_role;

notify pgrst, 'reload schema';

commit;
