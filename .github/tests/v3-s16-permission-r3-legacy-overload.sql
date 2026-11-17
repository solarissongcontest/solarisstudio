\set ON_ERROR_STOP on
-- Networkless PG17 source-chain only. This is a real RPC escape-path denial.
do $s16_r3_proof$
declare
  v_old oid:=to_regprocedure('public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint)');
  v_current oid:=to_regprocedure('public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint,uuid)');
  v_error text;
begin
  if current_user<>'postgres'
    or current_setting('server_version_num')::int / 10000<>17
    or not exists(select 1 from private.v3_migration_contracts
      where migration_key='v3.s16.permission-r3-legacy-overload-retirement')
    or v_old is not null or v_current is null
  then raise exception 'S16 R3 negative proof requires isolated exact source cutover' using errcode='55000';end if;

  -- Direct invocation of eight-argument legacy route now must be impossible.
  begin
    execute $$select public.studio2_apply_permission_change_r3(
      null::uuid,'grant_capability'::text,'fake'::text,null::uuid,
      null::timestamptz,null::uuid,'legacy'::text,0::bigint
    )$$;
    raise exception 'S16 legacy R3 no-approval overload unexpectedly executable';
  exception when undefined_function then
    raise notice 'PASS: legacy eight-argument permission escalation RPC undefined';
  end;

  if has_function_privilege('service_role','public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint)','EXECUTE')
    or has_function_privilege('authenticated','public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint)','EXECUTE')
    or has_function_privilege('anon','public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint)','EXECUTE')
    or not has_function_privilege('authenticated',v_current,'EXECUTE')
    or has_function_privilege('anon',v_current,'EXECUTE')
    or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='studio2_apply_permission_change_r3')<>1
  then raise exception 'S16 governed second-operator R3 no longer unique and authorized';end if;
  raise notice 'PASS: one nine-argument owner R3 command remains; requires actual approval identity';
end $s16_r3_proof$;

begin;
set local role authenticated;
do $s16_no_approval$
begin
  begin
    perform public.studio2_apply_permission_change_r3(
      null::uuid,'grant_capability','test',null::uuid,null::timestamptz,
      gen_random_uuid(),'s16-invalid-r3',0::bigint,null::uuid
    );
    raise exception 'S16 R3 call without approval unexpectedly succeeded';
  exception when insufficient_privilege then
    raise notice 'PASS: active R3 rejects unauthorized or missing-approval caller';
  end;
end $s16_no_approval$;
rollback;

begin;
set local role service_role;
do $s16_core_acl$
begin
  if current_user<>'service_role' then
    raise exception 'S16 expected service_role SQL principal';
  end if;
  begin
    perform public.studio2_apply_permission_change(
      null::uuid,'grant_capability', 'test',null::uuid,null::timestamptz,
      gen_random_uuid(),'s16-service-core-bypass',0::bigint
    );
    raise exception 'S16 low-level permission service RPC bypass unexpectedly executable';
  exception when insufficient_privilege then
    if sqlerrm not like '%permission denied for function studio2_apply_permission_change%'
    then raise exception 'S16 expected function ACL denial, got %',sqlerrm;end if;
    raise notice 'PASS: direct service-role low-level permission escalation RPC EXECUTE denied';
  end;
end $s16_core_acl$;
rollback;
