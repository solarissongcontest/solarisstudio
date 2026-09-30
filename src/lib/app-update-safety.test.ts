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

  it("defers service-worker updates during participation workflows", () => {
    expect(routeUpdateBlocker("/confirmations")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/jury-voting")?.id).toBe("focused-participation-task");
    expect(routeUpdateBlocker("/televoting")?.id).toBe("focused-participation-task");
    expect(appUpdateSafety("/participate").safe).toBe(true);
  });

  it("supports dynamic blockers for critical mutations outside route rules", () => {
    setAppUpdateBlocker("test", true, "Saving critical work.");
    expect(appUpdateSafety("/results").safe).toBe(false);
    expect(appUpdateSafety("/results").reason).toBe("Saving critical work.");
    clearAppUpdateBlocker("test");
    expect(appUpdateSafety("/results").safe).toBe(true);
  });

  it("defers updates inside organizer workspaces", () => {
    expect(appUpdateSafety("/admin/action-center").safe).toBe(false);
  });
});
