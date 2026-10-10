import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const finalRuntime = source(
  "supabase/migrations/20261004230000_organizer_task_runtime_reconciliation.sql",
);
const permissionTasks = source(
  "supabase/migrations/20261003154000_organisation_os_v5_r3_permission_tasks.sql",
);

describe("Organizer Task runtime reconciliation", () => {
  it("keeps every V5 task source in the canonical reconciliation wrapper", () => {
    for (const call of [
      "perform private.studio2_reconcile_organizer_tasks(p_edition_id);",
      "perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);",
      "perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);",
      "perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);",
      "perform private.studio2_reconcile_permission_approval_tasks();",
      "perform private.studio2_reconcile_system_job_tasks();",
      "perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);",
      "perform private.studio2_reconcile_confirmation_sync_tasks();",
      "perform private.studio2_sync_task_notifications(p_edition_id);",
      "perform private.studio2_prune_stale_task_notifications(p_edition_id);",
    ]) {
      expect(finalRuntime).toContain(call);
    }
  });

  it("keeps the public Tasks RPCs routed through the canonical all-source wrapper", () => {
    expect(permissionTasks).toContain(
      "perform private.studio2_reconcile_all_organizer_tasks(p_edition_id);",
    );
    expect(permissionTasks).toContain(
      "create or replace function public.admin_organizer_tasks",
    );
    expect(permissionTasks).toContain(
      "create or replace function public.admin_organizer_task_count",
    );
  });

  it("does not publish the complete frontend contract until the all-source wrapper exists", () => {
    expect(finalRuntime).toContain("organisation-os-v5-20261004-complete");
    expect(finalRuntime).toContain(
      "private.studio2_reconcile_confirmation_sync_tasks()",
    );
    expect(finalRuntime).toContain("'ready',");
  });
});
