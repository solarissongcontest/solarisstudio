import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveOrganizerMoreRouteAccess } from "./v3-organizer-more-access";

describe("Organizer V3 More permission projection", () => {
  it("uses the canonical route capability map to hide denied destinations", () => {
    const access = resolveOrganizerMoreRouteAccess(
      [
        "/admin/predictions",
        "/admin/fantasy",
        "/admin/access-permissions",
        "/admin/system",
      ],
      ["edition.read", "system.read"],
    );

    expect(access).toEqual({
      "/admin/predictions": true,
      "/admin/fantasy": true,
      "/admin/access-permissions": false,
      "/admin/system": true,
    });
  });

  it("fails closed for paths whose canonical capability is absent", () => {
    expect(resolveOrganizerMoreRouteAccess(["/admin/access-permissions"], [])).toEqual({
      "/admin/access-permissions": false,
    });
  });

  it("loads one authenticated bounded capability snapshot instead of per-route RPC fan-out", () => {
    const accessSource = readFileSync(
      resolve(process.cwd(), "src/lib/v3-organizer-more-access.ts"),
      "utf8",
    );
    const pageSource = readFileSync(
      resolve(process.cwd(), "src/routes/_authenticated/admin/more.tsx"),
      "utf8",
    );

    expect(accessSource).toContain("getSolarisCapabilitiesServer(data.editionId)");
    expect(accessSource).toContain("capabilityForOrganizerPath(path)");
    expect(accessSource).not.toContain("studio2_access_allowed");
    expect(accessSource).not.toContain("supabase.from(");
    expect(accessSource).not.toContain("has_role");

    expect(pageSource).toContain("useServerFn(getOrganizerMoreCapabilities)");
    expect(pageSource).toContain('queryKey: ["v3-organizer-more-access", editionId ?? "global"]');
    expect(pageSource).toContain("resolveOrganizerMoreRouteAccess(morePaths, capabilities)");
    expect(pageSource).toContain("accessByPath[item.to] === true");
    expect(pageSource).toContain("retry: false");
    expect(pageSource).toContain("refetchOnWindowFocus: false");
  });

  it("fails closed while access is unresolved or unavailable", () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), "src/routes/_authenticated/admin/more.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("access.isPending");
    expect(pageSource).toContain("access.isError");
    expect(pageSource).toContain("Specialist access unavailable");
    expect(pageSource).toContain("No specialist tools available");
    expect(pageSource).toContain("visibleGroups");
  });
});
