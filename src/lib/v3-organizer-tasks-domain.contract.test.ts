import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tasks = readFileSync("src/routes/_authenticated/admin/tasks.tsx", "utf8");

describe("V3 Organizer Tasks domain organization", () => {
  it("exposes the canonical operational domain filters", () => {
    for (const domain of [
      "participation",
      "entries",
      "jury",
      "televote",
      "integrity",
      "publication",
      "system",
    ]) {
      expect(tasks).toContain(`"${domain}"`);
    }
    expect(tasks).toContain('data-v3-organizer-tasks=""');
  });

  it("keeps domain filtering presentation-only over canonical task objects", () => {
    expect(tasks).toContain('const tasks = tasksQuery.data ?? []');
    expect(tasks).toContain('tasks.filter((task) => taskDomain(task) === domain)');
    expect(tasks).toContain("There is intentionally no generic “Mark resolved” button.");
    expect(tasks).not.toContain("integrations/supabase/client");
    expect(tasks).not.toContain(".from(");
  });

  it("does not fabricate the blocked/failed/expired task taxonomy before System exposes it", () => {
    expect(tasks).toContain("remain System-owned until the V3 task contract exposes them canonically");
    expect(tasks).not.toContain('task.state === "blocked"');
    expect(tasks).not.toContain('task.state === "failed"');
    expect(tasks).not.toContain('task.state === "expired"');
  });
});
