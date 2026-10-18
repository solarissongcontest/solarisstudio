import { describe, expect, it } from "vitest";

import {
  APP_NAVIGATION_STORAGE_KEY,
  consumeAppNavigationRestore,
  getAppLaunchDestination,
  markAppNavigationRestore,
  readAppNavigationState,
  rememberAppLocation,
} from "@/lib/app-navigation";

class MemoryStorage implements Storage {
  #values = new Map<string, string>();
  get length() {
    return this.#values.size;
  }
  clear() {
    this.#values.clear();
  }
  getItem(key: string) {
    return this.#values.get(key) ?? null;
  }
  key(index: number) {
    return [...this.#values.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.#values.delete(key);
  }
  setItem(key: string, value: string) {
    this.#values.set(key, value);
  }
}

const RESTORE_INTENT_KEY = "solaris:app-navigation-restore:v1";

describe("installed app navigation recovery safety", () => {
  it("cold-launches critical tasks at their canonical tab root instead of reviving the task", () => {
    for (const pathname of [
      "/confirmations",
      "/jury-voting",
      "/televoting",
      "/next-in-line",
      "/my-solaris/entry",
      "/integrity/report",
    ]) {
      const storage = new MemoryStorage();
      rememberAppLocation("/participate", "", 0, storage);
      rememberAppLocation(pathname, "", 420, storage);

      expect(getAppLaunchDestination(true, storage), pathname).toMatchObject({
        pathname: "/participate",
        searchStr: "",
        scrollY: 0,
      });
    }
  });

  it("still restores ordinary non-critical MySolaris work", () => {
    const storage = new MemoryStorage();
    rememberAppLocation("/my-solaris/activity", "?filter=recent", 360, storage);

    expect(getAppLaunchDestination(true, storage)).toMatchObject({
      pathname: "/my-solaris/activity",
      searchStr: "?filter=recent",
      scrollY: 360,
    });
  });

  it("consumes mismatched restore intent exactly once", () => {
    const storage = new MemoryStorage();
    markAppNavigationRestore(
      {
        pathname: "/countries/OL",
        searchStr: "",
        scrollY: 640,
        visitedAt: new Date().toISOString(),
      },
      storage,
    );

    expect(consumeAppNavigationRestore("/results", "", storage)).toBeNull();
    expect(storage.getItem(RESTORE_INTENT_KEY)).toBeNull();
    expect(consumeAppNavigationRestore("/countries/OL", "", storage)).toBeNull();
  });

  it("consumes malformed restore intent instead of leaving it for a later route", () => {
    const storage = new MemoryStorage();
    storage.setItem(RESTORE_INTENT_KEY, "{not-json");

    expect(consumeAppNavigationRestore("/countries/OL", "", storage)).toBeNull();
    expect(storage.getItem(RESTORE_INTENT_KEY)).toBeNull();
  });

  it("rejects unknown future navigation-state versions", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      APP_NAVIGATION_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        activeTab: "results",
        tabs: {
          results: {
            current: {
              pathname: "/results",
              searchStr: "",
              scrollY: 100,
              visitedAt: new Date().toISOString(),
            },
            history: [],
          },
        },
      }),
    );

    expect(readAppNavigationState(storage)).toEqual({
      version: 1,
      activeTab: "home",
      tabs: {},
    });
  });

  it("rejects backslash paths from persisted navigation memory", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      APP_NAVIGATION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeTab: "explore",
        tabs: {
          explore: {
            current: {
              pathname: "/\\evil.example/path",
              searchStr: "",
              scrollY: 0,
              visitedAt: new Date().toISOString(),
            },
            history: [
              {
                pathname: "/\\evil.example/path",
                searchStr: "",
                scrollY: 0,
                visitedAt: new Date().toISOString(),
              },
            ],
          },
        },
      }),
    );

    expect(readAppNavigationState(storage).tabs.explore).toBeUndefined();
  });
});
