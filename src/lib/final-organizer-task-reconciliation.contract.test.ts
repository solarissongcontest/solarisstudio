import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261005050000_restore_confirmation_sync_task_reconciliation.sql",
  "utf8",
);

describe("final Organizer Task reconciliation", () => {
  it("retains every task source after the PR 450 review-blocker repair", () => {
    const requiredCalls = [
      "private.studio2_reconcile_organizer_tasks(p_edition_id)",
      "private.studio2_reconcile_organizer_tasks_operational(p_edition_id)",
      "private.studio2_repair_jury_missing_ballot_tasks(p_edition_id)",
      "private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id)",
      "private.studio2_reconcile_organizer_tasks_truth(p_edition_id)",
      "private.studio2_reconcile_permission_approval_tasks()",
      "private.studio2_reconcile_system_job_tasks()",
      "private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id)",
      "private.studio2_reconcile_confirmation_sync_tasks()",
      "private.studio2_sync_task_notifications(p_edition_id)",
      "private.studio2_prune_stale_task_notifications(p_edition_id)",
    ];

    for (const call of requiredCalls) {
      expect(migration).toContain(`perform ${call};`);
    }
  });

  it("reprojects authoritative task truth after installing the final wrapper", () => {
    expect(migration).toContain(
      "select private.studio2_reconcile_all_organizer_tasks(null);",
    );
    expect(migration).toContain("notify pgrst, 'reload schema';");
  });
});
