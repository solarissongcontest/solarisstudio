import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Participation OS app experience", () => {
  it("uses the shared edition timeline in installed MySolaris tasks", () => {
    const tasks = source("src/components/mysolaris/modules/MySolarisTasksModule.tsx");
    expect(tasks).toContain("tasksFromHodWorkspace(snapshot)");
    expect(tasks).toContain("<AppParticipationTimeline");
    expect(tasks).toContain("isAppMode");
  });

  it("explains adaptive task states rather than presenting a black box", () => {
    const timeline = source("src/components/app/AppParticipationTimeline.tsx");
    expect(timeline).toContain("Why am I seeing this?");
    expect(timeline).toContain("task.why");
    expect(timeline).toContain("Continue");
  });

  it("keeps signed-in Participate personal while preserving public service discovery", () => {
    const participate = source("src/routes/participate/index.tsx");
    expect(participate).toContain("buildParticipationTasks");
    expect(participate).toContain("confirmationAccessQuery");
    expect(participate).toContain("<AppParticipationTimeline");
    expect(participate).toContain("<PublicSecondaryLinks");
  });
});
