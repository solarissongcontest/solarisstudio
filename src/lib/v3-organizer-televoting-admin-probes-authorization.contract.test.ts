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

describe("Organizer V3 Televoting compatibility probes", () => {
  it("requires voting.read before creating a compatibility admin identity", () => {
    const guard = adminAuth.indexOf(
      'await requireSolarisCapabilityServer("voting.read", null);',
    );
    const compatibilityImport = adminAuth.indexOf(
      '"@/integrations/televoting/admin-session.server"',
    );

    expect(guard).toBeGreaterThan(-1);
    expect(compatibilityImport).toBeGreaterThan(guard);
  });

  it("fails the identity probe closed to null", () => {
    expect(adminAuth).toContain("} catch {");
    expect(adminAuth).toContain("return null;");
  });

  it("requires voting.read before privileged backend readiness probing", () => {
    const guard = status.indexOf(
      'await requireSolarisCapabilityServer("voting.read", null);',
    );
    const adminClientImport = status.indexOf(
      '"@/integrations/televoting/client.server"',
    );
    const adminQuery = status.indexOf(
      '.from("rounds")',
      adminClientImport,
    );

    expect(guard).toBeGreaterThan(-1);
    expect(adminClientImport).toBeGreaterThan(guard);
    expect(adminQuery).toBeGreaterThan(adminClientImport);
  });

  it("keeps public voting-backend reachability public and separate", () => {
    const publicCheckStart = status.indexOf("async function checkPublicBackend()");
    const adminCheckStart = status.indexOf("async function checkAdminBackend()");
    const publicBlock = status.slice(publicCheckStart, adminCheckStart);

    expect(publicBlock).toContain("televotingPublicServer");
    expect(publicBlock).not.toContain("requireSolarisCapabilityServer");
    expect(status).toContain("return { votingReady, adminReady };");
  });

  it("fails the privileged readiness probe closed to false", () => {
    const adminStart = status.indexOf("async function checkAdminBackend()");
    const exportStart = status.indexOf(
      "export const getMergedTelevotingServerStatus",
    );
    const adminBlock = status.slice(adminStart, exportStart);

    expect(adminBlock).toContain("} catch {");
    expect(adminBlock).toContain("return false;");
  });
});
