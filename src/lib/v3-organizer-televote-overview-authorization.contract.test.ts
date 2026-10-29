import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const overview = readFileSync(
  "src/integrations/televoting/admin-data.functions.ts",
  "utf8",
);
const routeCapabilities = readFileSync("src/lib/permission-route-map.ts", "utf8");

describe("Organizer Televoting overview authorization", () => {
  it("keeps /televoting/admin owned by voting.read", () => {
    expect(routeCapabilities).toContain('["/televoting/admin"]');
    expect(routeCapabilities).toContain('"voting.read"');
  });

  it("uses the caller-authenticated permission engine with exact requested edition scope", () => {
    expect(overview).toContain("createSolarisAuthenticatedClientServer");
    expect(overview).toContain('rpc(\n      "studio2_access_allowed"');
    expect(overview).toContain('p_capability: "voting.read"');
    expect(overview).toContain("p_edition_id: data.editionId");
    expect(overview).toContain("p_strict_before_cutover: false");
    expect(overview).toContain("if (allowed !== true)");
  });

  it("proves voting.read before privileged Televoting authority is loaded", () => {
    const authorizationIndex = overview.indexOf('"studio2_access_allowed"');
    const privilegedImportIndex = overview.indexOf(
      'import(\n      "@/integrations/televoting/client.server"',
    );
    const privateReadIndex = overview.indexOf('"admin_overview_summary"');

    expect(authorizationIndex).toBeGreaterThanOrEqual(0);
    expect(privilegedImportIndex).toBeGreaterThanOrEqual(0);
    expect(privateReadIndex).toBeGreaterThanOrEqual(0);
    expect(authorizationIndex).toBeLessThan(privilegedImportIndex);
    expect(privilegedImportIndex).toBeLessThan(privateReadIndex);
    expect(overview).not.toContain("requireMergedTelevotingAdminServer");
  });
});
