-- Standard Supabase Auth JWT reader, fingerprint-qualified locally against
-- owner-authorized catalog evidence. Fixture bootstrap only, NEVER hosted DDL.
begin;
do $local$begin
 if current_user<>'solaris_recovery_bootstrap' or current_database()<>'recovery_operator_baseline'
    or current_setting('server_version_num')<>'170011' or to_regprocedure('auth.jwt()') is not null then
  raise exception 'Isolated missing auth.jwt fixture prerequisite only';end if;
end $local$;
CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$;
alter function auth.jwt() owner to supabase_auth_admin;
set local role supabase_auth_admin;
revoke all on function auth.jwt() from public,postgres,anon,authenticated,service_role,dashboard_user;
grant execute on function auth.jwt() to public,postgres,supabase_auth_admin,dashboard_user;
reset role;
do $post$begin
 if not exists(select 1 from pg_proc where oid='auth.jwt()'::regprocedure
  and pg_get_userbyid(proowner)='supabase_auth_admin' and not prosecdef and proconfig is null
  and encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')='7ce3ad8fb99f7ad5f5cd869fbd5479a6325e9444da472c26394cfa66c83b2d11') then
  raise exception 'Auth JWT fixture owner/body mismatch';end if;
end $post$;
commit;
