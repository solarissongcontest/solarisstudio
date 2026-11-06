import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(file, "utf8");
const functions = source("src/integrations/televoting/entries.functions.ts");
const solarisSyncAdapter = source("src/integrations/televoting/solaris-sync.functions.ts");
const legacyServer = source("src/integrations/televoting/entries.server.ts");
const routeMap = source("src/lib/permission-route-map.ts");

function exportBody(name: string) {
  const start = functions.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const next = functions.indexOf("\nexport const ", start + 1);
  return functions.slice(start, next < 0 ? undefined : next);
}

describe("Organizer Televoting round-entry adapter authorization", () => {
  it("checks global voting.read before importing its privileged reader", () => {
    const code = exportBody("getMergedRoundEntries");
    const check = code.indexOf('await requireVotingCapability("voting.read")');
    const engine = code.indexOf('"@/integrations/televoting/entries.server"');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(engine).toBeGreaterThan(check);
    expect(routeMap).toContain('"voting.read"');
  });

  it.each([
    "saveMergedRoundCountries",
    "saveMergedCustomRoundEntry",
    "deleteMergedCustomRoundEntry",
    "reorderMergedRoundEntries",
    "setMergedRoundSelfVotingMode",
  ])("checks global voting.manage before importing the privileged %s writer", (name) => {
    const code = exportBody(name);
    const check = code.indexOf('await requireVotingCapability("voting.manage")');
    const engine = code.indexOf('"@/integrations/televoting/entries.server"');
    expect(check).toBeGreaterThanOrEqual(0);
    expect(engine).toBeGreaterThan(check);
  });

  it("uses one shared lazy request-boundary capability guard, not legacy Organizer presence", () => {
    expect(functions).toContain('requireSolarisCapabilityServer(capability, null)');
    expect(functions).toContain('"@/integrations/supabase/capabilities.server"');
    expect(functions).not.toContain("requireMergedTelevotingAdminServer");
    expect(functions).not.toContain('import { requireSolarisCapabilityServer }');
  });

  it("preserves input bounds while keeping ungoverned legacy writers explicit as debt", () => {
    expect(functions).toContain("data.countryCodes.length > 50");
    expect(functions).toContain('throw new Error("Duplicate entry in order")');
    expect(functions).toContain('throw new Error("Invalid self-voting mode")');
    expect(legacyServer).toContain("requireMergedTelevotingAdminServer");
    expect(legacyServer).toContain('.from("round_entries")');
    expect(legacyServer).toContain(".insert(");
    expect(legacyServer).toContain(".update(");
    expect(legacyServer).toContain(".delete(");
    expect(functions).not.toContain("operationId");
    expect(functions).not.toContain("idempotencyKey");
  });
  it("preflights voting.read before importing the private Solaris source reader", () => {
    const start = solarisSyncAdapter.indexOf("export const getMergedRoundSolarisSource =");
    const end = solarisSyncAdapter.indexOf("export const syncMergedRoundFromSolaris =", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const code = solarisSyncAdapter.slice(start, end);
    const guard = code.indexOf('await requireSolarisCapabilityServer("voting.read", null)');
    const privilegedImport = code.indexOf('"@/integrations/televoting/solaris-sync.server"');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(privilegedImport).toBeGreaterThan(guard);
  });

  it("preflights voting.manage before loading the cross-edition Solaris line-up sync writer", () => {
    const start = solarisSyncAdapter.indexOf("export const syncMergedRoundFromSolaris =");
    expect(start).toBeGreaterThanOrEqual(0);
    const code = solarisSyncAdapter.slice(start);
    const guard = code.indexOf('await requireSolarisCapabilityServer("voting.manage", null)');
    const privilegedImport = code.indexOf('"@/integrations/televoting/solaris-sync.server"');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(privilegedImport).toBeGreaterThan(guard);
  });

});
