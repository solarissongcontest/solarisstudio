import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 Organizer mobile phase", () => {
  it("uses one canonical Organizer mobile shell with five remembered destinations", () => {
    const shell = source("src/components/admin/AdminShell.tsx");
    const frame = source("src/components/admin/AdminFrame.tsx");
    const chrome = source("src/components/admin/OrganizerV6MobileChrome.tsx");
    const navigation = source("src/lib/admin-app-navigation.ts");

    expect(shell).toContain("<OrganizerV6MobileChrome />");
    expect(frame).not.toContain("OrganizerV6TabBar");
    for (const id of ["home", "edition", "tasks", "delegations", "more"]) {
      expect(chrome).toContain(`id: "${id}"`);
    }
    expect(chrome).toContain("consumeAdminNavigationRestore");
    expect(chrome).toContain("useOrganizerTaskCountV5");
    expect(navigation).toContain("solaris:organizer-navigation:v1");
  });

  it("does not call or fake the canonical Tasks badge before backend compatibility is proven", () => {
    const chrome = source("src/components/admin/OrganizerV6MobileChrome.tsx");

    expect(chrome).toContain("useOrganisationBackendContract");
    expect(chrome).toContain("tasksSupported");
    expect(chrome).toContain("useOrganizerTaskCountV5(");
    expect(chrome).toContain("tasksSupported,");
    expect(chrome).toContain("taskCount.isError");
    expect(chrome).toContain(
      'badge: item.id === "tasks" ? unresolvedTaskCount : undefined',
    );
    expect(chrome).not.toContain("data: unresolvedTaskCount = 0");
  });

  it("uses the V6 screen and interaction contracts for Organizer navigation", () => {
    const chrome = source("src/components/admin/OrganizerV6MobileChrome.tsx");
    const tabbar = source("src/components/admin/OrganizerV6TabBar.tsx");

    expect(chrome).toContain("resolveOrganizerV6Screen");
    expect(chrome).toContain("runAppViewTransition");
    expect(tabbar).toContain("useScrollResponsiveBar");
    expect(tabbar).toContain("resolveElasticDrag");
    expect(tabbar).toContain("useSolarisPressHold");
    expect(tabbar).toContain("data-mode={mode}");
  });

  it("consumes V6 interaction primitives in real Organizer workflows", () => {
    const tasks = source("src/routes/_authenticated/admin/tasks.tsx");
    const inbox = source("src/routes/_authenticated/admin/inbox.tsx");
    const broadcast = source(
      "src/routes/_authenticated/admin/broadcast-rundown.tsx",
    );

    expect(tasks).toContain("SolarisMorphingSelection");
    expect(inbox).toContain("SolarisSwipeActionRow");
    expect(broadcast).toContain("SolarisReorderableList");
  });

  it("inherits V5 functional breadth instead of replacing it with a second Organizer product", () => {
    const matrix = source("docs/organisation-os-v5/completion-matrix.yml");
    const v6 = source("docs/solaris-v6/completion-matrix.yml");

    expect(matrix).toContain("source_completion_requirements: 39");
    expect(matrix).toContain("phone_exam_steps: 42");
    expect(matrix).toContain("mandatory_failure_cases: 17");
    expect(v6).toContain("docs/organisation-os-v5/completion-matrix.yml");
  });
});
