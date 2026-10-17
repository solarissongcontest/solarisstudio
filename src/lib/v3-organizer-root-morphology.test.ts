import { describe, expect, it } from "vitest";

import {
  isV3OrganizerRootPath,
  resolveV3OrganizerTabbarMode,
} from "@/lib/v3-organizer-navigation-policy";
import {
  V3_ORGANIZER_TAB_ORDER,
  v3OrganizerTabRoot,
} from "@/lib/v3-organizer";

describe("V3 Organizer root navigation morphology", () => {
  it("treats every canonical V3 root as a full root-navigation surface", () => {
    for (const tab of V3_ORGANIZER_TAB_ORDER) {
      const root = v3OrganizerTabRoot(tab);
      expect(isV3OrganizerRootPath(root)).toBe(true);
      expect(isV3OrganizerRootPath(`${root}/`)).toBe(true);
      expect(resolveV3OrganizerTabbarMode(root, "compact")).toBe("full");
    }
  });

  it("does not let legacy V6 workspace classification shrink canonical Tasks, Control or Live", () => {
    expect(resolveV3OrganizerTabbarMode("/admin/tasks", "compact")).toBe("full");
    expect(resolveV3OrganizerTabbarMode("/admin/control", "compact")).toBe("full");
    expect(resolveV3OrganizerTabbarMode("/admin/control-room", "compact")).toBe("full");
  });

  it("preserves inherited compact/hidden policy for non-root workspaces", () => {
    expect(resolveV3OrganizerTabbarMode("/admin/tasks/123", "compact")).toBe("compact");
    expect(resolveV3OrganizerTabbarMode("/admin/incidents/123", "hidden")).toBe("hidden");
    expect(isV3OrganizerRootPath("/admin/control-room/incident-1")).toBe(false);
  });
});
