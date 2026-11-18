begin;

-- Real PostgreSQL catalog checks precede the nine role-execution probes.
do $catalog$
declare
  v_signature text;
  v_role text;
  v_allowed boolean;
begin
  foreach v_signature in array array[
    'public.admin_record_integrity_finding(uuid,text,text,text,text[],boolean)',
    'public.admin_record_integrity_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean)',
    'public.admin_decide_integrity_appeal(uuid,text,text,integer,text[],text[])'
  ] loop
    if to_regprocedure(v_signature) is not null then
      raise exception 'Obsolete Integrity API routine remains installed: %', v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'public.studio2_integrity_record_finding(uuid,text,text,text,text[],boolean,uuid,text,bigint)',
    'public.studio2_integrity_record_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean,uuid,text,bigint)',
    'public.studio2_integrity_resolve_appeal(uuid,text,text,integer,text[],text[],uuid,text,bigint)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'Canonical Integrity command was lost: %', v_signature;
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      v_allowed := has_function_privilege(v_role, to_regprocedure(v_signature), 'EXECUTE');
      if v_allowed is distinct from (v_role <> 'anon') then
        raise exception 'Unexpected canonical command grant: % role %', v_signature, v_role;
      end if;
    end loop;
  end loop;

  foreach v_signature in array array[
    'public.admin_record_integrity_finding_impl(uuid,text,text,text,text[],boolean)',
    'public.admin_record_integrity_sanction_impl(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'Shared sanctioned internal implementation disappeared: %', v_signature;
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role, to_regprocedure(v_signature), 'EXECUTE') then
        raise exception 'Internal implementation wrongly exposed: % role %', v_signature, v_role;
      end if;
    end loop;
  end loop;
end $catalog$;

-- Fully typed SQL calls under role anon; only SQLSTATE 42883 (undefined_function)
-- counts as success, never an invalid fixture or a denied write.
set local role anon;
do $absent$
declare v_statement text;
begin
  foreach v_statement in array array[
    'select public.admin_record_integrity_finding(null::uuid,null::text,null::text,null::text,null::text[],null::boolean)',
    'select public.admin_record_integrity_sanction(null::uuid,null::uuid,null::integer,null::integer,null::text,null::text,null::text[],null::text[],null::text,null::boolean)',
    'select public.admin_decide_integrity_appeal(null::uuid,null::text,null::text,null::integer,null::text[],null::text[])'
  ] loop
    begin
      execute v_statement;
      raise exception 'Retired adjudication RPC unexpectedly callable by %: %', current_user, v_statement;
    exception when undefined_function then
      null;
    end;
  end loop;
end $absent$;
reset role;

-- Fully typed SQL calls under role authenticated; only SQLSTATE 42883 (undefined_function)
-- counts as success, never an invalid fixture or a denied write.
set local role authenticated;
do $absent$
declare v_statement text;
begin
  foreach v_statement in array array[
    'select public.admin_record_integrity_finding(null::uuid,null::text,null::text,null::text,null::text[],null::boolean)',
    'select public.admin_record_integrity_sanction(null::uuid,null::uuid,null::integer,null::integer,null::text,null::text,null::text[],null::text[],null::text,null::boolean)',
    'select public.admin_decide_integrity_appeal(null::uuid,null::text,null::text,null::integer,null::text[],null::text[])'
  ] loop
    begin
      execute v_statement;
      raise exception 'Retired adjudication RPC unexpectedly callable by %: %', current_user, v_statement;
    exception when undefined_function then
      null;
    end;
  end loop;
end $absent$;
reset role;

-- Fully typed SQL calls under role service_role; only SQLSTATE 42883 (undefined_function)
-- counts as success, never an invalid fixture or a denied write.
set local role service_role;
do $absent$
declare v_statement text;
begin
  foreach v_statement in array array[
    'select public.admin_record_integrity_finding(null::uuid,null::text,null::text,null::text,null::text[],null::boolean)',
    'select public.admin_record_integrity_sanction(null::uuid,null::uuid,null::integer,null::integer,null::text,null::text,null::text[],null::text[],null::text,null::boolean)',
    'select public.admin_decide_integrity_appeal(null::uuid,null::text,null::text,null::integer,null::text[],null::text[])'
  ] loop
    begin
      execute v_statement;
      raise exception 'Retired adjudication RPC unexpectedly callable by %: %', current_user, v_statement;
    exception when undefined_function then
      null;
    end;
  end loop;
end $absent$;
reset role;

rollback;
