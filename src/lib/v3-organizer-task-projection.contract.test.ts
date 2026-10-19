import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20261019205500_v3_organizer_task_projection.sql",
);
const client = source("src/lib/admin-tasks-v3.ts");
const runtime = source("src/lib/organisation-backend-contract.ts");
const route = source("src/routes/_authenticated/admin/tasks.tsx");

describe("V3 Organizer Task authority", () => {
  it("registers the post-S13 migration and preserves the legacy compatibility contract", () => {
    expect(migration).toContain("public.v3_register_migration_contract");
    expect(migration).toContain("20261019205500_v3_organizer_task_projection");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("admin_organizer_tasks(uuid,text)");
    expect(migration).toContain("admin_organizer_task_count(uuid)");
    expect(migration).toContain("organisation-os-v5-20261004-complete");
  });

  it("requires an explicit edition and reconciles canonical sources before projecting", () => {
    expect(migration).toContain("if p_edition_id is null then");
    expect(migration).toContain("Organizer Tasks V3 require an explicit edition");
    expect(migration).toContain(
      "perform private.studio2_reconcile_all_organizer_tasks(p_edition_id)",
    );
    expect(migration).toContain("task.edition_id = p_edition_id or task.edition_id is null");
    expect(migration).toContain(
      "public.studio2_access_allowed(task.required_capability, task.edition_id, false)",
    );
  });

  it("publishes the canonical Organizer task dimensions independently", () => {
    for (const field of [
      "operationalState",
      "actionRequired",
      "blocking",
      "urgency",
      "impact",
      "deliveryClass",
      "why",
      "primaryAction",
      "stateVersion",
      "resolutionEvidence",
    ]) {
      expect(migration).toContain(`'${field}'`);
    }
    expect(migration).toContain("'kind', 'navigate'");
    expect(migration).not.toContain("'kind', 'command'");
  });

  it("does not confuse terminal expired or superseded tasks with unresolved work", () => {
    expect(migration).toContain(
      "not in ('resolved', 'expired', 'superseded')",
    );
    expect(migration).toContain(
      "in ('resolved', 'expired', 'superseded')",
    );
    expect(migration).toContain("'{summary,unresolved}'");
  });

  it("keeps workflow state distinct from severity and notification state", () => {
    expect(migration).toContain("p_task.priority in ('critical', 'high')");
    expect(migration).toContain("p_task.task_type in ('confirmation.required', 'media.required')");
    expect(migration).not.toContain("notification_deliveries delivery");
    expect(migration).not.toContain("notification.read");
    expect(migration).not.toContain("mark_resolved");
  });

  it("bounds list reads and provides server-side operational filters", () => {
    expect(migration).toContain("v_limit < 1 or v_limit > 200");
    expect(migration).toContain("v_offset < 0 or v_offset > 5000");
    for (const filter of [
      "needs_action",
      "actionable",
      "in_progress",
      "blocked",
      "waiting",
      "failed",
      "overdue",
      "expired",
      "superseded",
      "mine",
      "resolved",
      "recent_resolved",
    ]) {
      expect(migration).toContain(`'${filter}'`);
    }
  });

  it("advertises the successor separately so deployment order stays fail-safe", () => {
    expect(migration).toContain("organizerTasksV3");
    expect(migration).toContain(
      "public.admin_organizer_tasks_v3(uuid,text,integer,integer)",
    );
    expect(runtime).toContain("organizerTasksV3: boolean");
    expect(runtime).toContain("capabilities.organizerTasksV3 === true");
    expect(route).toContain("tasksV3Supported");
    expect(route).toContain("useOrganizerTasksV3");
    expect(route).toContain("tasksSupported && !tasksV3Supported");
  });

  it("keeps the browser a projection consumer rather than task authority", () => {
    expect(client).toContain('client.rpc("admin_organizer_tasks_v3"');
    expect(client).toContain("projection.items.some");
    expect(client).toContain("Organizer Tasks V3 returned a task from another edition scope");
    expect(route).not.toContain("markResolved");
    expect(route).not.toContain("update({ state: \"resolved\"");
  });
});
