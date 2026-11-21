import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tasks = readFileSync("src/routes/_authenticated/admin/tasks.tsx", "utf8");
const css = readFileSync("src/styles/v3-organizer-tasks-editorial.css", "utf8");

describe("Organizer Tasks mobile status summary", () => {
  it("keeps every canonical operational class in the same summary", () => {
    expect(tasks).toContain('className="v3-organizer-task-metrics');
    for (const label of ["Actionable", "Blocked", "Waiting", "Failed", "Overdue"]) {
      expect(tasks).toContain('<Metric label="' + label + '"');
    }
    expect(tasks).toContain('aria-label="Task status summary"');
    expect(tasks).toContain("tabIndex={0}");
  });

  it("uses a single mobile scroll strip, retaining the desktop grid", () => {
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("overscroll-behavior-x: contain");
    expect(tasks).toContain("xl:grid-cols-5");
    expect(css).not.toContain("display: none");
  });

  it("does not change the server classification, polling or task permission gates", () => {
    expect(tasks).toContain("completeOperationalEvidence");
    expect(tasks).toContain("taskReadPermitted");
    expect(tasks).toContain("hasCompleteOrganizerTaskOperationalEvidence");
    expect(tasks).toContain("There is intentionally no generic “Mark resolved” button.");
  });
});
