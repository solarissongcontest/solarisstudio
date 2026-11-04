import { describe, expect, it } from "vitest";

import {
  PUBLIC_RECENTS_KEY,
  clearPublicRecents,
  readPublicRecents,
  rememberPublicRecent,
  shouldRememberPublicPath,
} from "./public-recents";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe("public recents", () => {
  it("does not remember sensitive, organizer, critical or immersive paths", () => {
    for (const path of [
      "/admin/operations",
      "/auth",
      "/integrity/appeals/private-case",
      "/confirmations/edit/demo-token",
      "/jury-voting",
      "/televoting",
      "/next-in-line",
      "/my-solaris/entry",
      "/integrity/report/category",
      "/show-mode",
      "/broadcast/grand-final",
      "/me",
      "/me/receipts",
      "/my-solaris/history",
      "/my-solaris/notifications",
      "/settings",
      "/country-hub/country",
      "/integrity/cases",
      "/fantasy/my-roster",
      "/predictions/my-draft",
      "/countries/oland/edit",
      "/not-a-registered-public-route",
      "/administer/countries",
    ]) {
      expect(shouldRememberPublicPath(path), path).toBe(false);
    }

    expect(shouldRememberPublicPath("/explore")).toBe(false);
    expect(shouldRememberPublicPath("/guide")).toBe(false);
    expect(shouldRememberPublicPath("/site-directory")).toBe(false);
    expect(shouldRememberPublicPath("/rules")).toBe(false);
  });

  it("rejects malformed or cross-origin-looking persisted paths", () => {
    for (const path of [
      "https://example.com/path",
      "//example.com/path",
      "/\\example.com/path",
      "/countries/oland\n/unsafe",
    ]) {
      expect(shouldRememberPublicPath(path), path).toBe(false);
    }
  });

  it("keeps ordinary public destinations, including non-critical voting results", () => {
    expect(shouldRememberPublicPath("/countries/oland")).toBe(true);
    expect(shouldRememberPublicPath("/televoting/results")).toBe(true);
    expect(shouldRememberPublicPath("/editions/ssc-22")).toBe(true);
    expect(shouldRememberPublicPath("/shows/public-show-id")).toBe(true);
    expect(shouldRememberPublicPath("/rules/chapters/roleplay-worldbuilding")).toBe(true);
  });

  it("filters old hub, utility, critical and malformed entries already stored on the device", () => {
    const storage = memoryStorage();
    storage.setItem(
      PUBLIC_RECENTS_KEY,
      JSON.stringify([
        { path: "/explore", label: "Explore", visitedAt: 9 },
        { path: "/my-solaris/entry", label: "Entry", visitedAt: 8 },
        { path: "/integrity/report/category", label: "Integrity report", visitedAt: 7 },
        { path: "//example.com/escape", label: "External", visitedAt: 6 },
        { path: "/\\example.com/escape", label: "Backslash", visitedAt: 5 },
        { path: "/guide", label: "How to use Solaris Studio", visitedAt: 4 },
        { path: "/me/receipts", label: "Private receipt", visitedAt: 4 },
        { path: "/my-solaris/history", label: "Previous delegation", visitedAt: 4 },
        { path: "/not-a-registered-public-route", label: "Unknown", visitedAt: 4 },
        { path: "/countries/oland", label: "Oland", visitedAt: 3 },
      ]),
    );

    expect(readPublicRecents(storage).map((item) => item.path)).toEqual([
      "/countries/oland",
    ]);
  });

  it("fails closed without a browser window and when storage is blocked", () => {
    // Vitest uses Node for this repository; an SSR render has no window.
    expect(readPublicRecents()).toEqual([]);
    expect(() => rememberPublicRecent("/countries/oland", "Oland")).not.toThrow();
    expect(() => clearPublicRecents()).not.toThrow();

    const blockedStorage = {
      getItem: () => { throw new Error("Storage denied"); },
      setItem: () => { throw new Error("Storage denied"); },
    };
    expect(readPublicRecents(blockedStorage)).toEqual([]);
    expect(() => rememberPublicRecent("/countries/oland", "Oland", blockedStorage)).not.toThrow();
    expect(() => clearPublicRecents(blockedStorage)).not.toThrow();
  });

  it("does not add private routes to already stored public history", () => {
    const storage = memoryStorage();
    rememberPublicRecent("/countries/oland", "Oland", storage);
    rememberPublicRecent("/my-solaris/history", "Private history", storage);
    rememberPublicRecent("/integrity/cases", "Confidential case", storage);
    expect(readPublicRecents(storage).map((item) => item.label)).toEqual(["Oland"]);
  });

  it("keeps the newest eight unique destinations", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 10; index += 1) {
      rememberPublicRecent(`/countries/country-${index}`, `Path ${index}`, storage);
    }
    rememberPublicRecent("/countries/country-5", "Path five again", storage);
    const recents = readPublicRecents(storage);
    expect(recents).toHaveLength(8);
    expect(recents[0]?.path).toBe("/countries/country-5");
    expect(storage.getItem(PUBLIC_RECENTS_KEY)).toBeTruthy();
  });
});
