begin;

-- Solaris Studio V3 / S14 release-unblock forward fix.
--
-- The canonical Organizer task projection is explicitly rebuildable, and the
-- System/background worker identity is service_role.  The aggregate reconciler
-- was hardened away from PUBLIC/anon/authenticated execution, but no explicit
-- service_role EXECUTE grant remained after PUBLIC was revoked.  That left the
-- documented rebuild path unusable by the system identity even though normal
-- edition consequence processing correctly reaches the same private reconciler
-- through its service-role-only consumer.
--
-- Keep this a System-only capability: this does not expose the reconciler to
-- browser actors and does not alter any Archive runtime/workflow guard.
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.task-reconciliation-service-boundary',
  1,
  'forward_fix_only',
  false,
  null,
  'Restore the explicit service-role authorization boundary for the canonical Organizer task projection rebuild after PUBLIC execution was revoked; browser roles remain denied and Archive guards are unchanged.'
)
on conflict (migration_key) do update
set schema_version = greatest(private.v3_migration_contracts.schema_version, excluded.schema_version),
    reason = excluded.reason;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

grant execute on function private.studio2_reconcile_all_organizer_tasks(uuid)
  to service_role;

comment on function private.studio2_reconcile_all_organizer_tasks(uuid) is
  'System-only canonical Organizer task projection rebuild. EXECUTE is denied to browser roles and granted explicitly to service_role; callers should scope normal operational reconciliation to one edition.';

commit;
