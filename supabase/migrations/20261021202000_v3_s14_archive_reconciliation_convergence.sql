begin;

-- Solaris Studio V3 / S14 release-unblock completion.
--
-- The final terminal-boundary migration introduces a private transaction gate
-- so legacy/current task producers can be replayed safely after Archive. Keep
-- the S14 Archive resolver and resolved-notification reconciler in the aggregate
-- rebuild path as well: producers are allowed to rediscover conditions, the
-- Archive resolver remains the authority that makes impossible current-contest
-- work terminal, and notification state is reconciled from that terminal task
-- truth. Repeating the whole rebuild must converge without reopening work or
-- rewriting retained resolution evidence.
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.archive-reconciliation-convergence',
  1,
  'forward_fix_only',
  false,
  null,
  'Retain S14 archived-workflow resolution and resolved-notification reconciliation while making repeated canonical Organizer task rebuilds converge through the private Archive reconciliation gate.'
)
on conflict (migration_key) do update
set schema_version = greatest(private.v3_migration_contracts.schema_version, excluded.schema_version),
    reason = excluded.reason;

create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $alltasks$
begin
  -- Arm only the private transaction-local reconciliation capability. Browser
  -- actors and service_role cannot write/read the gate directly.
  insert into private.v3_archive_task_reconciliation_gates (
    edition_id,
    transaction_id
  )
  select runtime.edition_id, txid_current()
  from public.studio2_edition_runtime runtime
  where runtime.state = 'archived'
    and (p_edition_id is null or runtime.edition_id = p_edition_id)
  on conflict do nothing;

  -- Preserve the complete pre-existing producer set. Governance producers still
  -- run after Archive; the Task trigger gates only current-workflow task types.
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_repair_jury_missing_ballot_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_reconcile_system_job_tasks();
  perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_sync_tasks();

  -- Preserve S14 terminal semantics. This catches existing open
  -- current-workflow tasks that no producer happened to touch during this run.
  if p_edition_id is not null then
    perform private.v3_resolve_archived_edition_workflow_tasks(p_edition_id);
  else
    perform private.v3_resolve_archived_edition_workflow_tasks(runtime.edition_id)
    from public.studio2_edition_runtime runtime
    where runtime.state = 'archived';
  end if;

  -- Rebuild present-tense delivery projections from the now-terminal task truth
  -- while retaining failed delivery attempts as historical evidence.
  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.v3_reconcile_resolved_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);

  delete from private.v3_archive_task_reconciliation_gates gate
  where gate.transaction_id = txid_current()
    and (p_edition_id is null or gate.edition_id = p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_reconcile_all_organizer_tasks(uuid)
  to service_role;

comment on function private.studio2_reconcile_all_organizer_tasks(uuid) is
  'System-only canonical Organizer task projection rebuild. Repeated rebuilds preserve S14 Archive resolution, retained failed-delivery evidence and legitimate governance work while archived current-workflow producers converge without resurrection.';

commit;
