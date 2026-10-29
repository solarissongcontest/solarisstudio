import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const functions = readFileSync(
  "src/integrations/televoting/entries.functions.ts",
  "utf8",
);
const legacyServer = readFileSync(
  "src/integrations/televoting/entries.server.ts",
  "utf8",
);
const routeMap = readFileSync("src/lib/permission-route-map.ts", "utf8");

function exportBody(exportName: string) {
  const start = functions.indexOf(`export const ${exportName}`);
  if (start < 0) throw new Error(`Missing ${exportName}`);
  const next = functions.indexOf("\nexport const ", start + 1);
  return functions.slice(start, next < 0 ? functions.length : next);
}

describe("V3 Organizer Televoting round-entry authorization", () => {
  it("requires voting.read before loading the privileged round-entry projection", () => {
    expect(routeMap).toContain('rule(["/televoting/admin"], "voting.read")');
    const body = exportBody("getMergedRoundEntries");
    const capability = body.indexOf('await requireVotingCapability("voting.read")');
    const serverImport = body.indexOf('"@/integrations/televoting/entries.server"');
    expect(capability).toBeGreaterThan(-1);
    expect(serverImport).toBeGreaterThan(-1);
    expect(capability).toBeLessThan(serverImport);
  });

  it.each([
    "saveMergedRoundCountries",
    "saveMergedCustomRoundEntry",
    "deleteMergedCustomRoundEntry",
    "reorderMergedRoundEntries",
    "setMergedRoundSelfVotingMode",
  ])("requires voting.manage before %s can load a legacy writer", (exportName) => {
    const body = exportBody(exportName);
    const capability = body.indexOf('await requireVotingCapability("voting.manage")');
    const writerImport = body.indexOf('"@/integrations/televoting/entries.server"');
    expect(capability).toBeGreaterThan(-1);
    expect(writerImport).toBeGreaterThan(-1);
    expect(capability).toBeLessThan(writerImport);
  });

  it("keeps the canonical capability helper lazy at the request boundary", () => {
    expect(functions).toContain('requireSolarisCapabilityServer(capability)');
    expect(functions).toContain('"@/integrations/supabase/capabilities.server"');
    expect(functions).not.toContain(
      'import { requireSolarisCapabilityServer } from "@/integrations/supabase/capabilities.server"',
    );
  });

  it("keeps the unresolved direct-write command debt explicit", () => {
    expect(legacyServer).toContain("requireMergedTelevotingAdminServer");
    expect(legacyServer).toContain('.from("round_entries")');
    expect(legacyServer).toContain(".insert(");
    expect(legacyServer).toContain(".update(");
    expect(legacyServer).toContain(".delete(");
    expect(functions).not.toContain("operationId");
    expect(functions).not.toContain("idempotencyKey");
  });
});