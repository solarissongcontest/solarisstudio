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
  -- The final migration state, not the historical 17:55 bridge, owns the
  -- authority graph. Protected intake delegates to a role-denied validated
  -- primitive; anonymous intake now performs its sole physical write inside
  -- the canonical versioned, receipted V3 operation itself.
  for v_name,v_direct,v_wrapped in
    select * from (values
      ('public.v3_create_protected_integrity_case(uuid,text,text,text,text,text,text,text,text,text[],text)',
       'public.create_protected_integrity_case_impl(', 'public.create_protected_integrity_case('),
      ('public.v3_public_create_anonymous_integrity_case(uuid,text,text,text,text,text,text,text[],text,text)',
       'insert into public.integrity_cases(', 'public.public_create_anonymous_integrity_case(')
    ) x(fn,direct,wrapped)
  loop
    select p.oid,p.prosecdef,pg_get_userbyid(p.proowner) as owner,
      pg_get_functiondef(p.oid) as definition,
      array_to_string(p.proconfig,',') as settings
      into v_fn
    from pg_proc p where p.oid=to_regprocedure(v_name);
    if v_fn.oid is null or not v_fn.prosecdef or v_fn.owner<>'postgres'
      or strpos(coalesce(v_fn.settings,''),'search_path=pg_catalog')=0
      or strpos(v_fn.definition,v_direct)=0
      or strpos(v_fn.definition,v_wrapped)>0
      or strpos(v_fn.definition,'app.integrity_operation_id')=0
    then raise exception 'Cyclic / unqualified Integrity call graph % (oid %, owner %, definer %, searchpath %, direct %, wrapped %, opcontext %)',
      v_name, v_fn.oid, v_fn.owner, v_fn.prosecdef,
      strpos(coalesce(v_fn.settings,''),'search_path=pg_catalog')>0,
      strpos(coalesce(v_fn.definition,''),v_direct)>0,
      strpos(coalesce(v_fn.definition,''),v_wrapped)>0,
      strpos(coalesce(v_fn.definition,''),'app.integrity_operation_id')>0; end if;
    if v_name like 'public.v3_public_create_anonymous_integrity_case(%'
       and (
         strpos(v_fn.definition,'public.public_create_anonymous_integrity_case_impl(')>0
         or strpos(v_fn.definition,'insert into public.integrity_case_access(')=0
         or strpos(v_fn.definition,'insert into public.integrity_case_messages(')=0
         or strpos(v_fn.definition,'insert into public.integrity_case_events(')=0
         or strpos(v_fn.definition,'private.v3_anonymous_integrity_case_operations')=0
         or strpos(v_fn.definition,'extensions.pgp_sym_encrypt(')=0
         or strpos(v_fn.definition,'recovery_secret_ciphertext')=0
         or strpos(v_fn.definition,'IDEMPOTENCY_CONFLICT')=0
       )
    then raise exception 'Canonical anonymous intake physical-write, privacy, history or replay evidence missing'; end if;
    if v_name like 'public.v3_create_protected_integrity_case(%'
       and (
         strpos(v_fn.definition,'private.studio2_complete_operation(')=0
         or strpos(v_fn.definition,'request_fingerprint')=0
         or strpos(v_fn.definition,'IDEMPOTENCY_CONFLICT')=0
       )
    then raise exception 'Protected intake receipt/idempotency graph incomplete'; end if;
  end loop;
  if to_regprocedure('public.public_create_anonymous_integrity_case_impl(text,text,text,text,text,text[],text,text)') is not null
  then raise exception 'Duplicate original anonymous physical writer remains installed'; end if;
  if to_regprocedure('public.v3_create_protected_integrity_case_impl(uuid,text,text,text,text,text,text,text,text,text[],text)') is not null
     or to_regprocedure('public.v3_public_create_anonymous_integrity_case_impl(uuid,text,text,text,text,text,text,text[],text,text)') is not null
  then raise exception 'Retired duplicate intake implementation remains installed'; end if;
  -- Direct SQL probes ensure the retired V3 intermediates cannot be called
  -- through any of the three PostgREST API roles, not only absent in pg_proc
  -- while inspected as postgres. Successful invocation is always a regression.
  foreach v_role in array array['anon','authenticated','service_role'] loop
    foreach v_sql in array array[
      $$select public.v3_create_protected_integrity_case_impl(
        null::uuid, null::text, null::text, null::text, null::text,
        null::text, null::text, null::text, null::text, null::text[], null::text)$$,
      $$select public.v3_public_create_anonymous_integrity_case_impl(
        null::uuid, null::text, null::text, null::text, null::text,
        null::text, null::text, null::text[], null::text, null::text)$$
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

  -- Protected validation stays internal and must raise a real ACL denial.
  -- The anonymous primitive was retired entirely by the later single-writer
  -- migration, so its real API-role probe must raise undefined_function.
  foreach v_role in array array['anon','authenticated','service_role'] loop
    execute format('set local role %I',v_role);
    v_denied:=false;
    begin
      perform public.create_protected_integrity_case_impl(
        'confidential','report','other','Test report','Test details',
        null::text,null::text,'{}'::text[],null::text);
    exception when insufficient_privilege then
      v_denied:=true;
    end;
    reset role;
    if not v_denied then
      raise exception 'Unintended API EXECUTE on protected Integrity implementation for role %',v_role;
    end if;
    execute format('set local role %I',v_role);
    v_denied:=false;
    begin
      perform public.public_create_anonymous_integrity_case_impl(
        'other','Test report','Test details',null::text,null::text,
        '{}'::text[],null::text,'report');
    exception when undefined_function then
      v_denied:=true;
    end;
    reset role;
    if not v_denied then
      raise exception 'Retired anonymous physical writer callable for role %',v_role;
    end if;
  end loop;
  raise notice 'PASS: canonical V3 direct anonymous writer and protected internal delegation; receipts/event/privacy; retired V3 and anonymous primitives denied to all API roles';
end
$assert$;
rollback;
