begin;
-- This test runs only inside the independently started disposable local PG17.
-- The deleted RPC must fail for *actual* API roles, rather than merely being
-- hidden from the client or disallowed by a scanner override.
do $test$
declare
  v_role text;
  v_expected_fail boolean;
  v_fn oid;
begin
  if to_regprocedure('public.admin_set_jury_voting_status(uuid,text)') is not null then
    raise exception 'Legacy Jury status RPC still exists' using errcode='55000';
  end if;
  v_fn := to_regprocedure('public.studio2_apply_jury_voting_status(uuid,text,uuid,text,bigint)');
  if v_fn is null
    or not has_function_privilege('authenticated',v_fn,'EXECUTE')
    or has_function_privilege('anon',v_fn,'EXECUTE') then
    raise exception 'R2 Jury status command privilege regression' using errcode='55000';
  end if;

  foreach v_role in array array['anon','authenticated','service_role'] loop
    v_expected_fail := false;
    execute format('set local role %I',v_role);
    begin
      execute 'select public.admin_set_jury_voting_status($1,$2)'
        using '11111111-1111-4111-8111-111111111111'::uuid, 'open'::text;
    exception when undefined_function then
      v_expected_fail := true;
    end;
    reset role;
    if not v_expected_fail then
      raise exception 'Legacy RPC did not reject % with SQLSTATE 42883',v_role
        using errcode='55000';
    end if;
  end loop;

  if not exists(select 1 from pg_proc p where p.oid=v_fn
    and p.prosecdef
    and pg_get_userbyid(p.proowner)='postgres'
    and pg_get_functiondef(p.oid) like '%private.studio2_claim_operation%'
    and pg_get_functiondef(p.oid) like '%private.studio2_complete_operation%'
    and pg_get_functiondef(p.oid) like '%p_expected_version <> v_current_version%'
    and pg_get_functiondef(p.oid) like '%insert into public.jury_voting_windows%') then
    raise exception 'R2 receipt, version, or Jury mutation was not preserved'
      using errcode='55000';
  end if;
  if not exists(select 1 from pg_trigger t where
    t.tgrelid='public.jury_voting_windows'::regclass
    and t.tgname='studio2_jury_window_touch_edition_version'
    and t.tgenabled='O' and not t.tgisinternal) then
    raise exception 'Jury version trigger was lost' using errcode='55000';
  end if;
end
$test$;
rollback;
