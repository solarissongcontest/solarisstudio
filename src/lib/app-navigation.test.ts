import { describe, expect, it } from "vitest";

import {
  appEntryHref,
  APP_NAVIGATION_STORAGE_KEY,
  appTabForLocation,
  getAppLaunchDestination,
  getAppLaunchDestinationFromSnapshot,
  getAppTabDestination,
  peekAppBackTarget,
  popAppBackTarget,
  readAppNavigationState,
  rememberAppLocation,
  resetAppTabToRoot,
  updateAppScrollPosition,
} from "@/lib/app-navigation";
import { APP_LAUNCH_TRANSACTION_KEY } from "@/lib/app-launch-lifecycle";

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

describe("installed app navigation state", () => {
  it("remembers independent destinations for each primary tab", () => {
    const storage = new MemoryStorage();

    rememberAppLocation("/explore", "", 0, storage);
    rememberAppLocation("/countries", "", 180, storage);
    rememberAppLocation("/countries/OL", "", 860, storage);
    rememberAppLocation("/results", "", 0, storage);
    rememberAppLocation("/scorecharts", "?show=grand-final", 420, storage);

    expect(appEntryHref(getAppTabDestination("explore", true, storage))).toBe("/countries/OL");
    expect(appEntryHref(getAppTabDestination("results", true, storage))).toBe(
      "/scorecharts?show=grand-final",
    );
  });

  it("walks backward inside the current tab without crossing to another tab", () => {
    const storage = new MemoryStorage();

    rememberAppLocation("/explore", "", 0, storage);
    rememberAppLocation("/countries", "", 240, storage);
    rememberAppLocation("/countries/OL", "", 910, storage);
    rememberAppLocation("/results", "", 0, storage);

    expect(peekAppBackTarget("/countries/OL", "", storage)?.pathname).toBe("/countries");
    expect(popAppBackTarget("/countries/OL", "", storage)?.pathname).toBe("/countries");
    expect(getAppTabDestination("explore", true, storage).pathname).toBe("/countries");
    expect(getAppTabDestination("results", true, storage).pathname).toBe("/results");
  });

  it("restores and updates scroll for the remembered screen", () => {
    const storage = new MemoryStorage();

    rememberAppLocation("/countries/OL", "", 120, storage);
    updateAppScrollPosition("/countries/OL", "", 1337, storage);

    expect(getAppTabDestination("explore", true, storage).scrollY).toBe(1337);
  });

  it("isolates scroll offsets by URL instead of copying a previous page's position", () => {
    const storage = new MemoryStorage();

    rememberAppLocation("/countries/OL", "", 980, storage);
    rememberAppLocation("/countries/AO", "", undefined, storage);
    expect(getAppTabDestination("explore", true, storage).scrollY).toBe(0);

    rememberAppLocation("/countries/OL", "", undefined, storage);
    expect(getAppTabDestination("explore", true, storage).scrollY).toBe(980);

    rememberAppLocation("/countries/OL", "?section=history", undefined, storage);
    expect(getAppTabDestination("explore", true, storage).scrollY).toBe(0);
  });

  it("resets an active tab to its root without erasing other tab state", () => {
    const storage = new MemoryStorage();

    rememberAppLocation("/countries/OL", "", 900, storage);
    rememberAppLocation("/scorecharts", "", 300, storage);
    const root = resetAppTabToRoot("explore", true, storage);

    expect(root.pathname).toBe("/explore");
    expect(getAppTabDestination("explore", true, storage).pathname).toBe("/explore");
    expect(getAppTabDestination("results", true, storage).pathname).toBe("/scorecharts");
  });

  it("does not restore authenticated Me routes to signed-out users", () => {
    const storage = new MemoryStorage();

    rememberAppLocation("/my-solaris/account", "", 0, storage);

    expect(getAppTabDestination("me", false, storage).pathname).toBe("/auth");
    expect(getAppTabDestination("me", true, storage).pathname).toBe("/my-solaris/account");
  });

  it("sanitizes malformed persisted state instead of trusting it", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "solaris:app-navigation:v1",
      JSON.stringify({
        version: 1,
        activeTab: "explore",
        tabs: {
          explore: {
            current: { pathname: "//evil.example", searchStr: "", scrollY: 0 },
            history: [{ pathname: "//evil.example", searchStr: "", scrollY: 0 }],
          },
        },
      }),
    );

    const state = readAppNavigationState(storage);
    expect(state.tabs.explore).toBeUndefined();
  });
  it("restores the active safe screen on a true app cold launch", () => {
    const storage = new MemoryStorage();
    rememberAppLocation("/explore", "", 0, storage);
    rememberAppLocation("/countries/OL", "", 640, storage);

    expect(getAppLaunchDestination(true, storage)).toMatchObject({
      pathname: "/countries/OL",
      scrollY: 640,
    });
  });

  it("does not let the trampoline root clobber a snapshotted Results destination", () => {
    const navigationStorage = new MemoryStorage();
    const launchStorage = new MemoryStorage();
    rememberAppLocation("/results", "", 0, navigationStorage, launchStorage);
    rememberAppLocation("/results/example", "?view=jury", 720, navigationStorage, launchStorage);
    const snapshot = navigationStorage.getItem(APP_NAVIGATION_STORAGE_KEY);
    launchStorage.setItem(
      APP_LAUNCH_TRANSACTION_KEY,
      JSON.stringify({
        version: 1,
        startedAt: new Date().toISOString(),
        navigationSnapshot: snapshot,
      }),
    );

    rememberAppLocation("/", "", 0, navigationStorage, launchStorage);

    expect(navigationStorage.getItem(APP_NAVIGATION_STORAGE_KEY)).toBe(snapshot);
    expect(getAppLaunchDestinationFromSnapshot(true, snapshot)).toMatchObject({
      pathname: "/results/example",
      searchStr: "?view=jury",
      scrollY: 720,
    });
  });

  it("never remembers critical or immersive screens as primary-tab destinations", () => {
    const storage = new MemoryStorage();
    rememberAppLocation("/participate", "", 0, storage);
    rememberAppLocation("/televoting", "", 940, storage);
    rememberAppLocation("/jury-voting", "", 620, storage);
    rememberAppLocation("/confirmations", "", 430, storage);
    rememberAppLocation("/broadcast", "", 250, storage);
    rememberAppLocation("/broadcast/show-123", "", 250, storage);
    rememberAppLocation("/show-mode", "", 250, storage);
    rememberAppLocation("/show-mode/round-123", "", 250, storage);

    expect(getAppTabDestination("participate", true, storage)).toMatchObject({
      pathname: "/participate",
      scrollY: 0,
    });
    expect(getAppTabDestination("home", true, storage).pathname).toBe("/");
    // Critical workflow navigation still resolves its semantic tab for proper
    // direct links, but must not change primary tab memory.
    expect(appTabForLocation("/televoting")).toBe("participate");
    // The similarly named published analysis route is a normal Results page.
    rememberAppLocation("/broadcast-intelligence", "", 120, storage);
    expect(getAppTabDestination("results", true, storage)).toMatchObject({
      pathname: "/broadcast-intelligence",
      scrollY: 120,
    });
  });

  it("purges formerly persisted Broadcast and Show Mode roots on read", () => {
    const storage = new MemoryStorage();
    const obsolete = (pathname: string) => ({
      pathname,
      searchStr: "",
      scrollY: 610,
      visitedAt: new Date().toISOString(),
    });
    storage.setItem(
      APP_NAVIGATION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeTab: "home",
        tabs: {
          home: {
            current: obsolete("/broadcast"),
            history: [obsolete("/show-mode/archived"), obsolete("/broadcast")],
          },
        },
      }),
    );

    const state = readAppNavigationState(storage);
    expect(state.tabs.home).toBeUndefined();
    expect(getAppTabDestination("home", true, storage).pathname).toBe("/");
  });

  it("recovers the latest safe history page when persisted current is critical", () => {
    const storage = new MemoryStorage();
    const valid = {
      pathname: "/participate",
      searchStr: "",
      scrollY: 148,
      visitedAt: new Date().toISOString(),
    };
    const critical = {
      ...valid,
      pathname: "/televoting",
      scrollY: 620,
    };
    storage.setItem(
      APP_NAVIGATION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeTab: "participate",
        tabs: {
          participate: { current: critical, history: [valid, critical] },
        },
      }),
    );

    expect(getAppTabDestination("participate", true, storage)).toMatchObject({
      pathname: "/participate",
      scrollY: 148,
    });
    const state = readAppNavigationState(storage).tabs.participate;
    expect(state?.history).toHaveLength(1);
    expect(state?.history[0]?.pathname).toBe("/participate");
  });

  it("never places Organizer workspace routes in installed public tab memory", () => {
    const storage = new MemoryStorage();
    rememberAppLocation("/results", "", 0, storage);
    rememberAppLocation("/organizer", "", 880, storage);
    rememberAppLocation("/organizer/control", "", 660, storage);

    expect(getAppTabDestination("results", true, storage).pathname).toBe("/results");
    expect(readAppNavigationState(storage).activeTab).toBe("results");
    expect(readAppNavigationState(storage).tabs.home).toBeUndefined();
  });

  it("purges persisted critical screen destinations on read", () => {
    const storage = new MemoryStorage();
    const critical = {
      pathname: "/televoting",
      searchStr: "",
      scrollY: 700,
      visitedAt: new Date().toISOString(),
    };
    storage.setItem(
      APP_NAVIGATION_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeTab: "participate",
        tabs: {
          participate: {
            current: critical,
            history: [critical],
          },
        },
      }),
    );
    expect(readAppNavigationState(storage).tabs.participate).toBeUndefined();
    expect(getAppTabDestination("participate", true, storage).pathname).toBe(
      "/participate",
    );
  });

  it("falls back to the tab root instead of cold-launching a critical submission flow", () => {
    const storage = new MemoryStorage();
    rememberAppLocation("/participate", "", 0, storage);
    rememberAppLocation("/televoting", "", 240, storage);

    expect(getAppLaunchDestination(true, storage)).toMatchObject({
      pathname: "/participate",
      scrollY: 0,
    });
  });

  it("respects signed-out Me safety on cold launch", () => {
    const storage = new MemoryStorage();
    rememberAppLocation("/my-solaris/account", "", 0, storage);

    expect(getAppLaunchDestination(false, storage).pathname).toBe("/auth");
  });

  it("does not revive stale screens after the launch freshness window", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "solaris:app-navigation:v1",
      JSON.stringify({
        version: 1,
        activeTab: "explore",
        tabs: {
          explore: {
            current: {
              pathname: "/countries/OL",
              searchStr: "",
              scrollY: 900,
              visitedAt: "2026-09-01T12:00:00.000Z",
            },
            history: [
              {
                pathname: "/countries/OL",
                searchStr: "",
                scrollY: 900,
                visitedAt: "2026-09-01T12:00:00.000Z",
              },
            ],
          },
        },
      }),
    );

    expect(getAppLaunchDestination(true, storage)).toMatchObject({
      pathname: "/explore",
      scrollY: 0,
    });
  });

  it("keeps a shared Show entity inside the Results stack when opened from Results", () => {
    const storage = new MemoryStorage();

    rememberAppLocation("/results", "", 0, storage);
    rememberAppLocation("/shows/show-22", "?from=results", 320, storage);

    expect(appTabForLocation("/shows/show-22", "?from=results")).toBe("results");
    expect(getAppTabDestination("results", true, storage)).toMatchObject({
      pathname: "/shows/show-22",
      searchStr: "?from=results",
      scrollY: 320,
    });
  });

  it("keeps the same Show route in Explore when no Results context exists", () => {
    expect(appTabForLocation("/shows/show-22", "")).toBe("explore");
    expect(appTabForLocation("/shows/show-22", "?tab=stories")).toBe("explore");
  });
});
