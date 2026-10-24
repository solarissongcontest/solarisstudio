import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const functions = readFileSync(
  "src/integrations/televoting/editions.functions.ts",
  "utf8",
);
const legacyServer = readFileSync(
  "src/integrations/televoting/editions.server.ts",
  "utf8",
);
const routeMap = readFileSync("src/lib/permission-route-map.ts", "utf8");

function exportBody(source: string, exportName: string) {
  const start = source.indexOf(`export const ${exportName}`);
  if (start < 0) throw new Error(`Missing ${exportName}`);
  const next = source.indexOf("\nexport const ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

function serverFunctionBody(exportName: string) {
  const start = legacyServer.indexOf(`export async function ${exportName}`);
  if (start < 0) throw new Error(`Missing ${exportName}`);
  const next = legacyServer.indexOf("\nexport async function ", start + 1);
  return legacyServer.slice(start, next < 0 ? legacyServer.length : next);
}

describe("V3 Organizer Televoting edition administration authorization", () => {
  it("matches the canonical voting.read route boundary for edition reads", () => {
    expect(routeMap).toContain('rule(["/televoting/admin"], "voting.read")');
    const body = exportBody(functions, "listMergedTelevotingEditions");
    expect(body).toContain('await requireVotingCapability("voting.read")');
    expect(body.indexOf('await requireVotingCapability("voting.read")'))
      .toBeLessThan(body.indexOf('import(\n    "@/integrations/televoting/editions.server"'));

    const serverBody = serverFunctionBody("listMergedTelevotingEditionsServer");
    expect(serverBody).toContain('await requireSolarisCapabilityServer("voting.read")');
    expect(serverBody.indexOf('await requireSolarisCapabilityServer("voting.read")'))
      .toBeLessThan(serverBody.indexOf("await requireMergedTelevotingAdminServer()"));
  });

  it.each([
    ["createMergedTelevotingEdition", "createMergedTelevotingEditionServer"],
    ["renameMergedTelevotingEdition", "renameMergedTelevotingEditionServer"],
    ["activateMergedTelevotingEdition", "activateMergedTelevotingEditionServer"],
    ["archiveMergedTelevotingEdition", "archiveMergedTelevotingEditionServer"],
  ])("requires voting.manage before %s can load or execute its legacy writer", (exportName, serverName) => {
    const body = exportBody(functions, exportName);
    const capability = body.indexOf('await requireVotingCapability("voting.manage")');
    const writerImport = body.indexOf('"@/integrations/televoting/editions.server"');
    expect(capability).toBeGreaterThan(-1);
    expect(writerImport).toBeGreaterThan(-1);
    expect(capability).toBeLessThan(writerImport);

    const serverBody = serverFunctionBody(serverName);
    const serverCapability = serverBody.indexOf(
      'await requireSolarisCapabilityServer("voting.manage")',
    );
    const broadCompatibility = serverBody.indexOf(
      "await requireMergedTelevotingAdminServer()",
    );
    expect(serverCapability).toBeGreaterThan(-1);
    expect(broadCompatibility).toBeGreaterThan(-1);
    expect(serverCapability).toBeLessThan(broadCompatibility);
  });

  it("keeps the trusted capability helper lazy at the request boundary", () => {
    expect(functions).toContain('requireSolarisCapabilityServer(capability)');
    expect(functions).toContain('import(\n    "@/integrations/supabase/capabilities.server"');
    expect(functions).not.toContain(
      'import { requireSolarisCapabilityServer } from "@/integrations/supabase/capabilities.server"',
    );
  });

  it("does not pretend the remaining legacy direct-write server is a canonical V3 command", () => {
    expect(legacyServer).toContain("requireMergedTelevotingAdminServer");
    expect(legacyServer).toContain('.from("editions")');
    expect(legacyServer).toContain(".insert(");
    expect(legacyServer).toContain(".update(");
    expect(functions).not.toContain("operationId");
    expect(functions).not.toContain("idempotencyKey");
  });
});