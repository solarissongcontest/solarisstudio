import { describe, expect, it } from "vitest";

import {
  ORGANIZER_V6_ROOT_SCREENS,
  organizerV6RootForPath,
  resolveOrganizerV6Screen,
} from "@/lib/organizer-v6-screen-registry";

describe("Solaris V6 Organizer screen registry", () => {
  it("keeps exactly five stable organizer roots", () => {
    expect(Object.keys(ORGANIZER_V6_ROOT_SCREENS)).toEqual([
      "command",
      "participants",
      "entries",
      "voting",
      "more",
    ]);
  });

  it("maps operational routes to one deliberate root", () => {
    expect(organizerV6RootForPath("/admin/operations")).toBe("command");
    expect(organizerV6RootForPath("/confirmations/admin")).toBe("participants");
    expect(organizerV6RootForPath("/admin/entries/ssc-22")).toBe("entries");
    expect(organizerV6RootForPath("/admin/jury/ssc-22")).toBe("voting");
    expect(organizerV6RootForPath("/admin/rules-manager")).toBe("more");
  });

  it("derives detail chrome from the same registry instead of route-local guesses", () => {
    const detail = resolveOrganizerV6Screen("/admin/jury/ssc-22");
    expect(detail.perspective).toBe("organizer");
    expect(detail.root).toBe("voting");
    expect(detail.toolbar).toBe("back");
    expect(detail.tabbar).toBe("compact");
  });
});
