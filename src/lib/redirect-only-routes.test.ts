import { describe, expect, it } from "vitest";
import { isRedirect } from "@tanstack/react-router";

// Exercise the real compatibility hooks: removing an unreachable component must
// preserve destination, identity entry, Edition parameters and caller search.
const cases = [
  ["../routes/confirmations/next-in-line", "/next-in-line"],
  ["../routes/confirmations/admin/sign-in", "/auth"],
  ["../routes/televoting/admin/sign-in", "/auth"],
  ["../routes/televoting/admin/accounts", "/admin/operations"],
  ["../routes/televoting/admin/intelligence", "/admin/friend-voting"],
  ["../routes/televoting/admin/detection", "/televoting/admin/intelligence"],
  ["../routes/televoting/admin/anti-abuse", "/televoting/admin/intelligence"],
  ["../routes/televoting/admin/friend-voting", "/admin/friend-voting"],
  ["../routes/televoting/admin/televote", "/televoting/admin/results"],
  ["../routes/integrity/report/index", "/integrity/report/category"],
  ["../routes/_authenticated/admin/edition-theme.$slug", "/admin/design/$slug"],
  ["../routes/_authenticated/country-hub/index", "/my-solaris/country"],
  ["../routes/_authenticated/country-hub/theme", "/my-solaris/theme"],
  ["../routes/_authenticated/country-hub/page-builder", "/my-solaris/page-builder"],
  ["../routes/_authenticated/country-hub/readiness", "/my-solaris/entry"],
  ["../routes/_authenticated/country-hub/hod", "/my-solaris/tasks"],
  ["../routes/_authenticated/country-hub/notices", "/my-solaris/notices"],
] as const;

describe("redirect-only route compatibility", () => {
  it.each(cases)("%s retains its canonical destination", async (path, destination) => {
    const module = await import(/* @vite-ignore */ path);
    const search = { country: "country-a", notice: "notice-a", state: "unread" };
    try {
      await module.Route.options.beforeLoad({ params: { slug: "edition-a" }, search });
      throw new Error("Compatibility route did not redirect");
    } catch (result) {
      expect(isRedirect(result)).toBe(true);
      const options = (result as { options: { to: string; params?: unknown; search?: unknown } })
        .options;
      expect(options.to).toBe(destination);
      if (destination === "/auth")
        expect(options.search).toEqual({ redirect: "/admin/operations" });
      if (destination === "/admin/design/$slug")
        expect(options.params).toEqual({ slug: "edition-a" });
      if (path.includes("country-hub")) {
        expect(options.search).toEqual(
          path.endsWith("readiness") ? { ...search, view: "readiness" } : search,
        );
      }
    }
  });
});
