begin;

-- S16 Confirmation authority hardening, family 2.
--
-- `service_role` is transport, not Confirmation semantic authority. These
-- canonical tables are mutated by SECURITY DEFINER commands / internal trigger
-- machinery owned by postgres, so transport credentials do not need raw DML.
revoke insert, update, delete, truncate
  on table public.studio2_confirmation_round_versions
  from service_role;
revoke insert, update, delete, truncate
  on table public.studio2_confirmation_requirements
  from service_role;
revoke insert, update, delete, truncate
  on table private.v3_confirmation_operations
  from service_role;

-- The round-version function is a bounded CAS housekeeping primitive. Keep its
-- two trigger attachments, but make the function inaccessible as an RPC-like
-- primitive and pin resolution all the way through pg_temp.
alter function private.studio2_touch_confirmation_round_version() owner to postgres;
alter function private.studio2_touch_confirmation_round_version()
  set search_path = pg_catalog, public, private, pg_temp;
revoke all on function private.studio2_touch_confirmation_round_version()
  from public, anon, authenticated, service_role;

-- These historical guard triggers only blocked anon/authenticated direct writes.
-- Those roles no longer have direct mutation privileges on submission_rounds,
-- while canonical round commands re-check capability, context and CAS. Keeping
-- the triggers therefore creates extra runtime writers without adding a real
-- security boundary.
drop trigger if exists studio2_guard_direct_confirmation_round_update
  on public.submission_rounds;
drop trigger if exists studio2_guard_direct_confirmation_round_delete
  on public.submission_rounds;
drop function if exists private.studio2_guard_direct_confirmation_round_mutation();

-- Structural proof. This migration must fail closed if transport DML or direct
-- invocation of the CAS primitive is restored later.
do $proof$
begin
  if has_table_privilege('service_role', 'public.studio2_confirmation_round_versions', 'INSERT')
     or has_table_privilege('service_role', 'public.studio2_confirmation_round_versions', 'UPDATE')
     or has_table_privilege('service_role', 'public.studio2_confirmation_round_versions', 'DELETE')
     or has_table_privilege('service_role', 'public.studio2_confirmation_round_versions', 'TRUNCATE') then
    raise exception 'S16: service_role retains raw DML on Confirmation round versions';
  end if;

  if has_table_privilege('service_role', 'public.studio2_confirmation_requirements', 'INSERT')
     or has_table_privilege('service_role', 'public.studio2_confirmation_requirements', 'UPDATE')
     or has_table_privilege('service_role', 'public.studio2_confirmation_requirements', 'DELETE')
     or has_table_privilege('service_role', 'public.studio2_confirmation_requirements', 'TRUNCATE') then
    raise exception 'S16: service_role retains raw DML on Confirmation requirements';
  end if;

  if has_table_privilege('service_role', 'private.v3_confirmation_operations', 'INSERT')
     or has_table_privilege('service_role', 'private.v3_confirmation_operations', 'UPDATE')
     or has_table_privilege('service_role', 'private.v3_confirmation_operations', 'DELETE')
     or has_table_privilege('service_role', 'private.v3_confirmation_operations', 'TRUNCATE') then
    raise exception 'S16: service_role retains raw DML on Confirmation operation ledger';
  end if;

  if has_function_privilege(
       'service_role',
       'private.studio2_touch_confirmation_round_version()',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'private.studio2_touch_confirmation_round_version()',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'private.studio2_touch_confirmation_round_version()',
       'EXECUTE'
     ) then
    raise exception 'S16: Confirmation round-version housekeeping primitive is externally executable';
  end if;

  if exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.submission_rounds'::regclass
      and trigger_row.tgname in (
        'studio2_guard_direct_confirmation_round_update',
        'studio2_guard_direct_confirmation_round_delete'
      )
      and not trigger_row.tgisinternal
  ) then
    raise exception 'S16: obsolete direct-round guard trigger remains attached';
  end if;

  if to_regprocedure('private.studio2_guard_direct_confirmation_round_mutation()') is not null then
    raise exception 'S16: obsolete direct-round guard function remains callable';
  end if;
end;
$proof$;

commit;
