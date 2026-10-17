import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import {
  appUpdateSafety,
  clearAppUpdateBlocker,
  routeUpdateBlocker,
  setAppUpdateBlocker,
} from "@/lib/app-update-safety";

describe("installed app safe updates", () => {
  afterEach(() => {
    clearAppUpdateBlocker("test");
  });

  it("defers service-worker updates for every canonical critical participant workflow", () => {
    for (const pathname of [
      "/confirmations",
      "/confirmations/edit/demo-token",
      "/jury-voting",
      "/televoting",
      "/next-in-line",
      "/my-solaris/entry",
      "/my-solaris/entry/",
      "/integrity/report/category",
      "/integrity/report/review",
    ]) {
      expect(routeUpdateBlocker(pathname)?.id, pathname).toBe("focused-participation-task");
    }

    for (const pathname of [
      "/participate",
      "/my-solaris/activity",
      "/integrity",
      "/televoting/results",
      "/televoting/how-to-vote",
    ]) {
      expect(appUpdateSafety(pathname).safe, pathname).toBe(true);
    }
  });

  it("derives critical route safety from the canonical screen registry rather than a second allowlist", () => {
    const source = readFileSync("src/lib/app-update-safety.ts", "utf8");
    expect(source).toContain('import { resolveSolarisAppScreen } from "@/lib/app-screen-registry"');
    expect(source).toContain("screen.behavior.criticalTask");
    expect(source).not.toContain("confirmations|jury-voting|televoting|next-in-line");
  });

  it("supports dynamic blockers for critical mutations outside route rules", () => {
    setAppUpdateBlocker("test", true, "Saving critical work.");
    expect(appUpdateSafety("/results").safe).toBe(false);
    expect(appUpdateSafety("/results").reason).toBe("Saving critical work.");
    clearAppUpdateBlocker("test");
    expect(appUpdateSafety("/results").safe).toBe(true);
  });

  it("keeps service-admin and Organizer workspaces on the Organizer blocker", () => {
    expect(routeUpdateBlocker("/admin/action-center")?.id).toBe("organizer-workspace");
    expect(routeUpdateBlocker("/confirmations/admin")?.id).toBe("organizer-workspace");
    expect(routeUpdateBlocker("/televoting/admin/rounds")?.id).toBe("organizer-workspace");
  });
});
