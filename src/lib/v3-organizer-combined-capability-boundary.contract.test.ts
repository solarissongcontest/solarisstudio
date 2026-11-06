import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adapter = readFileSync("src/integrations/televoting/combined.functions.ts", "utf8");
const legacyServer = readFileSync("src/integrations/televoting/combined.server.ts", "utf8");

const READ_ACTIONS = ["listMergedCombinedAggregations", "getMergedCombinedAggregation"] as const;
const WRITE_ACTIONS = [
  "createMergedCombinedAggregation",
  "updateMergedCombinedAggregation",
  "setMergedCombinedParticipants",
  "upsertMergedCombinedSource",
  "deleteMergedCombinedSource",
  "saveMergedCombinedSourceValues",
  "recalculateMergedCombined",
  "setMergedCombinedStatus",
  "deleteMergedCombinedAggregation",
] as const;

function actionBody(name: string) {
  const start = adapter.indexOf(`export const ${name} =`);
  if (start < 0) throw new Error(`Missing Combined Results adapter ${name}`);
  const next = adapter.indexOf("\nexport const ", start + 1);
  return adapter.slice(start, next < 0 ? undefined : next);
}

describe("Organizer Combined Results global capability preflight", () => {
  it("uses one lazy server-side capability check with no legacy Organizer-presence substitute", () => {
    expect(adapter).toContain('requireSolarisCapabilityServer(capability, null)');
    expect(adapter).toContain('"@/integrations/supabase/capabilities.server"');
    expect(adapter).not.toContain('import { requireSolarisCapabilityServer }');
  });

  it.each(READ_ACTIONS)("requires voting.read before importing privileged %s reader", (name) => {
    const body = actionBody(name);
    const guard = body.indexOf('await requireCombinedCapability("voting.read")');
    const privileged = body.indexOf('"@/integrations/televoting/combined.server"');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(privileged).toBeGreaterThan(guard);
  });

  it.each(WRITE_ACTIONS)("requires voting.manage before every side effect in %s", (name) => {
    const body = actionBody(name);
    const guard = body.indexOf('await requireCombinedCapability("voting.manage")');
    const privileged = body.indexOf('"@/integrations/televoting/combined.server"');
    const sync = body.indexOf("await refreshCombinedCanonicalParticipants");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(privileged).toBeGreaterThan(guard);
    if (sync >= 0) expect(sync).toBeGreaterThan(guard);
  });

  it("rejects NaN, infinity and invalid point pools or rank exponents before privileged writes", () => {
    expect(adapter).toContain("function boundedCombinedPointPool(value: unknown)");
    expect(adapter).toContain("Number.isSafeInteger(integralPoints)");
    expect(adapter).toContain('throw new Error("Invalid Combined Results point pool")');
    expect(adapter).toContain("function boundedCombinedRankExponent(value: unknown)");
    expect(adapter).toContain('throw new Error("Invalid Combined Results rank exponent")');
    expect(adapter.split("boundedCombinedPointPool(data.totalPoints)").length - 1).toBe(2);
    expect(adapter.split("boundedCombinedRankExponent(data.rankExponent)").length - 1).toBe(2);
  });

  it("requires canonical edition binding for protected detail and aggregation creation", () => {
    expect(adapter).toContain("getMergedCombinedAggregationServer(data.id, data.editionId)");
    expect(adapter).toContain("Combined detail requires an exact Solaris edition");
    expect(adapter).toContain("Combined creation requires an exact Solaris edition");
    expect(legacyServer).toContain("resolveLinkedCombinedRemoteEditionId(data.editionId)");
    expect(legacyServer).toContain("Combined result not found in selected Organizer edition");
  });

  it("retains truthful System S16 writer debt instead of mislabeling the adapter as canonical", () => {
    expect(legacyServer).toContain('from("televote_aggregations")');
    expect(legacyServer).toContain('requireMergedTelevotingAdminServer');
    expect(adapter).not.toContain("expectedAggregationVersion");
    expect(adapter).not.toContain("idempotencyKey");
    expect(adapter).not.toContain("operationId");
  });
});
