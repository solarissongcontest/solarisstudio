import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const syncHealth = readFileSync(
  "src/integrations/unified/sync-health.functions.ts",
  "utf8",
);
const permissionMap = readFileSync("src/lib/permission-route-map.ts", "utf8");

describe("Organizer V3 System Health authorization", () => {
  it("keeps the route and server projection on the same system.read capability", () => {
    expect(permissionMap).toContain(
      'rule(["/admin/system-operations", "/admin/system", "/admin/sync-health"], "system.read")',
    );
    expect(syncHealth).toContain(
      'await requireSolarisCapabilityServer("system.read", null);',
    );
  });

  it("uses the canonical capability server before service-role access", () => {
    const capabilityImport = syncHealth.indexOf(
      '"@/integrations/supabase/capabilities.server"',
    );
    const capabilityGuard = syncHealth.indexOf(
      'await requireSolarisCapabilityServer("system.read", null);',
    );
    const adminImport = syncHealth.indexOf(
      'await import("@/integrations/supabase/client.server")',
    );
    const firstAdminQuery = syncHealth.indexOf('db.from("editions")');

    expect(capabilityImport).toBeGreaterThan(-1);
    expect(capabilityGuard).toBeGreaterThan(capabilityImport);
    expect(adminImport).toBeGreaterThan(capabilityGuard);
    expect(firstAdminQuery).toBeGreaterThan(adminImport);
  });

  it("does not fall back to generic Organizer role authorization", () => {
    expect(syncHealth).not.toContain("requireSolarisOrganizerServer");
    expect(syncHealth).not.toContain('"studio2_access_allowed"');
    expect(syncHealth).not.toContain("createSolarisAuthenticatedClientServer");
  });

  it("does not move the privileged runtime probe ahead of the capability boundary", () => {
    const capabilityGuard = syncHealth.indexOf(
      'await requireSolarisCapabilityServer("system.read", null);',
    );
    const runtimeProbe = syncHealth.indexOf("const runtimeProbe =");
    const televotingAdmin = syncHealth.indexOf("requireMergedTelevotingAdminServer");

    expect(runtimeProbe).toBeGreaterThan(capabilityGuard);
    expect(televotingAdmin).toBeGreaterThan(runtimeProbe);
  });
});
