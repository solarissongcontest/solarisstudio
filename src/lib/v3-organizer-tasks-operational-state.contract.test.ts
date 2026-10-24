import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/tasks.tsx", "utf8");
const adapter = readFileSync("src/lib/admin-tasks-v5.ts", "utf8");

describe("V3 Organizer Tasks operational state contract", () => {
  it("distinguishes the canonical operational classes in the Organizer queue", () => {
    for (const state of [
      "actionable",
      "blocked",
      "waiting",
      "failed",
      "overdue",
      "resolved",
    ]) {
      expect(route).toContain(`"${state}"`);
    }
  });

  it("keeps backend task state authoritative and fails closed when rich state is absent", () => {
    expect(adapter).toContain('if (task.state === "resolved") return "resolved";');
    expect(adapter).toContain('if (task.state === "waiting") return "waiting";');
    expect(adapter).toContain('if (task.operationalState) return task.operationalState;');
    expect(adapter).toContain('return "unclassified";');
    expect(adapter).toContain("due timestamp is display metadata");
    expect(adapter).not.toContain("Date.now()");
    expect(adapter).not.toContain("dueMs <= nowMs");
  });

  it("requires complete canonical rich-state evidence before exposing rich metrics", () => {
    expect(adapter).toContain("hasCompleteOrganizerTaskOperationalEvidence");
    expect(route).toContain("completeOperationalEvidence");
    expect(route).toContain("metricsAvailable && completeOperationalEvidence");
    expect(route).toContain("At least one unresolved task does not expose canonical rich-state evidence");
    expect(route).toContain('value == null ? "Unknown"');
  });

  it("binds Tasks to an edition that still resolves in the Organizer edition set", () => {
    expect(route).toContain("selectOrganizerEdition(editions, editionId)");
    expect(route).toContain('const resolvedEditionId = editionId && edition ? edition.id : ""');
    expect(route).toContain("useOrganizerTasksV5(");
    expect(route).toContain("resolvedEditionId || null");
    expect(route).toContain("Boolean(resolvedEditionId) &&");
    expect(route).toContain("editionsQuery.isSuccess &&");
    expect(route).toContain("!editionsQuery.error");
    expect(route).not.toContain("useOrganizerTasksV5(editionId,");
  });

  it("stops task polling when edition verification fails even if cached edition data remains", () => {
    expect(route).toContain("tasksSupported &&");
    expect(route).toContain("editionsQuery.isSuccess &&");
    expect(route).toContain("!editionsQuery.error,");
    expect(route).toContain("!editionsQuery.error &&");
  });

  it("makes the edition scope visible and fails closed for missing or stale context", () => {
    expect(route).toContain('data-v3-organizer-context-lock="edition"');
    expect(route).toContain("Edition context");
    expect(route).toContain("Choose an edition");
    expect(route).toContain("missing, stale or inaccessible edition context");
    expect(route).toContain("edition && filter !== \"resolved\"");
    expect(route).toContain("Boolean(resolvedEditionId) &&");
  });

  it("does not equate task priority with blocked workflow state", () => {
    expect(route).toContain("Priority is severity, not workflow state");
    expect(route).not.toContain('task.priority === "critical") return "blocked"');
    expect(adapter).not.toContain('task.priority === "critical"');
  });

  it("keeps due timestamps informational instead of making the browser a workflow clock", () => {
    expect(route).toContain("Due timestamps are display metadata only");
    expect(route).toContain("the browser clock never upgrades them into workflow truth");
    expect(adapter).not.toContain("new Date(task.dueAt)");
  });

  it("keeps notification state separate from task truth", () => {
    expect(route).toContain("Reading a notification never completes a task");
    expect(route).toContain("There is intentionally no generic “Mark resolved” button.");
  });
});
