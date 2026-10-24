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
    expect(syncHealth).toContain('p_capability: "system.read"');
    expect(syncHealth).toContain('p_edition_id: null');
  });

  it("evaluates capability through the authenticated caller before service-role access", () => {
    const organizerGuard = syncHealth.indexOf("await requireSolarisOrganizerServer();");
    const callerClient = syncHealth.indexOf("createSolarisAuthenticatedClientServer() as any");
    const capabilityRpc = syncHealth.indexOf('"studio2_access_allowed"');
    const adminImport = syncHealth.indexOf(
      'await import("@/integrations/supabase/client.server")',
    );
    const firstAdminQuery = syncHealth.indexOf('db.from("editions")');

    expect(organizerGuard).toBeGreaterThan(-1);
    expect(callerClient).toBeGreaterThan(organizerGuard);
    expect(capabilityRpc).toBeGreaterThan(callerClient);
    expect(adminImport).toBeGreaterThan(capabilityRpc);
    expect(firstAdminQuery).toBeGreaterThan(adminImport);
  });

  it("fails closed when capability evaluation errors or denies access", () => {
    expect(syncHealth).toContain("if (capabilityError)");
    expect(syncHealth).toContain(
      'throw new Error("System health authorization could not be verified.")',
    );
    expect(syncHealth).toContain("if (allowed !== true)");
    expect(syncHealth).toContain(
      'throw new Error("System read capability required.")',
    );
  });

  it("does not move the privileged runtime probe ahead of the capability boundary", () => {
    const capabilityRpc = syncHealth.indexOf('"studio2_access_allowed"');
    const runtimeProbe = syncHealth.indexOf("const runtimeProbe =");
    const televotingAdmin = syncHealth.indexOf("requireMergedTelevotingAdminServer");

    expect(runtimeProbe).toBeGreaterThan(capabilityRpc);
    expect(televotingAdmin).toBeGreaterThan(runtimeProbe);
  });
});
