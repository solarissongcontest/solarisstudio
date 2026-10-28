begin;
select public.v3_register_migration_contract(
  'v3.authority.truncate-cutover', 1, 'forward_fix_only', false, null,
  'Close the TRUNCATE privilege left behind by the governed permission and Entry INSERT/UPDATE/DELETE cutovers. Runtime callers use row-level commands; none owns bulk table replacement. TRUNCATE bypasses RLS and row audit, so API roles must not retain it.'
);
revoke truncate on table
  public.studio2_capability_grants,
  public.studio2_role_assignments,
  public.studio2_role_capabilities,
  public.studio2_permission_subject_versions,
  public.entries
from public, anon, authenticated, service_role;
commit;
