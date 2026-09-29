import { describe, expect, it } from "vitest";

import {
  PUBLIC_RECENTS_KEY,
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
  it("does not remember sensitive or organizer paths", () => {
    expect(shouldRememberPublicPath("/admin/operations")).toBe(false);
    expect(shouldRememberPublicPath("/auth")).toBe(false);
    expect(shouldRememberPublicPath("/integrity/appeals/private-case")).toBe(false);
    expect(shouldRememberPublicPath("/explore")).toBe(false);
    expect(shouldRememberPublicPath("/guide")).toBe(false);
    expect(shouldRememberPublicPath("/site-directory")).toBe(false);
    expect(shouldRememberPublicPath("/rules")).toBe(false);
    expect(shouldRememberPublicPath("/countries/oland")).toBe(true);
  });

  it("filters old hub and utility entries already stored on the device", () => {
    const storage = memoryStorage();
    storage.setItem(
      PUBLIC_RECENTS_KEY,
      JSON.stringify([
        { path: "/explore", label: "Explore", visitedAt: 5 },
        { path: "/guide", label: "How to use Solaris Studio", visitedAt: 4 },
        { path: "/countries/oland", label: "Oland", visitedAt: 3 },
      ]),
    );

    expect(readPublicRecents(storage).map((item) => item.path)).toEqual([
      "/countries/oland",
    ]);
  });

  it("keeps the newest eight unique destinations", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 10; index += 1) {
      rememberPublicRecent(`/path-${index}`, `Path ${index}`, storage);
    }
    rememberPublicRecent("/path-5", "Path five again", storage);
    const recents = readPublicRecents(storage);
    expect(recents).toHaveLength(8);
    expect(recents[0]?.path).toBe("/path-5");
    expect(storage.getItem(PUBLIC_RECENTS_KEY)).toBeTruthy();
  });
});
