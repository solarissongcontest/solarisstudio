import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const functions = readFileSync(
  "src/integrations/televoting/entries.functions.ts",
  "utf8",
);
const server = readFileSync(
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
    expect(serverImport).toBeGreaterThan(capability);
  });

  it.each([
    "saveMergedRoundCountries",
    "saveMergedCustomRoundEntry",
    "deleteMergedCustomRoundEntry",
    "reorderMergedRoundEntries",
    "setMergedRoundSelfVotingMode",
  ])("requires voting.manage before %s can load the privileged writer", (exportName) => {
    const body = exportBody(exportName);
    const capability = body.indexOf('await requireVotingCapability("voting.manage")');
    const writerImport = body.indexOf('"@/integrations/televoting/entries.server"');
    expect(capability).toBeGreaterThan(-1);
    expect(writerImport).toBeGreaterThan(capability);
  });

  it("keeps canonical capability resolution lazy at the request boundary", () => {
    expect(functions).toContain('requireSolarisCapabilityServer(capability)');
    expect(functions).toContain('"@/integrations/supabase/capabilities.server"');
    expect(functions).not.toContain(
      'import { requireSolarisCapabilityServer } from "@/integrations/supabase/capabilities.server"',
    );
  });

  it("preserves the current round operation envelope and optimistic revision binding", () => {
    expect(functions).toContain("expectedRoundVersion?: number");
    expect(functions).toContain("operationId?: string");
    expect(functions).toContain("idempotencyKey?: string");
    expect(functions).toContain("operationId: data.operationId || crypto.randomUUID()");
    expect(functions).toContain("idempotencyKey: data.idempotencyKey || crypto.randomUUID()");
    expect(server).toContain('televotingAdmin.rpc("v3_configure_round"');
    expect(server).toContain("p_expected_round_version: snapshot.version");
    expect(server).toContain("p_operation_id: operationId");
    expect(server).toContain("p_idempotency_key: idempotencyKey");
    expect(server).toContain("p_correlation_id: operationId");
  });

  it("keeps all five configuration actions behind the governed round command", () => {
    for (const action of [
      '"replace_countries"',
      '"save_custom"',
      '"delete_custom"',
      '"reorder"',
      '"set_self_voting"',
    ]) {
      expect(server).toContain(action);
    }
  });
});
