import { describe, expect, it } from "vitest";
import { buildV3CapabilityGapInventory } from "./v3-capability-gap-inventory";

function fixture() {
  return {
    publicCapabilities: [
      {
        id: "published-country", specificationStatus: "cutover" as const,
        targetArea: "explore" as const, targetRoute: "/countries",
        backendOwners: ["country"], acceptanceScenarioId: "public.published-country",
      },
      {
        id: "entry-workflow", specificationStatus: "building" as const,
        targetArea: "participate" as const, targetRoute: "/participate",
        backendOwners: ["media", "entry"], acceptanceScenarioId: "public.entry-submit",
      },
      {
        id: "legacy-retired", specificationStatus: "retired" as const,
        targetArea: "contextual" as const, targetRoute: "/legacy",
        backendOwners: ["public-ux"], acceptanceScenarioId: "public.retired",
      },
    ],
    organizerCapabilities: [
      {
        legacyId: "results", migrationStatus: "parity" as const,
        targetDomain: "results", targetRoute: "/organizer/results", ownerCapability: "results-publication",
      },
      {
        legacyId: "archive", migrationStatus: "cutover" as const,
        targetDomain: "archive", targetRoute: "/organizer/archive", ownerCapability: "archive",
      },
    ],
    consequences: [
      { eventType: "entry.submitted", ownerDomain: "entry", implementationState: "declared" as const },
      { eventType: "notice.published", ownerDomain: "notice", implementationState: "event-backed" as const },
    ],
    systemDomains: [
      { domain: "entry", authoritativeService: "entry-command", physicalAuditStatus: "pending" as const },
      { domain: "notice", authoritativeService: "notice-command", physicalAuditStatus: "verified" as const },
    ],
  };
}

describe("V3 exact-source capability gap inventory", () => {
  it("lists only real unfinished capability IDs and preserves actionable ownership fields", () => {
    const report = buildV3CapabilityGapInventory(fixture());
    expect(report.schemaVersion).toBe(1);
    expect(report.source).toBe("canonical-v3-source-registries");
    expect(report.scanned).toEqual({
      publicCapabilities: 3, organizerCapabilities: 2, consequences: 2, systemDomains: 2,
    });
    expect(report.unresolved.publicCapabilities).toEqual([{
      id: "entry-workflow", status: "building", targetArea: "participate",
      targetRoute: "/participate", backendOwners: ["entry", "media"],
      acceptanceScenarioId: "public.entry-submit", hasMigrationEvidenceReference: false,
    }]);
    expect(report.unresolved.organizerCapabilities).toEqual([{
      id: "results", status: "parity", targetDomain: "results",
      targetRoute: "/organizer/results", ownerCapability: "results-publication",
    }]);
    expect(report.unresolved.consequences).toEqual([
      { eventType: "entry.submitted", ownerDomain: "entry", state: "declared" },
    ]);
    expect(report.unresolved.physicalOwnership).toEqual([
      { domain: "entry", authoritativeService: "entry-command", status: "pending" },
    ]);
    for (const ids of Object.values(report.duplicateIdentifiers)) expect(ids).toEqual([]);
  });

  it("emits a stable sorted queue independent of registry ordering", () => {
    const input = fixture();
    input.publicCapabilities.push({
      id: "auth-account", specificationStatus: "building", targetArea: "me",
      targetRoute: "/me", backendOwners: ["account"], acceptanceScenarioId: "public.account",
    });
    const first = buildV3CapabilityGapInventory(input);
    const second = buildV3CapabilityGapInventory({
      ...input,
      publicCapabilities: [...input.publicCapabilities].reverse(),
      organizerCapabilities: [...input.organizerCapabilities].reverse(),
      consequences: [...input.consequences].reverse(),
      systemDomains: [...input.systemDomains].reverse(),
    });
    expect(second).toEqual(first);
    expect(first.unresolved.publicCapabilities.map(x => x.id)).toEqual(["auth-account", "entry-workflow"]);
    expect(input.publicCapabilities[1].backendOwners).toEqual(["media", "entry"]);
  });

  it("reports duplicate registry IDs rather than silently losing rows", () => {
    const input = fixture();
    input.organizerCapabilities.push({ ...input.organizerCapabilities[0] });
    input.consequences.push({ ...input.consequences[0] });
    const report = buildV3CapabilityGapInventory(input);
    expect(report.duplicateIdentifiers.organizerCapabilities).toEqual(["results"]);
    expect(report.duplicateIdentifiers.consequences).toEqual(["entry.submitted"]);
    expect(report.unresolved.organizerCapabilities).toHaveLength(2);
    expect(report.unresolved.consequences).toHaveLength(2);
  });

  it("tracks migration evidence references without pretending they prove acceptance", () => {
    const input = fixture();
    input.publicCapabilities[1].migrationEvidence = "Source PR reference, not a completed browser check";
    const report = buildV3CapabilityGapInventory(input);
    expect(report.unresolved.publicCapabilities[0].hasMigrationEvidenceReference).toBe(true);
    expect(report.caution).toMatch(/not independent functional/);
  });
});
