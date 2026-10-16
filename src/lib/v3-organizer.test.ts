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

  it("classifies deep operational routes under their V3 owner", () => {
    expect(v3OrganizerTabForPath("/admin/operations")).toBe("overview");
    expect(v3OrganizerTabForPath("/admin/inbox")).toBe("tasks");
    expect(v3OrganizerTabForPath("/admin/entries/ssc-22")).toBe("control");
    expect(v3OrganizerTabForPath("/confirmations/admin/responses")).toBe("control");
    expect(v3OrganizerTabForPath("/televoting/admin/results")).toBe("control");
    expect(v3OrganizerTabForPath("/admin/control-room")).toBe("live");
    expect(v3OrganizerTabForPath("/admin/broadcast-rundown")).toBe("live");
    expect(v3OrganizerTabForPath("/admin/access-permissions")).toBe("more");
  });

  it("groups Control by canonical operational domains, separates Entry Review from Running Order, and locks edition-scoped routes without context", () => {
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
    const unscopedItems = withoutEdition.flatMap((group) => group.items);
    expect(unscopedItems.find((item) => item.key === "entry-review")?.href).toBe(
      "/confirmations/admin/responses",
    );
    expect(unscopedItems.find((item) => item.key === "running-order")?.href).toBeNull();
    expect(unscopedItems.find((item) => item.key === "confirmations")?.href).toBe(
      "/confirmations/admin",
    );
    expect(unscopedItems.find((item) => item.key === "publication")?.href).toBeNull();

    const scoped = buildV3OrganizerControlGroups("ssc-22");
    const scopedItems = scoped.flatMap((group) => group.items);
    expect(scopedItems.find((item) => item.key === "entry-review")?.href).toBe(
      "/confirmations/admin/responses",
    );
    expect(scopedItems.find((item) => item.key === "running-order")?.href).toBe(
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
