import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("V3 Organizer voting audit authorization", () => {
  const server = source("src/integrations/televoting/audit.server.ts");
  const fn = source("src/integrations/televoting/audit.functions.ts");
  const permissionMap = source("src/lib/permission-route-map.ts");

  it("uses the canonical global Voting read capability before privileged audit access", () => {
    const capabilityCheck = server.indexOf(
      'requireSolarisCapabilityServer("voting.read")',
    );
    const privilegedQuery = server.indexOf('.from("admin_audit_log")');

    expect(capabilityCheck).toBeGreaterThan(-1);
    expect(privilegedQuery).toBeGreaterThan(capabilityCheck);
    expect(server).not.toContain("requireMergedTelevotingAdminServer");
  });

  it("matches the Organizer route capability instead of inventing a second permission model", () => {
    expect(permissionMap).toContain('rule(["/televoting/admin"], "voting.read")');
    expect(server).toContain('requireSolarisCapabilityServer("voting.read")');
  });

  it("keeps the browser behind the bounded server-function reader", () => {
    expect(fn).toContain('createServerFn({ method: "POST" })');
    expect(fn).toContain(
      'import(\n      "@/integrations/televoting/audit.server"\n    )',
    );
    expect(fn).toContain("listMergedAuditLogServer(data)");
    expect(fn).not.toMatch(/supabaseAdmin|televotingAdmin|\.from\(|\.rpc\(/);
  });

  it("remains observational", () => {
    expect(server).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  });
});
