import { describe, expect, it } from "vitest";

import {
  consumeV3PublicNavigationRestore,
  getV3PublicTabDestination,
  markV3PublicNavigationRestore,
  readV3PublicNavigationState,
  rememberV3PublicLocation,
  updateV3PublicScrollPosition,
  v3PublicEntryHref,
} from "@/lib/v3-public-navigation";

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

describe("V3 public navigation memory", () => {
  it("restores the last valid nested route for each canonical tab", () => {
    const storage = memoryStorage();
    rememberV3PublicLocation("/countries/oland", "", 420, storage, "viewer-a");
    rememberV3PublicLocation("/results", "?edition=22", 160, storage, "viewer-a");

    expect(v3PublicEntryHref(getV3PublicTabDestination("explore", storage, "viewer-a"))).toBe(
      "/countries/oland",
    );
    expect(v3PublicEntryHref(getV3PublicTabDestination("results", storage, "viewer-a"))).toBe(
      "/results?edition=22",
    );
  });

  it("uses route context when a show belongs to Results instead of Explore", () => {
    const storage = memoryStorage();
    rememberV3PublicLocation("/shows/grand-final", "?from=results", 90, storage, "viewer-a");

    expect(
      v3PublicEntryHref(getV3PublicTabDestination("results", storage, "viewer-a")),
    ).toBe("/shows/grand-final?from=results");
    expect(v3PublicEntryHref(getV3PublicTabDestination("explore", storage, "viewer-a"))).toBe(
      "/explore",
    );
  });

  it("never stores focused or immersive routes as top-level memory", () => {
    const storage = memoryStorage();
    rememberV3PublicLocation("/jury-voting", "", 0, storage, "viewer-a");
    rememberV3PublicLocation("/show-mode", "", 0, storage, "viewer-a");

    const state = readV3PublicNavigationState(storage, "viewer-a");
    expect(state.tabs.participate).toBeUndefined();
    expect(state.tabs.home).toBeUndefined();
  });

  it("scopes memory per viewer so auth transitions cannot resurrect another account route", () => {
    const storage = memoryStorage();
    rememberV3PublicLocation("/my-solaris/notifications", "", 32, storage, "viewer-a");

    expect(v3PublicEntryHref(getV3PublicTabDestination("me", storage, "viewer-a"))).toBe(
      "/my-solaris/notifications",
    );
    expect(v3PublicEntryHref(getV3PublicTabDestination("me", storage, "viewer-b"))).toBe(
      "/my-solaris",
    );
    expect(v3PublicEntryHref(getV3PublicTabDestination("me", storage, null))).toBe(
      "/my-solaris",
    );
  });

  it("persists scroll with animation-frame friendly updates and consumes restore once", () => {
    const storage = memoryStorage();
    const session = memoryStorage();
    rememberV3PublicLocation("/countries/oland", "", 20, storage, "viewer-a");
    updateV3PublicScrollPosition("/countries/oland", "", 555, storage, "viewer-a");

    const target = getV3PublicTabDestination("explore", storage, "viewer-a");
    expect(target.scrollY).toBe(555);
    markV3PublicNavigationRestore(target, session, "viewer-a");

    expect(
      consumeV3PublicNavigationRestore("/countries/oland", "", session, "viewer-a"),
    ).toBe(555);
    expect(
      consumeV3PublicNavigationRestore("/countries/oland", "", session, "viewer-a"),
    ).toBeNull();
  });

  it("invalidates stale restore intents after redirects so a later visit cannot resurrect them", () => {
    const storage = memoryStorage();
    const session = memoryStorage();
    rememberV3PublicLocation("/countries/oland", "", 20, storage, "viewer-a");
    updateV3PublicScrollPosition("/countries/oland", "", 777, storage, "viewer-a");
    const target = getV3PublicTabDestination("explore", storage, "viewer-a");
    markV3PublicNavigationRestore(target, session, "viewer-a");

    expect(
      consumeV3PublicNavigationRestore("/explore", "", session, "viewer-a"),
    ).toBeNull();
    expect(
      consumeV3PublicNavigationRestore("/countries/oland", "", session, "viewer-a"),
    ).toBeNull();
  });

  it("fails closed on incompatible persisted navigation versions", () => {
    const storage = memoryStorage();
    storage.setItem(
      "solaris:public-v3-navigation:v1:viewer-a",
      JSON.stringify({
        version: 999,
        activeTab: "me",
        tabs: {
          me: {
            current: {
              pathname: "/my-solaris/notifications",
              searchStr: "",
              scrollY: 123,
              visitedAt: new Date().toISOString(),
            },
            history: [],
          },
        },
      }),
    );

    const state = readV3PublicNavigationState(storage, "viewer-a");
    expect(state.activeTab).toBe("home");
    expect(state.tabs).toEqual({});
  });
});
