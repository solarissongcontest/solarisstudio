import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  getV3OrganizerTabDestination,
  readV3OrganizerNavigationState,
  rememberV3OrganizerLocation,
  resetV3OrganizerTabToRoot,
  updateV3OrganizerScrollPosition,
} from "./v3-organizer-navigation";
import {
  V3_ORGANIZER_TAB_ORDER,
  buildV3OrganizerControlGroups,
  v3OrganizerTabForPath,
  v3OrganizerTabRoot,
} from "./v3-organizer";

const moreSource = readFileSync("src/routes/_authenticated/admin/more.tsx", "utf8");

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("V3 Organizer information architecture", () => {
  it("keeps the canonical five-area operational model in order", () => {
    expect(V3_ORGANIZER_TAB_ORDER).toEqual([
      "overview",
      "tasks",
      "control",
      "live",
      "more",
    ]);
    expect(V3_ORGANIZER_TAB_ORDER.map(v3OrganizerTabRoot)).toEqual([
      "/admin/operations",
      "/admin/tasks",
      "/admin/control",
      "/admin/control-room",
      "/admin/more",
    ]);
  });

  it("classifies deep operational routes under their canonical V3 owner", () => {
    expect(v3OrganizerTabForPath("/admin/operations")).toBe("overview");
    expect(v3OrganizerTabForPath("/admin/inbox")).toBe("tasks");
    expect(v3OrganizerTabForPath("/admin/entries/ssc-22")).toBe("control");
    expect(v3OrganizerTabForPath("/admin/participant-status/ssc-22")).toBe("control");
    expect(v3OrganizerTabForPath("/confirmations/admin/responses")).toBe("control");
    expect(v3OrganizerTabForPath("/televoting/admin/results")).toBe("control");
    expect(v3OrganizerTabForPath("/admin/control-room")).toBe("live");
    expect(v3OrganizerTabForPath("/admin/broadcast-rundown")).toBe("live");
    expect(v3OrganizerTabForPath("/admin/results-reveal")).toBe("live");
    expect(v3OrganizerTabForPath("/admin/incidents")).toBe("live");
    expect(v3OrganizerTabForPath("/admin/edition-simulator")).toBe("more");
    expect(v3OrganizerTabForPath("/admin/time-machine")).toBe("more");
    expect(v3OrganizerTabForPath("/admin/voting-lab")).toBe("more");
    expect(v3OrganizerTabForPath("/admin/storytelling")).toBe("more");
    expect(v3OrganizerTabForPath("/admin/system-operations")).toBe("more");
    expect(v3OrganizerTabForPath("/admin/access-permissions")).toBe("more");
  });

  it("groups Control by canonical domains, separates Contest workspaces, and fails closed without edition context", () => {
    const withoutEdition = buildV3OrganizerControlGroups(null);
    expect(withoutEdition.map((group) => group.key)).toEqual([
      "delegations",
      "contest",
      "voting",
      "results",
      "communications",
      "production",
    ]);
    expect(withoutEdition.map((group) => group.label)).toEqual([
      "Delegations",
      "Contest",
      "Voting",
      "Results & publication",
      "Communications",
      "Production",
    ]);
    expect(withoutEdition.flatMap((group) => group.items).every((item) => item.href === null)).toBe(true);

    const scoped = buildV3OrganizerControlGroups("ssc-22");
    const scopedItems = scoped.flatMap((group) => group.items);
    expect(scopedItems.every((item) => typeof item.href === "string" && item.href.length > 0)).toBe(true);
    expect(scopedItems.find((item) => item.key === "entry-review")?.href).toBe(
      "/confirmations/admin/responses",
    );
    expect(scopedItems.find((item) => item.key === "running-order")?.href).toBe(
      "/admin/entries/ssc-22",
    );
    expect(scopedItems.find((item) => item.key === "participants")?.href).toBe(
      "/admin/participant-status/ssc-22",
    );
    expect(scopedItems.find((item) => item.key === "progression")?.href).toBe(
      "/admin/lineup-sync/ssc-22",
    );
    expect(scopedItems.find((item) => item.key === "jury")?.href).toBe(
      "/admin/jury/ssc-22",
    );
    expect(scopedItems.find((item) => item.key === "publication")?.href).toBe(
      "/admin/publication/ssc-22",
    );
    expect(scopedItems.find((item) => item.key === "broadcast")?.href).toBe(
      "/admin/design/ssc-22",
    );
    expect(scopedItems.find((item) => item.key === "theme")?.href).toBe(
      "/admin/edition-theme/ssc-22",
    );
    expect(scopedItems.find((item) => item.key === "delivery-issues")).toBeUndefined();
    expect(scopedItems.find((item) => item.key === "rundown")).toBeUndefined();
    expect(scopedItems.find((item) => item.key === "reveal")).toBeUndefined();
  });

  it("surfaces the canonical Governance toolset directly in More", () => {
    expect(moreSource).toContain('title: "Trust & Governance"');
    expect(moreSource).toContain('to: "/admin/integrity-investigations"');
    expect(moreSource).toContain('to: "/admin/integrity-preclearance"');
    expect(moreSource).toContain('to: "/admin/integrity-appeals"');
    expect(moreSource).toContain('to: "/admin/integrity-evidence"');
    expect(moreSource).toContain('to: "/admin/integrity-disclosure"');
    expect(moreSource).toContain('to: "/admin/integrity-identity"');
    expect(moreSource).toContain('to: "/admin/rules-manager"');
    expect(moreSource).toContain('to: "/admin/rule-interpretations"');
  });

  it("surfaces Engagement and the four canonical specialist labs directly in More", () => {
    expect(moreSource).toContain('title: "Engagement"');
    expect(moreSource).toContain('to: "/admin/storytelling"');
    expect(moreSource).toContain('to: "/admin/predictions"');
    expect(moreSource).toContain('to: "/admin/fantasy"');
    expect(moreSource).toContain('to: "/admin/community-moderation"');
    expect(moreSource).toContain('to: "/admin/anniversary"');
    expect(moreSource).toContain('title: "Specialist labs"');
    expect(moreSource).toContain('to: "/admin/edition-simulator"');
    expect(moreSource).toContain('to: "/admin/time-machine"');
    expect(moreSource).toContain('to: "/admin/voting-lab"');
    expect(moreSource).toContain('to: "/admin/command-assistant"');
  });
});

describe("V3 Organizer tab continuity", () => {
  it("remembers independent deep destinations and scroll positions per V3 tab", () => {
    const storage = new MemoryStorage();
    const scope = "edition-22";

    rememberV3OrganizerLocation("/admin/entries/ssc-22", "?show=sf1", 420, storage, scope);
    rememberV3OrganizerLocation("/admin/control-room", "", 88, storage, scope);
    updateV3OrganizerScrollPosition("/admin/entries/ssc-22", "?show=sf1", 512, storage, scope);

    expect(getV3OrganizerTabDestination("control", storage, scope)).toMatchObject({
      pathname: "/admin/entries/ssc-22",
      searchStr: "?show=sf1",
      scrollY: 512,
    });
    expect(getV3OrganizerTabDestination("live", storage, scope)).toMatchObject({
      pathname: "/admin/control-room",
      scrollY: 88,
    });
    expect(readV3OrganizerNavigationState(storage, scope).activeTab).toBe("live");
  });

  it("resets only the active tab to its canonical root", () => {
    const storage = new MemoryStorage();
    const scope = "edition-22";
    rememberV3OrganizerLocation("/admin/entries/ssc-22", "", 300, storage, scope);
    rememberV3OrganizerLocation("/admin/control-room", "", 100, storage, scope);

    expect(resetV3OrganizerTabToRoot("control", storage, scope).pathname).toBe("/admin/control");
    expect(getV3OrganizerTabDestination("control", storage, scope).pathname).toBe("/admin/control");
    expect(getV3OrganizerTabDestination("live", storage, scope).pathname).toBe("/admin/control-room");
  });

  it("never reopens a deep route remembered for a different edition", () => {
    const storage = new MemoryStorage();
    rememberV3OrganizerLocation("/admin/entries/ssc-21", "", 240, storage, "edition-21");

    expect(getV3OrganizerTabDestination("control", storage, "edition-21").pathname).toBe(
      "/admin/entries/ssc-21",
    );
    expect(getV3OrganizerTabDestination("control", storage, "edition-22").pathname).toBe(
      "/admin/control",
    );
  });
});
