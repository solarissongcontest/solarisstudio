import { describe, expect, it } from "vitest";

import {
  getRetainedAppLaunchCandidateFromSnapshot,
  getV3PublicLaunchDestination,
  markV3AppLaunchNavigationRestore,
  preferV3AppLaunchDestination,
  V3_APP_LAUNCH_RESTORE_MAX_AGE_MS,
} from "@/lib/v3-app-launch-memory";
import { rememberV3PublicLocation } from "@/lib/v3-public-navigation";

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

function entry(pathname: string, visitedAt: string, searchStr = "") {
  return { pathname, searchStr, scrollY: 120, visitedAt };
}

function retainedSnapshot(
  tab: "home" | "explore" | "participate" | "results" | "me",
  current: ReturnType<typeof entry>,
) {
  return JSON.stringify({
    version: 1,
    activeTab: tab,
    tabs: {
      [tab]: {
        current,
        history: [current],
      },
    },
  });
}

describe("V3 installed-app launch memory", () => {
  it("restores only the resolved viewer scope", () => {
    const storage = new MemoryStorage();
    rememberV3PublicLocation(
      "/countries/oland",
      "",
      144,
      storage as Storage,
      "viewer-a",
    );
    rememberV3PublicLocation(
      "/results",
      "",
      88,
      storage as Storage,
      "viewer-b",
    );

    expect(
      getV3PublicLaunchDestination(true, storage, "viewer-a")?.pathname,
    ).toBe("/countries/oland");
    expect(
      getV3PublicLaunchDestination(true, storage, "viewer-b")?.pathname,
    ).toBe("/results");
    expect(getV3PublicLaunchDestination(true, storage, "viewer-c")).toBeNull();
  });

  it("never restores authenticated Me memory into an anonymous launch", () => {
    const storage = new MemoryStorage();
    rememberV3PublicLocation(
      "/my-solaris",
      "",
      0,
      storage as Storage,
      "viewer-a",
    );

    expect(
      getV3PublicLaunchDestination(false, storage, "viewer-a"),
    ).toBeNull();
    expect(
      getV3PublicLaunchDestination(true, storage, "viewer-a")?.pathname,
    ).toBe("/my-solaris");
  });

  it("rejects expired V3 launch memory", () => {
    const storage = new MemoryStorage();
    const old = new Date(Date.now() - V3_APP_LAUNCH_RESTORE_MAX_AGE_MS - 1_000).toISOString();
    storage.setItem(
      "solaris:public-v3-navigation:v1:viewer-a",
      JSON.stringify({
        version: 1,
        activeTab: "explore",
        tabs: {
          explore: {
            current: entry("/countries/oland", old),
            history: [entry("/countries/oland", old)],
          },
        },
      }),
    );

    expect(
      getV3PublicLaunchDestination(true, storage, "viewer-a"),
    ).toBeNull();
  });

  it("distinguishes real retained memory from the synthetic safe root used for stale fallback", () => {
    const fresh = entry("/countries/oland", new Date().toISOString());
    const stale = entry(
      "/countries/oland",
      new Date(Date.now() - V3_APP_LAUNCH_RESTORE_MAX_AGE_MS - 1_000).toISOString(),
    );

    expect(
      getRetainedAppLaunchCandidateFromSnapshot(
        true,
        retainedSnapshot("explore", fresh),
      ),
    ).toMatchObject(fresh);
    expect(
      getRetainedAppLaunchCandidateFromSnapshot(
        true,
        retainedSnapshot("explore", stale),
      ),
    ).toBeNull();
  });

  it("does not let an unsafe retained critical task masquerade as fresh launch history", () => {
    const critical = entry("/jury-voting", new Date().toISOString());
    expect(
      getRetainedAppLaunchCandidateFromSnapshot(
        true,
        retainedSnapshot("participate", critical),
      ),
    ).toBeNull();
  });

  it("prefers the newer compatible generation without treating missing legacy memory as newer", () => {
    const legacy = entry("/explore", "2026-10-20T20:00:00.000Z");
    const v3 = entry("/countries/oland", "2026-10-20T21:00:00.000Z");

    expect(preferV3AppLaunchDestination(legacy, v3)).toBe(true);
    expect(preferV3AppLaunchDestination(v3, legacy)).toBe(false);
    expect(preferV3AppLaunchDestination(null, v3)).toBe(true);
    expect(preferV3AppLaunchDestination(legacy, null)).toBe(false);
  });

  it("arms V3 scroll restore only for launch-safe destinations", () => {
    const storage = new MemoryStorage();
    const now = new Date().toISOString();

    expect(
      markV3AppLaunchNavigationRestore(
        entry("/countries/oland", now),
        true,
        storage,
        "viewer-a",
      ),
    ).toBe(true);
    expect([...storage.values.values()]).toHaveLength(1);
    expect([...storage.values.values()][0]).toContain("/countries/oland");

    storage.values.clear();
    expect(
      markV3AppLaunchNavigationRestore(
        entry("/jury-voting", now),
        true,
        storage,
        "viewer-a",
      ),
    ).toBe(false);
    expect(storage.values.size).toBe(0);
  });
});
