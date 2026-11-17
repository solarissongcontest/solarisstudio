-- Isolated PG17 S16 P07 execution proof. Invoked by the guarded local runner
-- only after the source-defined migration chain and loopback identity checks.
begin;

do $check$
declare
  v_identity text;
begin
  foreach v_identity in array array[
    'public.admin_confirmation_save_round(jsonb)',
    'public.admin_confirmation_delete_round(uuid)',
    'public.admin_confirmation_set_round_status(uuid,text)',
    'public.admin_confirmation_set_round_editing(uuid,boolean)'
  ] loop
    if to_regprocedure(v_identity) is not null then
      raise exception 'Unsafe legacy Confirmation round RPC remains: %', v_identity;
    end if;
  end loop;

  if to_regprocedure('public.studio2_confirmation_round_change_preview(uuid,text,jsonb)') is null
     or to_regprocedure('public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)') is null
     or not has_function_privilege(
       'authenticated',
       'public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)',
       'EXECUTE'
     ) then
    raise exception 'Canonical R2/R3 Confirmation round authority lost';
  end if;
  raise notice 'S16 P07 canonical command and catalog retirement preserved';
end
$check$;

-- Invoke every retired overload as each actual API PostgreSQL role.
-- undefined_function (42883) proves physical SQL retirement, not a UI gate,
-- blocked RLS branch or an untested REVOKE assumption.
set local role anon;
do $deny$
begin
  begin execute 'select public.admin_confirmation_save_round(''{}''::jsonb)';
    raise exception 'anon legacy save round unexpectedly worked';
  exception when undefined_function then null; end;
  begin execute 'select public.admin_confirmation_delete_round(null::uuid)';
    raise exception 'anon legacy delete round unexpectedly worked';
  exception when undefined_function then null; end;
  begin execute 'select public.admin_confirmation_set_round_status(null::uuid,''open''::text)';
    raise exception 'anon legacy status round unexpectedly worked';
  exception when undefined_function then null; end;
  begin execute 'select public.admin_confirmation_set_round_editing(null::uuid,true)';
    raise exception 'anon legacy editing round unexpectedly worked';
  exception when undefined_function then null; end;
  raise notice 'S16 P07: 4 absent legacy Confirmation round RPCs as anon';
end
$deny$;
reset role;

set local role authenticated;
do $deny$
begin
  begin execute 'select public.admin_confirmation_save_round(''{}''::jsonb)';
    raise exception 'authenticated legacy save round unexpectedly worked';
  exception when undefined_function then null; end;
  begin execute 'select public.admin_confirmation_delete_round(null::uuid)';
    raise exception 'authenticated legacy delete round unexpectedly worked';
  exception when undefined_function then null; end;
  begin execute 'select public.admin_confirmation_set_round_status(null::uuid,''open''::text)';
    raise exception 'authenticated legacy status round unexpectedly worked';
  exception when undefined_function then null; end;
  begin execute 'select public.admin_confirmation_set_round_editing(null::uuid,true)';
    raise exception 'authenticated legacy editing round unexpectedly worked';
  exception when undefined_function then null; end;
  raise notice 'S16 P07: 4 absent legacy Confirmation round RPCs as authenticated';
end
$deny$;
reset role;

set local role service_role;
do $deny$
begin
  begin execute 'select public.admin_confirmation_save_round(''{}''::jsonb)';
    raise exception 'service_role legacy save round unexpectedly worked';
  exception when undefined_function then null; end;
  begin execute 'select public.admin_confirmation_delete_round(null::uuid)';
    raise exception 'service_role legacy delete round unexpectedly worked';
  exception when undefined_function then null; end;
  begin execute 'select public.admin_confirmation_set_round_status(null::uuid,''open''::text)';
    raise exception 'service_role legacy status round unexpectedly worked';
  exception when undefined_function then null; end;
  begin execute 'select public.admin_confirmation_set_round_editing(null::uuid,true)';
    raise exception 'service_role legacy editing round unexpectedly worked';
  exception when undefined_function then null; end;
  raise notice 'S16 P07: 4 absent legacy Confirmation round RPCs as service_role';
end
$deny$;
reset role;
rollback;
