import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { releaseEvidenceConsistencyFailure } from "../../scripts/v3-release-evidence-consistency";

const completeS15Inventory = {
  systemDomains: 39, systemConcepts: 50, systemCommands: 75, systemEvents: 60,
  systemProjections: 28, systemBackgroundConsumers: 5, domainConsequences: 17,
  apiCapabilities: 12, searchProviders: 7, notificationCategories: 9,
  notificationProviders: 10, notificationDeepLinks: 14, dynamicNotificationDeepLinks: 2,
  publicCapabilities: 43, organizerCapabilities: 70,
  runtimeRoutes: 80, publicRuntimeRoutes: 60, organizerRuntimeRoutes: 14, apiRuntimeRoutes: 6,
  legacyAliases: 150, v3FeatureFlags: 3, organizerControls: 35, publicSourceSurfaces: 40,
  v3IntegrationAdapters: 7, edgeFunctions: 15, scheduledJobs: 3,
  physicalOwnershipDomains: 32, uniquePhysicalTables: 140,
  domainTableAssignments: 154, explicitlySharedTables: 4,
};

const s15 = {
  schemaVersion: 4,
  inventory: completeS15Inventory,
  candidateSha: "a".repeat(40),
  zeroOrphans: true,
  findings: [],
  physicalOwnership: { zeroOwnershipConflicts: true, findings: [] },
};

const security = {
  schemaVersion: 1,
  projectRef: "local-fixture",
  candidateSha: "a".repeat(40),
  releaseReady: true,
  counts: { findings: 1, info: 0, warn: 1, error: 0, intentionalAndProven: 0, remediated: 1, releaseBlocking: 0 },
  findings: [{ id: "advisor-1", title: "Fixture finding", level: "WARN", disposition: { id: "advisor-1", status: "remediated", evidenceRef: "local-test-proof", reason: "Regression fixture" } }],
};

describe("S16 release evidence consistency", () => {
  it("accepts coherent S15 and security evidence", () => {
    expect(releaseEvidenceConsistencyFailure("s15-zero-orphan.json", s15)).toBeNull();
    expect(
      releaseEvidenceConsistencyFailure("security-advisor-classification.json", security),
    ).toBeNull();
  });

  it("rejects zero-orphan certification with unresolved findings", () => {
    expect(
      releaseEvidenceConsistencyFailure("s15-zero-orphan.json", {
        ...s15,
        findings: ["SYSTEM_COMMAND_ORPHAN: test"],
      }),
    ).toMatch(/empty findings/);
  });

  it("fails closed on missing S15 diagnostics and physical-owner conflicts", () => {
    expect(
      releaseEvidenceConsistencyFailure("s15-zero-orphan.json", {
        ...s15,
        findings: undefined,
      }),
    ).toMatch(/empty findings/);
    expect(
      releaseEvidenceConsistencyFailure("s15-zero-orphan.json", {
        ...s15,
        physicalOwnership: { zeroOwnershipConflicts: false },
      }),
    ).toMatch(/physical ownership/);
    expect(
      releaseEvidenceConsistencyFailure("s15-zero-orphan.json", {
        ...s15,
        physicalOwnership: undefined,
      }),
    ).toMatch(/physical ownership/);
  });

  it("rejects pruned, fabricated or inconsistent S15 zero-orphan inventory", () => {
    for (const inventory of [
      {},
      { ...completeS15Inventory, systemDomains: undefined },
      { ...completeS15Inventory, publicCapabilities: 0 },
      { ...completeS15Inventory, uniquePhysicalTables: null },
      { ...completeS15Inventory, apiCapabilities: -1 },
      { ...completeS15Inventory, scheduledJobs: 0.5 },
      { ...completeS15Inventory, runtimeRoutes: 79 },
      { ...completeS15Inventory, dynamicNotificationDeepLinks: 15 },
      { ...completeS15Inventory, domainTableAssignments: 139 },
    ]) {
      expect(
        releaseEvidenceConsistencyFailure("s15-zero-orphan.json", { ...s15, inventory }),
      ).toMatch(/complete S15 domain, route and physical inventory/);
    }
  });

  it("rejects security-ready reports carrying classified release blockers", () => {
    expect(
      releaseEvidenceConsistencyFailure("security-advisor-classification.json", {
        ...security,
        counts: { ...security.counts, remediated: 0, releaseBlocking: 1 },
        findings: [{ ...security.findings[0], disposition: { ...security.findings[0].disposition, status: "release-blocking" } }],
      }),
    ).toMatch(/invalid classification contract/);
  });

  it("does not trust fabricated zero blocking counts when a finding is blocked", () => {
    expect(
      releaseEvidenceConsistencyFailure("security-advisor-classification.json", {
        ...security,
        findings: [{ ...security.findings[0], disposition: { ...security.findings[0].disposition, status: "release-blocking" } }],
      }),
    ).toMatch(/unproven, duplicated or unclassified finding/);
  });

  it("rejects absent dispositions and mismatched finding counts", () => {
    expect(
      releaseEvidenceConsistencyFailure("security-advisor-classification.json", {
        ...security,
        findings: [{ ...security.findings[0], disposition: undefined }],
      }),
    ).toMatch(/unproven, duplicated or unclassified finding/);
    expect(
      releaseEvidenceConsistencyFailure("security-advisor-classification.json", {
        ...security,
        counts: { ...security.counts, findings: 0, warn: 0, remediated: 0 },
      }),
    ).toMatch(/inconsistent finding and disposition counts/);
    expect(
      releaseEvidenceConsistencyFailure("security-advisor-classification.json", {
        ...security,
        counts: undefined,
      }),
    ).toMatch(/invalid classification contract/);
  });

  it("does not classify negative/invalid counters as reliable evidence", () => {
    expect(
      releaseEvidenceConsistencyFailure("security-advisor-classification.json", {
        ...security,
        counts: { ...security.counts, findings: -1 },
      }),
    ).toMatch(/invalid classification contract/);
  });

  it("is invoked by the production release checker rather than only the tests", () => {
    const checker = readFileSync("scripts/check-v3-release-integrity.ts", "utf8");
    expect(checker).toContain('import { releaseEvidenceConsistencyFailure } from "./v3-release-evidence-consistency"');
    expect(checker).toContain("releaseEvidenceConsistencyFailure(filename, evidence)");
    expect(checker).toContain("if (consistencyFailure) blockers.push(consistencyFailure)");
  });
});
