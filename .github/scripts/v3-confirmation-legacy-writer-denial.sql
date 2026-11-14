\set ON_ERROR_STOP on
-- Called only by the loopback-checked disposable Confirmation rehearsal.
-- Even an unexpectedly callable legacy body cannot write during this probe.
begin transaction read only;
do $test$
declare
  actor_role text;
  invocation text;
  denied boolean;
  identity text;
begin
  foreach identity in array array[
    'public.admin_confirmation_create_edit_token(uuid,text,integer)',
    'public.admin_confirmation_revoke_edit_token(uuid)',
    'public.admin_confirmation_delete_response(uuid)',
    'public.admin_update_confirmation_controls(uuid,boolean,boolean,text)'
  ] loop
    if to_regprocedure(identity) is null then
      raise exception 'Missing legacy function: %', identity;
    end if;
    if not has_function_privilege('postgres', to_regprocedure(identity), 'EXECUTE') then
      raise exception 'Owner implementation lost: %', identity;
    end if;
  end loop;
  if not has_function_privilege('authenticated',
    'public.studio2_apply_confirmation_response_access_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)',
    'EXECUTE') then
    raise exception 'Governed Confirmation command lost';
  end if;
  foreach actor_role in array array['anon','authenticated','service_role'] loop
    foreach invocation in array array[
      'select public.admin_confirmation_create_edit_token(null::uuid,''reusable'',1)',
      'select public.admin_confirmation_revoke_edit_token(null::uuid)',
      'select public.admin_confirmation_delete_response(null::uuid)',
      'select public.admin_update_confirmation_controls(null::uuid,true,false,null::text)'
    ] loop
      execute format('set local role %I', actor_role);
      -- No actor JWT: in particular service_role must not authorize itself.
      denied := false;
      begin
        execute invocation;
      exception when insufficient_privilege then
        denied := true;
      end;
      execute 'reset role';
      if not denied then
        raise exception 'Legacy writer unexpectedly callable by %: %', actor_role, invocation;
      end if;
    end loop;
  end loop;
end $test$;
rollback;
