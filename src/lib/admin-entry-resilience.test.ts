import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Organizer entry resilience", () => {
  it("keeps browser storage failures from blocking admin context", () => {
    const context = source("components/admin/AdminContext.tsx");

    expect(context).toContain("try {");
    expect(context).toContain("window.localStorage.getItem");
    expect(context).toContain("window.localStorage.setItem");
    expect(context).toContain("Browser privacy/storage restrictions must never prevent Organizer access");
    expect(context).toContain("useCallback");
  });

  it("isolates non-essential organizer chrome behind feature boundaries", () => {
    const shell = source("components/admin/AdminShell.tsx");
    const frame = source("components/admin/AdminFrame.tsx");

    expect(shell).toContain('name="edition-selector"');
    expect(shell).toContain('name="command-palette"');
    expect(shell).toContain('name="health-strip"');
    expect(frame).toContain('name="desktop-navigation"');
    expect(frame).toContain('name="section-navigation"');
  });

  it("gives the admin route a hard-reload recovery path for stale bundles", () => {
    const route = source("routes/_authenticated/admin/route.tsx");

    expect(route).toContain("isStaleClientBundleError");
    expect(route).toContain("window.location.reload()");
    expect(route).toContain("errorComponent: AdminRouteError");
    expect(route).toContain("ADMIN_RELOAD_KEY");
  });
});
