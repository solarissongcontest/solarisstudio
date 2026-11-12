-- S02 bounded hosted-observed preconditions for S13 local fixture only.
-- Operator read-only catalog evidence 2026-11-09. NOT a production migration.
CREATE OR REPLACE FUNCTION private.studio2_request_is_service_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
$function$;
-- Match the independently observed helper ACL (postgres only), rather than
-- inheriting CREATE FUNCTION's PUBLIC EXECUTE default in this local fixture.
REVOKE ALL ON FUNCTION private.studio2_request_is_service_role()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA private TO service_role;
