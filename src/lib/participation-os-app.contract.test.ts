import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Participation OS installed-app integration", () => {
  it("projects the authoritative HOD workspace into the shared app task center", () => {
    const tasks = source("src/components/mysolaris/modules/MySolarisTasksModule.tsx");
    const engine = source("src/lib/participation-os.ts");
    expect(tasks).toContain("tasksFromHodWorkspace(snapshot)");
    expect(tasks).toContain("<AppTaskCenter");
    expect(tasks).toContain("isAppMode");
    expect(engine).toContain("Studio2HodWorkspaceSnapshot");
    expect(engine).toContain("server-authoritative");
  });
});
