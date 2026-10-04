import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Solaris V6 notifications and Live Mode phase", () => {
  it("keeps push as optional delivery while canonical work remains available in-app", () => {
    const notifications = source("src/lib/app-notifications.ts");
    const settings = source(
      "src/components/mysolaris/MySolarisNotificationsPanel.tsx",
    );
    const authority = source("src/lib/solaris-v6-runtime-authority.ts");

    expect(notifications).toContain("requiredWorkAvailable: true");
    expect(settings).toContain('to="/my-solaris/tasks"');
    expect(settings).toContain('to="/my-solaris/notices"');
    expect(settings).toContain('data-solaris-required-work-fallback=""');
    expect(authority).toContain('kind: "projection-only"');
    expect(authority).toContain(
      "Push is delivery infrastructure. It never becomes task",
    );
  });

  it("rechecks canonical task state before high-risk Organizer push delivery", () => {
    const dispatcher = source(
      "supabase/functions/solaris-push-dispatch/index.ts",
    );
    const notificationContract = source(
      "src/lib/solaris-v6-notification-authority.contract.test.ts",
    );

    expect(dispatcher).toContain('"solaris_prepare_organizer_task_delivery"');
    expect(dispatcher).toContain('delivery.category === "organizer_tasks"');
    expect(dispatcher).toContain('task.state === "resolved" || task.resolved_at');
    expect(notificationContract).toContain(
      "notification read state separate from domain-owned task resolution",
    );
  });

  it("derives Show Mode from canonical show, voting and publication state", () => {
    const showMode = source("src/routes/show-mode/index.tsx");
    const resolver = source("src/lib/show-mode.ts");

    expect(showMode).toContain('from("rounds")');
    expect(showMode).toContain('.eq("id", linkedRoundId!)');
    expect(showMode).toContain("resolveShowCompanionState");
    expect(resolver).toContain("resolveShowPublication(show)");
    expect(resolver).toContain('televoteRound?.status === "open"');
    expect(showMode).toContain("Solaris does not mark a current performer automatically.");
  });

  it("keeps Live Mode progressive and cross-links public, Organizer and diagnostics through the registry", () => {
    const showMode = source("src/routes/show-mode/index.tsx");
    const rundown = source(
      "src/routes/_authenticated/admin/broadcast-rundown.tsx",
    );

    expect(showMode).toContain('wakeLock.request("screen")');
    expect(showMode).toContain("wakeLockSupported");
    expect(showMode).toContain("preferences.keepScreenAwake");

    expect(rundown).toContain("<SolarisSurfaceSwitch");
    expect(rundown).toContain('featureId: "live-show"');
    expect(rundown).toContain(
      'perspectives: ["public", "organizer", "diagnostic"]',
    );
    expect(rundown).toContain(
      "Rehearsal mode never calls a production mutation",
    );
  });
});
