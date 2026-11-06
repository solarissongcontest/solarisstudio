begin;

-- Keep service-role detection compatible with both legacy PostgREST scalar JWT
-- settings and the canonical JSON claims setting used by current local/hosted
-- Supabase runtimes. This helper is shared by privileged V3 verification and
-- projection paths, so callers must not need a user capability merely because
-- one request-claim representation is absent.
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.service-role-claim-compatibility',
  2,
  'forward_fix_only',
  false,
  null,
  'Keep canonical service-role authorization stable across PostgREST scalar and JSON JWT claim representations without weakening capability checks for non-service callers.'
)
on conflict (migration_key) do update
set schema_version = greatest(private.v3_migration_contracts.schema_version, excluded.schema_version),
    reason = excluded.reason;

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
