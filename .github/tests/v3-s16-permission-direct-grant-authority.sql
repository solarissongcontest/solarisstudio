-- Synthetic-only PostgreSQL role proof. Invoked solely after the guarded
-- localhost migration replay; no hosted connections, credentials or data.
do $pre$
begin
 if current_user <> 'postgres'
 or to_regclass('public.studio2_capability_grants') is null
 or not exists(select 1 from private.v3_migration_contracts where migration_key='v3.s16.permission-direct-write-retirement')
 then raise exception 'S16 permission role probe refused unqualified candidate' using errcode='55000'; end if;
end
$pre$;

-- Verify actual SQLSTATE 42501 under all three API roles and four tables.
begin;
set local role anon;
do $denials$
declare v_table text; v_statement text;
begin
 foreach v_table in array array[
 'public.studio2_capability_grants',
 'public.studio2_role_assignments',
 'public.studio2_role_capabilities',
 'public.studio2_permission_subject_versions'
 ] loop
  foreach v_statement in array array[
    format('insert into %s default values',v_table),
    format('update %s set %I=%I where false',v_table,
      case when v_table='public.studio2_role_capabilities' then 'role_key' else 'user_id' end,
      case when v_table='public.studio2_role_capabilities' then 'role_key' else 'user_id' end),
    format('delete from %s where false',v_table),
    format('truncate %s',v_table)
  ] loop
    begin
      execute v_statement;
      raise exception 'Unsafe direct permission SQL unexpectedly succeeded: %', v_statement;
    exception when insufficient_privilege then null;
    end;
  end loop;
 end loop;
end
$denials$;
rollback;

begin;
set local role authenticated;
do $denials$
declare v_table text; v_statement text;
begin
 foreach v_table in array array[
 'public.studio2_capability_grants',
 'public.studio2_role_assignments',
 'public.studio2_role_capabilities',
 'public.studio2_permission_subject_versions'
 ] loop
  foreach v_statement in array array[
    format('insert into %s default values',v_table),
    format('update %s set %I=%I where false',v_table,
      case when v_table='public.studio2_role_capabilities' then 'role_key' else 'user_id' end,
      case when v_table='public.studio2_role_capabilities' then 'role_key' else 'user_id' end),
    format('delete from %s where false',v_table),
    format('truncate %s',v_table)
  ] loop
    begin
      execute v_statement;
      raise exception 'Unsafe direct permission SQL unexpectedly succeeded: %', v_statement;
    exception when insufficient_privilege then null;
    end;
  end loop;
 end loop;
end
$denials$;
rollback;

begin;
set local role service_role;
do $denials$
declare v_table text; v_statement text;
begin
 foreach v_table in array array[
 'public.studio2_capability_grants',
 'public.studio2_role_assignments',
 'public.studio2_role_capabilities',
 'public.studio2_permission_subject_versions'
 ] loop
  foreach v_statement in array array[
    format('insert into %s default values',v_table),
    format('update %s set %I=%I where false',v_table,
      case when v_table='public.studio2_role_capabilities' then 'role_key' else 'user_id' end,
      case when v_table='public.studio2_role_capabilities' then 'role_key' else 'user_id' end),
    format('delete from %s where false',v_table),
    format('truncate %s',v_table)
  ] loop
    begin
      execute v_statement;
      raise exception 'Unsafe direct permission SQL unexpectedly succeeded: %', v_statement;
    exception when insufficient_privilege then null;
    end;
  end loop;
 end loop;
end
$denials$;
rollback;

-- Positive service-only owner-executed compatibility boundary, including
-- trigger-propagated permission versions. Transaction rolls back the user,
-- grant, receipt-independent compatibility records and all synthetic effects.
begin;
insert into auth.users(id,aud,role,email,created_at,updated_at)
values('75200000-0000-4000-8000-000000000001',
       'authenticated','authenticated','s16-permission-grant@local.invalid',now(),now());
set local role service_role;
do $positive$
declare v_user uuid:='75200000-0000-4000-8000-000000000001'; v_row record;
begin
 if not has_function_privilege('service_role','public.studio2_grant_capability(uuid,text,uuid,timestamptz)','EXECUTE')
 then raise exception 'Service-only owner-executed permission command lost';end if;
 perform public.studio2_grant_capability(v_user,'edition.manage',null,null);
 if not exists(select 1 from public.studio2_capability_grants where user_id=v_user and capability='edition.manage')
 then raise exception 'Owner-executed service grant failed after table DML retirement';end if;
 perform public.studio2_grant_capability(v_user,'edition.manage',null,null);
 if (select count(*) from public.studio2_capability_grants where user_id=v_user and capability='edition.manage') <> 1
 then raise exception 'Owner-executed service grant replay duplicated row';end if;
 if not public.studio2_revoke_capability(v_user,'edition.manage',null)
 then raise exception 'Owner-executed service revoke did not apply';end if;
 if exists(select 1 from public.studio2_capability_grants where user_id=v_user and capability='edition.manage')
 then raise exception 'Owner-executed service revoke left grant';end if;
 raise notice 'PASS: service-only owner-executed permission grant, replay and revoke with revoked table DML';
end
$positive$;
rollback;
