import { describe, expect, it } from "vitest";

import {
  consumeV3OrganizerNavigationRestore,
  getV3OrganizerTabDestination,
  markV3OrganizerNavigationRestore,
  readV3OrganizerNavigationState,
  rememberV3OrganizerLocation,
} from "@/lib/v3-organizer-navigation";
import {
  consumeV3PublicNavigationRestore,
  markV3PublicNavigationRestore,
} from "@/lib/v3-public-navigation";

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

const visitedAt = "2026-10-18T00:00:00.000Z";

describe("V3 one-shot navigation restore intents", () => {
  it("consumes stale public restore intent on the first mismatched route", () => {
    const storage = new MemoryStorage();
    markV3PublicNavigationRestore(
      { pathname: "/explore", searchStr: "?view=all", scrollY: 420, visitedAt },
      storage,
      "viewer-1",
    );

    expect(
      consumeV3PublicNavigationRestore("/results", "", storage, "viewer-1"),
    ).toBeNull();
    expect(storage.length).toBe(0);
    expect(
      consumeV3PublicNavigationRestore("/explore", "?view=all", storage, "viewer-1"),
    ).toBeNull();
  });

  it("drops malformed public restore payloads instead of retrying them forever", () => {
    const storage = new MemoryStorage();
    markV3PublicNavigationRestore(
      { pathname: "/results", searchStr: "", scrollY: 180, visitedAt },
      storage,
      "viewer-1",
    );
    const key = storage.key(0);
    expect(key).not.toBeNull();
    storage.setItem(key!, "{not-json");

    expect(consumeV3PublicNavigationRestore("/results", "", storage, "viewer-1")).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("gives Organizer the same one-shot mismatch and malformed-payload semantics", () => {
    const storage = new MemoryStorage();
    markV3OrganizerNavigationRestore(
      { pathname: "/admin/control-room", searchStr: "", scrollY: 96, visitedAt },
      storage,
      "edition-22",
    );

    expect(
      consumeV3OrganizerNavigationRestore("/admin/tasks", "", storage, "edition-22"),
    ).toBeNull();
    expect(storage.length).toBe(0);

    markV3OrganizerNavigationRestore(
      { pathname: "/admin/control-room", searchStr: "", scrollY: 96, visitedAt },
      storage,
      "edition-22",
    );
    const key = storage.key(0);
    expect(key).not.toBeNull();
    storage.setItem(key!, "not-json");

    expect(
      consumeV3OrganizerNavigationRestore(
        "/admin/control-room",
        "",
        storage,
        "edition-22",
      ),
    ).toBeNull();
    expect(storage.length).toBe(0);
  });

  it("rejects future Organizer memory versions instead of interpreting an unknown schema", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "solaris:organizer-v3-navigation:v1:edition-22",
      JSON.stringify({
        version: 2,
        activeTab: "control",
        tabs: {
          control: {
            current: {
              pathname: "/admin/entries/ssc-22",
              searchStr: "",
              scrollY: 999,
              visitedAt,
            },
            history: [],
          },
        },
      }),
    );

    expect(readV3OrganizerNavigationState(storage, "edition-22")).toEqual({
      version: 1,
      activeTab: "overview",
      tabs: {},
    });
    expect(getV3OrganizerTabDestination("control", storage, "edition-22").pathname).toBe(
      "/admin/control",
    );
  });

  it("does not treat lookalike Organizer prefixes as memory-authoritative routes", () => {
    const storage = new MemoryStorage();
    rememberV3OrganizerLocation(
      "/administrator/definitely-not-admin",
      "",
      300,
      storage,
      "edition-22",
    );
    rememberV3OrganizerLocation(
      "/confirmations/administrator",
      "",
      300,
      storage,
      "edition-22",
    );

    expect(storage.length).toBe(0);
    expect(getV3OrganizerTabDestination("more", storage, "edition-22").pathname).toBe(
      "/admin/more",
    );
  });
});
