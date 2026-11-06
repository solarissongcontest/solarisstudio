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

  it("keeps private Tasks and mobile badge caches isolated by authenticated actor", () => {
    expect(adapter).toContain('import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";');
    expect(adapter).toContain('const actorId = useAuthenticatedUser().id;');
    expect(adapter).toContain('queryKey: ["organizer-tasks-v5", normalizedEditionId ?? "unscoped", filter, actorId]');
    expect(adapter).toContain('queryKey: ["organizer-task-count-v5", normalizedEditionId ?? "unscoped", actorId]');
    expect(adapter).not.toContain('queryKey: ["organizer-tasks-v5", normalizedEditionId ?? "unscoped", filter]');
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
    expect(route).toContain("!editionsQuery.error &&");
    expect(route).toContain("taskReadPermitted,");
    expect(route).toContain("!editionsQuery.error &&");
  });

  it("verifies the exact task RPC authorization policy before polling or showing counts", () => {
    expect(route).toContain('p_capability: "edition.read"');
    expect(route).toContain('p_edition_id: resolvedEditionId');
    expect(route).toContain('p_capability: "permissions.manage"');
    expect(route).toContain('p_edition_id: null');
    expect(route).toContain('client.rpc("studio2_access_allowed"');
    expect(route).toContain("taskReadPermitted,");
    expect(route).toContain("taskReadPermitted &&");
    expect(route).toContain("taskAccessQuery.data === true");
    expect(route).toContain('title="Organizer task access required"');
    expect(route).toContain('title="Task access could not be verified"');
    expect(route).toContain("No task evaluation or reconciliation was requested.");
    expect(route).toContain('actorId, resolvedEditionId || "none"');
    expect(route).toContain('gcTime: 0');
    expect(route).not.toContain("enabled: Boolean(resolvedEditionId)");
  });

  it("makes the edition scope visible and fails closed for missing or stale context", () => {
    expect(route).toContain('data-v3-organizer-context-lock="edition"');
    expect(route).toContain("Edition context");
    expect(route).toContain("Choose an edition");
    expect(route).toContain("missing, stale or inaccessible edition context");
    expect(route).toContain("edition && filter !== \"resolved\"");
    expect(route).toContain("Boolean(resolvedEditionId) &&");
  });

  it("distinguishes backend transport failure from unsupported task schema and provides bounded recovery", () => {
    expect(route).toContain("backend.isError || backend.data?.available === false");
    expect(route).toContain('title="Organizer backend unavailable"');
    expect(route).toContain("backend.data?.error");
    expect(route).toContain("Retry backend check");
    expect(route).toContain("void backend.refetch()");
    expect(route).toContain('title="Organizer Tasks backend update required"');
  });

  it("keeps explicit read errors separate from empty task results", () => {
    expect(route).toContain('title="Edition context could not be resolved"');
    expect(route).toContain("Retry edition lookup");
    expect(route).toContain("void editionsQuery.refetch()");
    expect(route).toContain('title="Tasks could not be evaluated"');
    expect(route).toContain("Retry task evaluation");
    expect(route).toContain("void tasksQuery.refetch()");
    expect(route).toContain("tasksQuery.error ? (");
  });

  it("requires runtime readiness as well as declared Tasks capability before reading the projection", () => {
    expect(route).toContain("const backendReady = backend.data?.ready === true;");
    expect(route).toContain("backendReady &&");
    expect(route).toContain("tasksSupported &&");
    expect(route).toContain('title="Organizer backend not ready"');
    expect(route).toContain("Task evaluation and counts remain unavailable until it is ready.");
    expect(route).toContain("Recheck readiness");
    expect(route).toContain("void backend.refetch()");
  });

  it("does not leave stale edition filters visible after edition verification fails", () => {
    expect(route).toContain("editionsQuery.isSuccess && !editionsQuery.error");
    expect(route).toContain("selectOrganizerEdition(editions, editionId)");
    expect(route).toContain("const resolvedEditionId = editionId && edition ? edition.id :");
    expect(route).toContain('{edition ? (');
    expect(route).toContain('{edition && filter !== "resolved" ? (');
    expect(route).toContain('title="Edition context could not be resolved"');
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
