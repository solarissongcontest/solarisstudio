import { describe, expect, it } from "vitest";

import {
  getV3PublicTabDestination,
  readV3PublicNavigationState,
  rememberV3PublicLocation,
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

describe("V3 public tab-memory path safety", () => {
  it("rejects protocol-relative and backslash paths from persisted storage", () => {
    for (const pathname of ["//evil.example/path", "/\\evil.example/path"]) {
      const storage = memoryStorage();
      storage.setItem(
        "solaris:public-v3-navigation:v1:viewer-a",
        JSON.stringify({
          version: 1,
          activeTab: "explore",
          tabs: {
            explore: {
              current: {
                pathname,
                searchStr: "",
                scrollY: 100,
                visitedAt: new Date().toISOString(),
              },
              history: [],
            },
          },
        }),
      );

      const state = readV3PublicNavigationState(storage, "viewer-a");
      expect(state.tabs.explore).toBeUndefined();
      expect(
        v3PublicEntryHref(getV3PublicTabDestination("explore", storage, "viewer-a")),
      ).toBe("/explore");
    }
  });

  it("never writes malformed direct locations into tab memory", () => {
    const storage = memoryStorage();
    rememberV3PublicLocation("//evil.example/path", "", 0, storage, "viewer-a");
    rememberV3PublicLocation("/\\evil.example/path", "", 0, storage, "viewer-a");

    expect(readV3PublicNavigationState(storage, "viewer-a").tabs).toEqual({});
  });
});
