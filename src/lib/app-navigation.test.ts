import { describe, expect, it } from "vitest";

import {
  appEntryHref,
  getAppLaunchDestination,
  getAppTabDestination,
  peekAppBackTarget,
  popAppBackTarget,
  readAppNavigationState,
  rememberAppLocation,
  resetAppTabToRoot,
  updateAppScrollPosition,
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

});
