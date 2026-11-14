begin;

-- System-owned Confirmation cutover: retire legacy direct response-access writers.
-- The new versioned preview/apply command boundary is installed in the
-- previous migration. This closes the authenticated RPC bypass without
-- modifying the protected platform / maintenance operation policies.
select public.v3_register_migration_contract(
  'v3.confirmation.retire-legacy-response-writes',
  1, 'forward_fix_only', false, null,
  'Close ordinary API EXECUTE on four unversioned Confirmation response access/deletion functions after governed consumer adoption'
);

revoke all on function public.admin_confirmation_create_edit_token(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.admin_confirmation_create_edit_token(uuid,text,integer) to service_role;
revoke all on function public.admin_confirmation_revoke_edit_token(uuid) from public, anon, authenticated;
grant execute on function public.admin_confirmation_revoke_edit_token(uuid) to service_role;
revoke all on function public.admin_confirmation_delete_response(uuid) from public, anon, authenticated;
grant execute on function public.admin_confirmation_delete_response(uuid) to service_role;
revoke all on function public.admin_update_confirmation_controls(uuid,boolean,boolean,text) from public, anon, authenticated;
grant execute on function public.admin_update_confirmation_controls(uuid,boolean,boolean,text) to service_role;

-- Audit all four exact OIDs in the same transaction. Fail the migration if
-- any inherited PUBLIC or direct authenticated grant remains.
do $audit$
declare
  sig text;
  fn oid;
begin
  foreach sig in array array[
    'public.admin_confirmation_create_edit_token(uuid,text,integer)',
    'public.admin_confirmation_revoke_edit_token(uuid)',
    'public.admin_confirmation_delete_response(uuid)',
    'public.admin_update_confirmation_controls(uuid,boolean,boolean,text)'
  ]
  loop
    fn := to_regprocedure(sig);
    if fn is null then
      raise exception 'Expected legacy Confirmation RPC missing: %', sig using errcode = '42883';
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE')
       or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'Legacy Confirmation access bypass still executable: %', sig using errcode = '42501';
    end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'Service-role compatibility grant missing: %', sig using errcode = '42501';
    end if;
  end loop;
end
$audit$;

notify pgrst, 'reload schema';
commit;
