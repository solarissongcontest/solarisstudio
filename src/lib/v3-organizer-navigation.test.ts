import { describe, expect, it } from "vitest";

import {
  consumeV3OrganizerNavigationRestore,
  getV3OrganizerTabDestination,
  markV3OrganizerNavigationRestore,
  readV3OrganizerNavigationState,
  rememberV3OrganizerLocation,
} from "@/lib/v3-organizer-navigation";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe("V3 Organizer navigation memory hardening", () => {
  it("fails closed on unknown future persisted state versions", () => {
    const storage = memoryStorage();
    storage.setItem(
      "solaris:organizer-v3-navigation:v1:ssc22",
      JSON.stringify({
        version: 999,
        activeTab: "live",
        tabs: {
          live: {
            current: {
              pathname: "/admin/live",
              searchStr: "",
              scrollY: 180,
              visitedAt: new Date().toISOString(),
            },
            history: [],
          },
        },
      }),
    );

    expect(readV3OrganizerNavigationState(storage, "ssc22")).toEqual({
      version: 1,
      activeTab: "overview",
      tabs: {},
    });
  });

  it("consumes mismatched restore intents once so redirects cannot arm a later restore", () => {
    const session = memoryStorage();
    markV3OrganizerNavigationRestore(
      {
        pathname: "/admin/tasks",
        searchStr: "",
        scrollY: 444,
        visitedAt: new Date().toISOString(),
      },
      session,
      "ssc22",
    );

    expect(
      consumeV3OrganizerNavigationRestore("/admin/operations", "", session, "ssc22"),
    ).toBeNull();
    expect(
      consumeV3OrganizerNavigationRestore("/admin/tasks", "", session, "ssc22"),
    ).toBeNull();
  });

  it("consumes malformed restore payloads instead of retrying them forever", () => {
    const session = memoryStorage();
    session.setItem("solaris:organizer-v3-navigation-restore:v1:ssc22", "{not-json");

    expect(
      consumeV3OrganizerNavigationRestore("/admin/tasks", "", session, "ssc22"),
    ).toBeNull();
    expect(session.getItem("solaris:organizer-v3-navigation-restore:v1:ssc22")).toBeNull();
  });

  it("rejects lookalike route prefixes from tab memory", () => {
    const storage = memoryStorage();
    rememberV3OrganizerLocation("/administrator", "", 100, storage, "ssc22");
    rememberV3OrganizerLocation("/confirmations/administrator", "", 100, storage, "ssc22");

    expect(readV3OrganizerNavigationState(storage, "ssc22").tabs).toEqual({});
    expect(getV3OrganizerTabDestination("overview", storage, "ssc22").pathname).toBe(
      "/admin/operations",
    );
  });
});
