import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const auditServer = readFileSync(
  "src/integrations/televoting/audit.server.ts",
  "utf8",
);
const permissionMap = readFileSync("src/lib/permission-route-map.ts", "utf8");

describe("Organizer V3 Televoting audit authorization", () => {
  it("aligns the audit server with the canonical voting.read route boundary", () => {
    expect(permissionMap).toContain('rule(["/televoting/admin"], "voting.read")');
    expect(auditServer).toContain(
      'await requireSolarisCapabilityServer("voting.read", null);',
    );
  });

  it("does not use compatibility Televoting super-admin identity as read authorization", () => {
    expect(auditServer).not.toContain("requireMergedTelevotingAdminServer");
    expect(auditServer).not.toContain("requireSolarisOrganizerServer");
  });

  it("authorizes before querying privileged audit payloads", () => {
    const guard = auditServer.indexOf(
      'await requireSolarisCapabilityServer("voting.read", null);',
    );
    const query = auditServer.indexOf('.from("admin_audit_log")');
    const payloadFields = auditServer.indexOf("old_values,new_values,reason");

    expect(guard).toBeGreaterThan(-1);
    expect(query).toBeGreaterThan(guard);
    expect(payloadFields).toBeGreaterThan(query);
  });

  it("keeps the audit read bounded", () => {
    expect(auditServer).toContain("Math.min(filters.limit ?? 500, 1000)");
  });
});
