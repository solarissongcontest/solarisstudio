import { describe, expect, it } from "vitest";

import {
  adminEntryHref,
  consumeAdminNavigationRestore,
  getAdminAppTabDestination,
  markAdminNavigationRestore,
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

  it("restores scroll only for the exact destination intent", () => {
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
    expect(
      consumeAdminNavigationRestore(
        "/admin/entries/oland",
        "?view=entry",
        session,
      ),
    ).toBe(333);
  });
});
