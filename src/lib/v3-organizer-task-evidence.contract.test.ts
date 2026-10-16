import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const tasks = readFileSync("src/routes/_authenticated/admin/tasks.tsx", "utf8");

describe("V3 Organizer Tasks evidence UI", () => {
  it("surfaces linked rule references without inventing client-side resolution authority", () => {
    expect(tasks).toContain("task.ruleReference.length");
    expect(tasks).toContain("task.ruleReference.join(\", \")");
    expect(tasks).toContain("Rules:");
    expect(tasks).not.toContain("Mark resolved");
  });

  it("explains which canonical predicate fields close the task", () => {
    expect(tasks).toContain("Object.keys(task.resolutionPredicate).map(humanize)");
    expect(tasks).toContain("Closes when:");
  });

  it("keeps Production as a first-class task filter domain", () => {
    expect(tasks).toContain('if (domain === "production") return "Production"');
  });
});
