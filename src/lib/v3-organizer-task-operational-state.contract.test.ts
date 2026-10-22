import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = source(
  "supabase/migrations/20261019205330_v3_s6_organizer_task_operational_state.sql",
);
const backendContract = source("src/lib/organisation-backend-contract.ts");
const taskAdapter = source("src/lib/admin-tasks-v5.ts");
const taskRoute = source("src/routes/_authenticated/admin/tasks.tsx");

function section(start: string, end: string) {
  const from = migration.indexOf(start);
  const to = migration.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return migration.slice(from, to);
}

describe("V3 Organizer task operational-state projection", () => {
  it("adopts the S13 migration contract and stays additive", () => {
    expect(migration).toContain("'v3.s6.organizer-task-operational-state'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false,");
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|constraint)\b/i);
    expect(migration).not.toMatch(/\btruncate\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("derives richer state from canonical producer evidence, never title or priority heuristics", () => {
    const helper = section(
      "create or replace function private.v3_organizer_task_operational_state(",
      "revoke all on function private.v3_organizer_task_operational_state(",
    );

    expect(helper).toContain("p_state = 'resolved'");
    expect(helper).toContain("p_state = 'waiting'");
    expect(helper).toContain("'notification.delivery_failed'");
    expect(helper).toContain("'integration.operation.failed'");
    expect(helper).toContain("'integration.link.repair'");
    expect(helper).toContain("'system.job.failure'");
    expect(helper).toContain("p_task_type = 'media.required'");
    expect(helper).toContain("p_due_at <= p_evaluated_at");
    expect(helper).not.toMatch(/title/i);
    expect(helper).not.toMatch(/priority/i);
  });

  it("returns explicit operational state and supports server-side V3 inbox filters", () => {
    const rpc = section(
      "create or replace function public.admin_organizer_tasks(",
      "revoke all on function public.admin_organizer_tasks(uuid, text)",
    );

    for (const state of [
      "actionable",
      "blocked",
      "waiting",
      "failed",
      "overdue",
      "resolved",
    ]) {
      expect(rpc).toContain(`'${state}'`);
    }

    expect(rpc).toContain("'operationalState', task.operational_state");
    expect(rpc).toContain("'dedupeKey', task.source_key");
    expect(rpc).toContain("'stateVersion', task.updated_at");
    expect(rpc).toContain("perform private.studio2_reconcile_all_organizer_tasks(p_edition_id)");
    expect(rpc).toContain("public.studio2_access_allowed(task.required_capability, task.edition_id, false)");
    expect(rpc).toContain("task.edition_id = p_edition_id");
  });

  it("advertises support without changing the established runtime schema id", () => {
    expect(migration).toContain("'organisation-os-v5-20261004-complete'");
    expect(migration).toContain("'organizerTaskOperationalStates'");
    expect(migration).toContain("private.v3_organizer_task_operational_state");

    expect(backendContract).toContain("organizerTaskOperationalStates: boolean");
    expect(backendContract).toContain("organizerTaskOperationalStates: false");
    expect(backendContract).toContain(
      "capabilities.organizerTaskOperationalStates === true",
    );
  });

  it("keeps the Organizer consumer fail-closed around explicit blocked/failed evidence", () => {
    expect(taskAdapter).toContain("operationalState?: OrganizerTaskOperationalState | null");
    expect(taskAdapter).toContain("parseOperationalState");
    expect(taskRoute).toContain("explicitOperationalEvidence");
    expect(taskRoute).toContain("Solaris will not infer workflow state from priority");
    expect(taskRoute).not.toContain('title.includes("failed")');
    expect(taskRoute).not.toContain('priority === "critical" ? "blocked"');
  });
});
