import { afterEach, describe, expect, it } from "vitest";

import {
  appUpdateSafety,
  clearAppUpdateBlocker,
  isOrganizerUpdateWorkspacePath,
  routeUpdateBlocker,
  setAppUpdateBlocker,
} from "@/lib/app-update-safety";

describe("installed app safe updates", () => {
  afterEach(() => {
    clearAppUpdateBlocker("test");
  });

  it("defers service-worker updates for every registry-critical participant route", () => {
    expect(routeUpdateBlocker("/confirmations")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/jury-voting")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/televoting")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/next-in-line")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/my-solaris/entry")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/my-solaris/entry/")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/integrity/report")?.id).toBe("focused-participation-task");
    expect(appUpdateSafety("/participate").safe).toBe(true);
    expect(appUpdateSafety("/my-solaris/activity").safe).toBe(true);
    expect(appUpdateSafety("/televoting/how-to-vote").safe).toBe(true);
    expect(appUpdateSafety("/televoting/results").safe).toBe(true);
  });

  it("supports dynamic blockers for critical mutations and direct interactions", () => {
    setAppUpdateBlocker("test", true, "Saving critical work.");
    expect(appUpdateSafety("/results").safe).toBe(false);
    expect(appUpdateSafety("/results").reason).toBe("Saving critical work.");
    clearAppUpdateBlocker("test");
    expect(appUpdateSafety("/results").safe).toBe(true);
  });

  it("defers updates across canonical and legacy Organizer workspaces", () => {
    expect(routeUpdateBlocker("/admin")?.id).toBe("organizer-workspace");
    expect(routeUpdateBlocker("/admin/action-center")?.id).toBe("organizer-workspace");
    expect(routeUpdateBlocker("/confirmations/admin")?.id).toBe("organizer-workspace");
    expect(routeUpdateBlocker("/confirmations/admin/review")?.id).toBe("organizer-workspace");
    expect(routeUpdateBlocker("/televoting/admin")?.id).toBe("organizer-workspace");
    expect(routeUpdateBlocker("/televoting/admin/control")?.id).toBe("organizer-workspace");
    expect(appUpdateSafety("/admin").safe).toBe(false);
  });

  it("uses exact Organizer route boundaries instead of lookalike prefixes", () => {
    expect(isOrganizerUpdateWorkspacePath("/admin")).toBe(true);
    expect(isOrganizerUpdateWorkspacePath("/admin/tasks")).toBe(true);
    expect(isOrganizerUpdateWorkspacePath("/administrator")).toBe(false);
    expect(isOrganizerUpdateWorkspacePath("/confirmations/administer")).toBe(false);
    expect(isOrganizerUpdateWorkspacePath("/televoting/administrator")).toBe(false);
  });

  it("gives overlapping Organizer routes operational ownership before participant classification", () => {
    expect(routeUpdateBlocker("/confirmations/admin")?.id).toBe("organizer-workspace");
    expect(routeUpdateBlocker("/televoting/admin")?.id).toBe("organizer-workspace");
    expect(routeUpdateBlocker("/confirmations")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/televoting")?.id).toBe("focused-participation-task");
  });
});
