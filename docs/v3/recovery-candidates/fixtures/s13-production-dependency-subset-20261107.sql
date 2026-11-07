-- S13 local fixture: production-observed *dependency subset*, never a hosted export.
-- Read-only catalog evidence captured 2026-11-07 from Solaris Studio:
-- PostgreSQL 17.11; private schema owner postgres; schema USAGE:
-- anon=true, authenticated=true, service_role=true.
-- private.studio2_request_is_service_role() is an SQL STABLE INVOKER
-- helper owned by postgres, with search_path=pg_catalog.
-- Function EXECUTE: postgres=true, anon=false, authenticated=false, service_role=false.
-- Exact pg_get_functiondef MD5: 84d3f05e5f537908732a3875ba0178e6.
-- Only application code, roles and configuration; NO application rows/secrets.
-- This fixture intentionally does NOT claim the complete hosted schema.
begin;
create schema private authorization postgres;
grant usage on schema private to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.studio2_request_is_service_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
$function$;

revoke all on function private.studio2_request_is_service_role()
  from public, anon, authenticated, service_role;

do $validate_live_dependency$
declare
  v_oid regprocedure := to_regprocedure('private.studio2_request_is_service_role()');
begin
  if current_setting('server_version_num') <> '170011' then
    raise exception 'Production prereq fixture only validated on PostgreSQL 17.11; saw %',
      current_setting('server_version');
  end if;
  if v_oid is null
     or md5(pg_get_functiondef(v_oid::oid)) <> '84d3f05e5f537908732a3875ba0178e6' then
    raise exception 'S13 production-observed security-helper definition is not identical';
  end if;
  if not has_schema_privilege('service_role','private','USAGE')
     or not has_schema_privilege('anon','private','USAGE')
     or not has_schema_privilege('authenticated','private','USAGE') then
    raise exception 'S13 production-observed private-schema USAGE does not match';
  end if;
  if has_function_privilege('anon',v_oid,'EXECUTE')
     or has_function_privilege('authenticated',v_oid,'EXECUTE')
     or has_function_privilege('service_role',v_oid,'EXECUTE') then
    raise exception 'S13 production-observed private-helper EXECUTE grants differ';
  end if;
end
$validate_live_dependency$;
commit;
