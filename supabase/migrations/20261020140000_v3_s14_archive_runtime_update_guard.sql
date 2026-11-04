begin;

-- System V3 / S14 forward fix.
-- The archive guard function already validates UPDATE transitions, but the
-- original hardening migration only installed INSERT and DELETE triggers.
-- Install the missing UPDATE trigger so privileged direct SQL cannot enter or
-- leave the terminal archived runtime state outside the canonical command.
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.archive-runtime-update-guard',
  3,
  'forward_fix_only',
  false,
  null,
  'Install the missing UPDATE trigger for the existing S14 archive runtime guard so Archive remains command-only and irreversible.'
)
on conflict (migration_key) do update
set schema_version = greatest(private.v3_migration_contracts.schema_version, excluded.schema_version),
    reason = excluded.reason;

drop trigger if exists v3_guard_archive_runtime_update
  on public.studio2_edition_runtime;
create trigger v3_guard_archive_runtime_update
before update of state on public.studio2_edition_runtime
for each row execute function private.v3_guard_archive_runtime_transition();

commit;
