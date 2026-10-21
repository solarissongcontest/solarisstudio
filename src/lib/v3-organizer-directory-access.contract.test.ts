import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const menu = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/menu.tsx"),
  "utf8",
);

describe("Organizer V3 specialist directory access", () => {
  it("resolves one bounded access snapshot after exact edition context is known", () => {
    expect(menu).toContain("loadOrganizerMoreRouteAccess(accessPaths, editionId ?? null)");
    expect(menu).toContain('"v3-organizer-directory-access"');
    expect(menu).toContain('editionId ?? "unscoped"');
    expect(menu).toContain('activeEdition?.slug ?? "no-edition"');
    expect(menu).toContain("enabled: !editionsLoading");
    expect(menu).toContain("retry: false");
    expect(menu).toContain("staleTime: 30_000");
    expect(menu).toContain("refetchOnWindowFocus: false");
  });

  it("only asks access for concrete ready destinations and hides denied destinations", () => {
    expect(menu).toContain('domain.availability === "ready" ? [domain.to] : []');
    expect(menu).toContain('item.availability === "ready" ? [item.to] : []');
    expect(menu).toContain(
      'domain.availability === "ready" && accessByPath[domain.to] === true',
    );
    expect(menu).toContain(
      'item.availability === "ready" && accessByPath[item.to] === true',
    );
    expect(menu).toContain(".filter((group) => group.items.length > 0)");
  });

  it("fails closed while permissions are unresolved or unavailable", () => {
    expect(menu).toContain("editionsLoading || access.isPending");
    expect(menu).toContain("Checking Organizer access");
    expect(menu).toContain("access.isError");
    expect(menu).toContain("Organizer directory unavailable");
    expect(menu).toContain("the directory is hidden until permissions can be checked safely");
  });

  it("does not invent browser authorization or database authority", () => {
    expect(menu).not.toContain("supabase.from(");
    expect(menu).not.toContain("has_role");
    expect(menu).not.toContain("legacyRoles");
    expect(menu).not.toContain("useMutation(");
  });
});
