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

  it("keeps backend task state authoritative and derives only overdue/actionable locally", () => {
    expect(adapter).toContain('if (task.state === "resolved") return "resolved";');
    expect(adapter).toContain('if (task.state === "waiting") return "waiting";');
    expect(adapter).toContain('if (Number.isFinite(dueMs) && dueMs <= nowMs) return "overdue";');
    expect(adapter).toContain('return "actionable";');
  });

  it("does not equate task priority with blocked workflow state", () => {
    expect(route).toContain("priority is severity, not workflow state");
    expect(route).not.toContain('task.priority === "critical") return "blocked"');
    expect(adapter).not.toContain('task.priority === "critical"');
  });

  it("fails visibly when blocked/failed evidence is unavailable instead of showing invented zeroes", () => {
    expect(route).toContain("classification is not available yet");
    expect(route).toContain("does not expose explicit blocked/failed evidence");
    expect(route).toContain('value == null ? "Unknown"');
  });

  it("keeps notification state separate from task truth", () => {
    expect(route).toContain("Reading a notification never completes a task");
    expect(route).toContain("There is intentionally no generic “Mark resolved” button.");
  });
});
