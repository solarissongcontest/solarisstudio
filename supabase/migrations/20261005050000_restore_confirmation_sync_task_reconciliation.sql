begin;

-- Final Organizer Task wrapper after the PR #450 review-blocker repair.
--
-- 20261005043000_pr450_review_blocker_repairs.sql intentionally redefined the
-- aggregate reconciler to add the repaired jury-missing-ballot pass, but that
-- replacement accidentally omitted the confirmation-sync task source introduced
-- earlier by 20261003215000/20261004230000. Keep every authoritative task source
-- in the final definition so opening Organizer Tasks cannot silently drop stale
-- Confirmations -> canonical-entry reconciliation work.
create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $alltasks$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_repair_jury_missing_ballot_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_reconcile_system_job_tasks();
  perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_sync_tasks();
  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

-- Re-project task truth once with the actually final wrapper. This only derives
-- Organizer tasks/notifications from current domain state; it does not execute
-- the domain actions represented by those tasks.
select private.studio2_reconcile_all_organizer_tasks(null);

notify pgrst, 'reload schema';

commit;
