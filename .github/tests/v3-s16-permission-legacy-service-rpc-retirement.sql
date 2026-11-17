-- P16: executable local/isolated PostgreSQL role probes after the forward-only
-- legacy service writer cutover. Never against hosted Supabase.
begin;
do $verify$
declare
  v_signature text;
  v_role text;
  v_sql text;
  v_denied boolean;
  v_legacy text[] := array[
    'public.studio2_assign_access_role(uuid,text,uuid,timestamptz)',
    'public.studio2_revoke_access_role(uuid,text,uuid)'
  ];
  v_r3 oid := to_regprocedure(
    'public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint,uuid)'
  );
begin
  foreach v_signature in array v_legacy loop
    if to_regprocedure(v_signature) is not null
    then raise exception 'Legacy permission writer still installed: %',v_signature; end if;
  end loop;

  if v_r3 is null
    or not has_function_privilege('authenticated',v_r3,'EXECUTE')
    or has_function_privilege('anon',v_r3,'EXECUTE')
  then raise exception 'Canonical R3 permission authority is missing or exposed'; end if;

  -- POSTGREST roles as actual PostgreSQL roles. Resolution must fail at the
  -- database, including service_role; a hidden browser button is not proof.
  foreach v_role in array array['anon','authenticated','service_role'] loop
    foreach v_sql in array array[
      $$select public.studio2_assign_access_role(null::uuid,'hod',null::uuid,null::timestamptz)$$,
      $$select public.studio2_revoke_access_role(null::uuid,'hod',null::uuid)$$
    ] loop
      execute format('set local role %I',v_role);
      v_denied := false;
      begin
        execute v_sql;
      exception when undefined_function then
        v_denied := true;
      end;
      reset role;
      if not v_denied then
        raise exception 'Obsolete Permission Engine RPC still callable by %: %', v_role,v_sql;
      end if;
    end loop;
  end loop;

  -- The service-only capability grant/revoke paths are explicitly retained.
  -- The existing v3-s16-permission-direct-grant-authority.sql independently
  -- executes real positive grant, idempotent replay, version triggers and revoke.
  if to_regprocedure('public.studio2_grant_capability(uuid,text,uuid,timestamptz)') is null
    or to_regprocedure('public.studio2_revoke_capability(uuid,text,uuid)') is null
    or not has_function_privilege('service_role','public.studio2_grant_capability(uuid,text,uuid,timestamptz)','EXECUTE')
    or not has_function_privilege('service_role','public.studio2_revoke_capability(uuid,text,uuid)','EXECUTE')
    or to_regprocedure('public.studio2_request_permission_change_approval(uuid,text,text,uuid,timestamptz,uuid,text,bigint)') is null
    or to_regprocedure('public.studio2_approve_permission_change(uuid)') is null
  then raise exception 'Canonical R3 approval workflow lost'; end if;
  raise notice 'PASS: six actual-role obsolete ROLE RPC denials; canonical R3 and positive capability service compatibility intact';
end
$verify$;
rollback;
