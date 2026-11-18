begin;
do $assert$
declare
  v_fn record;
  v_name text;
  v_direct text;
  v_wrapped text;
  v_role text;
  v_sql text;
  v_denied boolean;
begin
  for v_name,v_direct,v_wrapped in
    select * from (values
      ('public.v3_create_protected_integrity_case(uuid,text,text,text,text,text,text,text,text,text[],text)',
       'public.create_protected_integrity_case_impl(', 'public.create_protected_integrity_case('),
      ('public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)',
       'public.public_create_anonymous_integrity_case_impl(', 'public.public_create_anonymous_integrity_case(')
    ) x(fn,direct,wrapped)
  loop
    select p.oid,p.prosecdef,pg_get_userbyid(p.proowner) as owner,
      pg_get_functiondef(p.oid) as definition into v_fn
    from pg_proc p where p.oid=to_regprocedure(v_name);
    if v_fn.oid is null or not v_fn.prosecdef or v_fn.owner<>'postgres'
      or strpos(v_fn.definition,v_direct)=0
      or strpos(v_fn.definition,v_wrapped)>0
    then raise exception 'Cyclic / unqualified Integrity call graph %', v_name; end if;
  end loop;
  if to_regprocedure('public.v3_create_protected_integrity_case_impl(uuid,text,text,text,text,text,text,text,text,text,text[],text)') is not null
     or to_regprocedure('public.v3_public_create_anonymous_integrity_case_impl(uuid,text,text,text,text,text,text,text,text[],text,text)') is not null
  then raise exception 'Retired duplicate intake implementation remains installed'; end if;
  -- Direct SQL probes ensure the retired V3 intermediates cannot be called
  -- through any of the three PostgREST API roles, not only absent in pg_proc
  -- while inspected as postgres. Successful invocation is always a regression.
  foreach v_role in array array['anon','authenticated','service_role'] loop
    foreach v_sql in array array[
      $select public.v3_create_protected_integrity_case_impl(
        null::uuid, null::text, null::text, null::text, null::text,
        null::text, null::text, null::text, null::text, null::text[], null::text)$,
      $select public.v3_public_create_anonymous_integrity_case_impl(
        null::uuid, null::text, null::text, null::text, null::text,
        null::text, null::text, null::text[], null::text, null::text)$
    ] loop
      execute format('set local role %I',v_role);
      v_denied:=false;
      begin
        execute v_sql;
      exception when undefined_function then
        v_denied:=true;
      end;
      reset role;
      if not v_denied then
        raise exception 'Retired V3 Intake intermediate remained callable for role %: %',v_role,v_sql;
      end if;
    end loop;
  end loop;

  -- SQL function EXECUTE grants are tested as real call denials under the
  -- exact three PostgREST API roles, not guessed from source permissions.
  foreach v_role in array array['anon','authenticated','service_role'] loop
    foreach v_sql in array array[
      $$select public.create_protected_integrity_case_impl(
        'confidential','report','other','Test report','Test details',
        null::text,null::text,'{}'::text[],null::text)$$,
      $$select public.public_create_anonymous_integrity_case_impl(
        'other','Test report','Test details',null::text,null::text,
        '{}'::text[],null::text,'report')$$
    ] loop
      execute format('set local role %I',v_role);
      v_denied:=false;
      begin
        execute v_sql;
      exception when insufficient_privilege then
        v_denied:=true;
      end;
      reset role;
      if not v_denied then
        raise exception 'Unintended API EXECUTE on Integrity implementation for role %: %',v_role,v_sql;
      end if;
    end loop;
  end loop;
  raise notice 'PASS: canonical V3 intake owns transaction/receipt; both duplicate V3 impls absent; all six original physical-writer API-role calls denied';
end
$assert$;
rollback;
