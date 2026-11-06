import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const adminAuth = readFileSync(
  "src/integrations/televoting/admin-auth.functions.ts",
  "utf8",
);
const status = readFileSync(
  "src/integrations/televoting/status.functions.ts",
  "utf8",
);
const gate = readFileSync(
  "src/components/admin/UnifiedServiceAdminGate.tsx",
  "utf8",
);

describe("Organizer V3 Televoting legacy identity compatibility", () => {
  it("proves global voting.read before loading privileged compatibility identity", () => {
    const guard = adminAuth.indexOf('await requireSolarisCapabilityServer("voting.read", null);');
    const service = adminAuth.indexOf('"@/integrations/televoting/admin-session.server"');
    expect(guard).toBeGreaterThan(-1);
    expect(service).toBeGreaterThan(guard);
    expect(adminAuth).not.toContain('import { loadMergedTelevotingAdminServer }');
    expect(adminAuth).not.toContain('requireSolarisOrganizerServer');
  });

  it("fails closed to null on a denied or unavailable private identity", () => {
    expect(adminAuth).toContain("} catch {");
    expect(adminAuth).toContain("return null;");
    expect(adminAuth).toContain("if (!admin) return null;");
    expect(adminAuth).toContain("is_super_admin: admin.is_super_admin");
  });

  it("does not confuse backend outage health state with voting.read denial", () => {
    const adminStatus = status.slice(status.indexOf("async function checkAdminBackend()"));
    expect(adminStatus).toContain("await requireSolarisOrganizerServer()");
    expect(adminStatus).not.toContain('requireSolarisCapabilityServer("voting.read"');
    expect(adminStatus).toContain("return !error;");
    expect(gate).toContain('status: "backend-missing"');
    expect(gate).toContain("!status.adminReady");
  });

  it("keeps public voting reachability independent from protected identity reads", () => {
    const publicRead = status.slice(
      status.indexOf("async function checkPublicBackend()"),
      status.indexOf("async function checkAdminBackend()"),
    );
    expect(publicRead).toContain("televotingPublicServer");
    expect(publicRead).not.toContain("requireSolarisCapabilityServer");
    expect(status).toContain("return { votingReady, adminReady };");
  });
});
