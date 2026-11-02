begin;

-- Keep service-role detection compatible with both legacy PostgREST scalar JWT
-- settings and the canonical JSON claims setting used by current local/hosted
-- Supabase runtimes. This helper is shared by privileged V3 verification and
-- projection paths, so callers must not need a user capability merely because
-- one request-claim representation is absent.
create or replace function private.studio2_request_is_service_role()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) = 'service_role'
$$;

notify pgrst, 'reload schema';

commit;
