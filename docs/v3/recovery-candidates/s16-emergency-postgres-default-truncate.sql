-- Solaris Studio emergency preventative hardening of FUTURE postgres-owned public tables.
-- Does not alter existing table permissions, schema objects, data, Supabase-managed
-- supabase_admin default ACL, service_role grants, RLS, Auth, or migration history.
-- Purpose: stop automatic anon/authenticated TRUNCATE on new tables created by postgres.
-- Project: dkxmnvekiopyesuzggeu; PostgreSQL 17.11; separately audited owner path.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $guard$
declare
  v_postgres oid := (select oid from pg_roles where rolname='postgres');
  v_admin oid := (select oid from pg_roles where rolname='supabase_admin');
  v_public oid := (select oid from pg_namespace where nspname='public');
  v_before text;
  v_after text;
  v_admin_before text;
  v_admin_after text;
  v_target_count integer;
begin
  if current_user <> 'postgres' or current_setting('server_version_num') <> '170011' then
    raise exception 'Default ACL repair: wrong owner or PG version' using errcode='55000';
  end if;
  if v_public is null or v_admin is null then
    raise exception 'Default ACL repair: expected owner/schema missing' using errcode='55000';
  end if;
  select count(*) into v_target_count
  from pg_default_acl d cross join lateral aclexplode(d.defaclacl) g
  where d.defaclrole=v_postgres and d.defaclnamespace=v_public and d.defaclobjtype='r'
    and g.privilege_type='TRUNCATE' and g.grantee IN
      (select oid from pg_roles where rolname in ('anon','authenticated'));
  if v_target_count <> 2 then
    raise exception 'Default ACL repair: expected both postgres-owned public API TRUNCATE defaults, found %',v_target_count using errcode='55000';
  end if;
  select md5(coalesce(string_agg(concat_ws('|',g.grantee::text,g.privilege_type,g.is_grantable),
         chr(10) order by g.grantee,g.privilege_type),''))
  into v_before
  from pg_default_acl d cross join lateral aclexplode(d.defaclacl) g
  where d.defaclrole=v_postgres and d.defaclnamespace=v_public and d.defaclobjtype='r'
    and not (g.privilege_type='TRUNCATE' and g.grantee in
       (select oid from pg_roles where rolname in ('anon','authenticated')));
  select md5(coalesce(string_agg(concat_ws('|',g.grantee::text,g.privilege_type,g.is_grantable),
          chr(10) order by g.grantee,g.privilege_type),''))
  into v_admin_before
  from pg_default_acl d cross join lateral aclexplode(d.defaclacl) g
  where d.defaclrole=v_admin and d.defaclnamespace=v_public and d.defaclobjtype='r';
  execute 'alter default privileges for role postgres in schema public revoke truncate on tables from anon, authenticated';
  select count(*) into v_target_count
  from pg_default_acl d cross join lateral aclexplode(d.defaclacl) g
  where d.defaclrole=v_postgres and d.defaclnamespace=v_public and d.defaclobjtype='r'
    and g.privilege_type='TRUNCATE' and g.grantee IN
       (select oid from pg_roles where rolname in ('anon','authenticated'));
  if v_target_count<>0 then
     raise exception 'Default ACL repair: postgres API TRUNCATE defaults remain' using errcode='55000';
  end if;
  select md5(coalesce(string_agg(concat_ws('|',g.grantee::text,g.privilege_type,g.is_grantable),
         chr(10) order by g.grantee,g.privilege_type),''))
  into v_after
  from pg_default_acl d cross join lateral aclexplode(d.defaclacl) g
  where d.defaclrole=v_postgres and d.defaclnamespace=v_public and d.defaclobjtype='r'
    and not (g.privilege_type='TRUNCATE' and g.grantee in
       (select oid from pg_roles where rolname in ('anon','authenticated')));
  select md5(coalesce(string_agg(concat_ws('|',g.grantee::text,g.privilege_type,g.is_grantable),
         chr(10) order by g.grantee,g.privilege_type),''))
  into v_admin_after
  from pg_default_acl d cross join lateral aclexplode(d.defaclacl) g
  where d.defaclrole=v_admin and d.defaclnamespace=v_public and d.defaclobjtype='r';
  if v_before is distinct from v_after or v_admin_before is distinct from v_admin_after then
    raise exception 'Default ACL repair: unrelated grants or supabase_admin defaults changed' using errcode='55000';
  end if;
end $guard$;
commit;
