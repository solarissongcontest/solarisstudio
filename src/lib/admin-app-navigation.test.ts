import { describe, expect, it } from "vitest";

import {
  adminEntryHref,
  consumeAdminNavigationRestore,
  getAdminAppTabDestination,
  markAdminNavigationRestore,
  readAdminNavigationState,
  rememberAdminLocation,
  resetAdminAppTabToRoot,
  updateAdminScrollPosition,
} from "@/lib/admin-app-navigation";

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

describe("Organizer app navigation memory", () => {
  it("preserves independent Home, Edition, Tasks, Delegations and More destinations", () => {
    const storage = new MemoryStorage();
    const slug = "ssc-22";

    rememberAdminLocation("/admin/entries/oland", "?panel=media", 420, slug, storage);
    rememberAdminLocation("/admin/inbox/case-17", "", 95, slug, storage);
    rememberAdminLocation("/admin/countries/oland", "?tab=overview", 130, slug, storage);
    rememberAdminLocation("/admin/integrity-case/abc", "", 210, slug, storage);

    expect(adminEntryHref(getAdminAppTabDestination("edition", slug, storage))).toBe(
      "/admin/entries/oland?panel=media",
    );
    expect(getAdminAppTabDestination("edition", slug, storage).scrollY).toBe(420);
    expect(getAdminAppTabDestination("tasks", slug, storage).pathname).toBe(
      "/admin/inbox/case-17",
    );
    expect(getAdminAppTabDestination("delegations", slug, storage).pathname).toBe(
      "/admin/countries/oland",
    );
    expect(getAdminAppTabDestination("more", slug, storage).pathname).toBe(
      "/admin/integrity-case/abc",
    );
  });

  it("resets only the active Organizer tab to its canonical root", () => {
    const storage = new MemoryStorage();
    const slug = "ssc-22";

    rememberAdminLocation("/admin/entries/oland", "", 200, slug, storage);
    rememberAdminLocation("/admin/inbox/thread-4", "", 80, slug, storage);

    const root = resetAdminAppTabToRoot("edition", slug, storage);
    expect(root.pathname).toBe("/admin/ssc-22");
    expect(getAdminAppTabDestination("tasks", slug, storage).pathname).toBe(
      "/admin/inbox/thread-4",
    );
  });

  it("consumes scroll restoration exactly once for the intended destination", () => {
    const storage = new MemoryStorage();
    const session = new MemoryStorage();
    const slug = "ssc-22";

    rememberAdminLocation("/admin/entries/oland", "?view=entry", 0, slug, storage);
    updateAdminScrollPosition(
      "/admin/entries/oland",
      "?view=entry",
      333,
      slug,
      storage,
    );
    const target = getAdminAppTabDestination("edition", slug, storage);
    markAdminNavigationRestore(target, session);

    expect(
      consumeAdminNavigationRestore(
        "/admin/entries/oland",
        "?view=other",
        session,
      ),
    ).toBeNull();
    // A redirected/mismatched handoff is consumed and cannot fire later.
    expect(
      consumeAdminNavigationRestore(
        "/admin/entries/oland",
        "?view=entry",
        session,
      ),
    ).toBeNull();

    markAdminNavigationRestore(target, session);
    expect(
      consumeAdminNavigationRestore(
        "/admin/entries/oland",
        "?view=entry",
        session,
      ),
    ).toBe(333);
    expect(
      consumeAdminNavigationRestore(
        "/admin/entries/oland",
        "?view=entry",
        session,
      ),
    ).toBeNull();
  });

  it("fails closed on unknown future persisted versions", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      "solaris:organizer-navigation:v1",
      JSON.stringify({
        version: 999,
        activeTab: "edition",
        tabs: {
          edition: {
            current: {
              pathname: "/admin/ssc-22",
              searchStr: "",
              scrollY: 222,
              visitedAt: new Date().toISOString(),
            },
            history: [],
          },
        },
      }),
    );

    expect(readAdminNavigationState("ssc-22", storage)).toEqual({
      version: 1,
      activeTab: "home",
      tabs: {},
    });
  });

  it("consumes malformed restore payloads and rejects lookalike admin prefixes", () => {
    const storage = new MemoryStorage();
    const session = new MemoryStorage();
    session.setItem("solaris:organizer-navigation-restore:v1", "{not-json");

    expect(consumeAdminNavigationRestore("/admin/tasks", "", session)).toBeNull();
    expect(session.getItem("solaris:organizer-navigation-restore:v1")).toBeNull();

    rememberAdminLocation("/administrator", "", 100, "ssc-22", storage);
    rememberAdminLocation("/confirmations/administrator", "", 100, "ssc-22", storage);
    expect(readAdminNavigationState("ssc-22", storage).tabs).toEqual({});
  });
});
