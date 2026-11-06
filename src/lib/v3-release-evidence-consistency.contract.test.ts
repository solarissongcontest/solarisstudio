import { describe, expect, it } from "vitest";
import { releaseEvidenceConsistencyFailure as check } from "../../scripts/v3-release-evidence-consistency";

const SHA = "a".repeat(40);

function fullContestEvidence() {
  return {
    candidateSha: SHA,
    passed: true,
    partial: false,
    runtimeFailure: false,
    completedStages: [
      "stage-1-setup",
      "stage-2-delegation-onboarding",
      "stage-3-confirmations",
      "stage-4-entries",
      "stage-5-running-orders",
      "stage-6-jury",
      "stage-7-public-voting",
      "stage-8-results",
      "stage-9-publication",
      "stage-10-archive",
    ],
    pendingStages: [],
    completedContestExtensions: [
      "grand-final-qualifier-bridge",
      "grand-final-voting",
      "grand-final-results",
      "grand-final-publication",
    ],
    pendingContestExtensions: [],
    blockedContestExtensions: [],
    implementedInvariants: [
      "confirmation-no-effective-duplicates",
      "entry-valid-revision",
      "media-accepted-revision",
      "jury-single-final-ballot",
      "televote-canonical-ballot",
      "result-reproducible",
      "publication-final-version",
      "tasks-canonical",
      "notifications-reconcilable",
    ],
    implementedFailureInjections: [
      "network-after-commit",
      "db-timeout-before-commit",
      "duplicate-request",
      "worker-crash",
      "realtime-disconnect",
      "stale-client",
      "two-organizers",
      "supabase-outage",
    ],
    seed: { editionCount: 1, delegationCount: 66, showCount: 3 },
    runIdentity: { candidateSha: SHA, editionId: "edition-1", databaseFingerprint: "local-db-1" },
    lifecycle: { finalState: "archived" },
  };
}

function securityEvidence() {
  return {
    schemaVersion: 1,
    candidateSha: SHA,
    projectRef: "example-project",
    releaseReady: true,
    counts: {
      findings: 2,
      info: 0,
      warn: 1,
      error: 1,
      intentionalAndProven: 1,
      remediated: 1,
      releaseBlocking: 0,
    },
    findings: [
      {
        id: "advisory-1",
        level: "WARN",
        title: "First advisory",
        disposition: {
          id: "advisory-1",
          status: "remediated",
          evidenceRef: "verified-fix-1",
          reason: "Fixed",
        },
      },
      {
        id: "advisory-2",
        level: "ERROR",
        title: "Second advisory",
        disposition: {
          id: "advisory-2",
          status: "intentional-and-proven",
          evidenceRef: "verified-proof-2",
          reason: "Reviewed",
        },
      },
    ],
  };
}

describe("V3 release evidence truthfulness", () => {
  it("accepts a complete S14 candidate but not a success flag alone", () => {
    const complete = fullContestEvidence();
    expect(check("s14-full-contest.json", complete)).toBeNull();
    expect(check("s14-full-contest.json", { candidateSha: SHA, passed: true })).not.toBeNull();
  });

  it("rejects S14 partial, truncated, pending, and non-archived success claims", () => {
    const valid = fullContestEvidence();
    const invalid = [
      { partial: true },
      { runtimeFailure: true },
      { completedStages: valid.completedStages.slice(0, -1) },
      { pendingStages: ["stage-10-archive"] },
      { completedContestExtensions: valid.completedContestExtensions.slice(1) },
      { pendingContestExtensions: ["grand-final-results"] },
      { blockedContestExtensions: ["grand-final-publication"] },
      { implementedInvariants: valid.implementedInvariants.slice(1) },
      { implementedFailureInjections: valid.implementedFailureInjections.slice(1) },
      { seed: { editionCount: 1, delegationCount: 65, showCount: 3 } },
      { runIdentity: { ...valid.runIdentity, candidateSha: "b".repeat(40) } },
      { lifecycle: { finalState: "completed" } },
    ];
    for (const change of invalid) {
      expect(check("s14-full-contest.json", { ...valid, ...change })).not.toBeNull();
    }
  });

  it("requires the complete physical S15 zero-orphan evidence contract", () => {
    const valid = {
      schemaVersion: 4,
      candidateSha: SHA,
      zeroOrphans: true,
      inventory: { domains: 1 },
      findings: [],
      physicalOwnership: { zeroOwnershipConflicts: true, findings: [] },
    };
    expect(check("s15-zero-orphan.json", valid)).toBeNull();
    for (const change of [
      { schemaVersion: 3 },
      { inventory: null },
      { findings: ["unresolved"] },
      { physicalOwnership: { zeroOwnershipConflicts: false } },
      { physicalOwnership: null },
    ]) {
      expect(check("s15-zero-orphan.json", { ...valid, ...change })).not.toBeNull();
    }
  });

  it("rejects an S15 physical-owner success flag contradicted by nested diagnostics", () => {
    const valid = {
      schemaVersion: 4, inventory: {}, zeroOrphans: true, findings: [],
      physicalOwnership: { zeroOwnershipConflicts: true, findings: [] },
    };
    expect(check("s15-zero-orphan.json", valid)).toBeNull();
    expect(check("s15-zero-orphan.json", {
      ...valid, physicalOwnership: { zeroOwnershipConflicts: true, schemaVersion: 1 },
    })).toBeNull();
    for (const findings of [null, ["unregistered canonical owner"]]) {
      expect(check("s15-zero-orphan.json", {
        ...valid,
        physicalOwnership: { zeroOwnershipConflicts: true, findings },
      })).not.toBeNull();
    }
  });

  it("requires all classified security findings and exact count distributions", () => {
    const valid = securityEvidence();
    expect(check("security-advisor-classification.json", valid)).toBeNull();
    for (const change of [
      { schemaVersion: 2 },
      { projectRef: "" },
      { counts: { ...valid.counts, info: 1 } },
      { counts: { ...valid.counts, remediated: 2 } },
      { counts: { ...valid.counts, releaseBlocking: 1 } },
      { findings: [valid.findings[0], valid.findings[0]] },
      {
        findings: [
          {
            ...valid.findings[0],
            disposition: { ...valid.findings[0].disposition, evidenceRef: "" },
          },
          valid.findings[1],
        ],
      },
    ]) {
      expect(check("security-advisor-classification.json", { ...valid, ...change })).not.toBeNull();
    }
  });


  it("rejects bare, partial, stale, or duplicated S16 certification success flags", () => {
    const categoryFiles = [
      ["canonical-ci", "s16-canonical-ci.json"],
      ["migration-rehearsal", "s16-migration-rehearsal.json"],
      ["authorization-security", "s16-authorization-security.json"],
      ["production-isolation", "s16-production-isolation.json"],
      ["system-hardening", "s16-system-hardening.json"],
      ["public-acceptance", "s16-public-acceptance.json"],
      ["organizer-acceptance", "s16-organizer-acceptance.json"],
      ["navigation-acceptance", "s16-navigation-acceptance.json"],
      ["accessibility", "s16-accessibility.json"],
      ["responsive-behavior", "s16-responsive-behavior.json"],
      ["full-contest-rehearsal", "s14-full-contest.json"],
      ["registry-zero-gap", "s15-zero-orphan.json"],
    ] as const;
    const valid = {
      schemaVersion: 1,
      candidateSha: SHA,
      certified: true,
      categories: categoryFiles.map(([id, evidenceFilename]) => ({
        id, evidenceFilename, passed: true, evidenceCandidateSha: SHA,
      })),
    };
    expect(check("s16-certification.json", valid)).toBeNull();
    expect(check("s16-certification.json", { certified: true, candidateSha: SHA })).not.toBeNull();
    for (const change of [
      { schemaVersion: 2 },
      { categories: valid.categories.slice(0, -1) },
      { categories: [...valid.categories.slice(0, -1), valid.categories[0]] },
      { categories: valid.categories.map((item, index) =>
          index === 0 ? { ...item, passed: false } : item) },
      { categories: valid.categories.map((item, index) =>
          index === 0 ? { ...item, evidenceCandidateSha: "b".repeat(40) } : item) },
      { categories: valid.categories.map((item, index) =>
          index === 0 ? { ...item, evidenceFilename: "unrelated.json" } : item) },
    ]) {
      expect(check("s16-certification.json", { ...valid, ...change })).not.toBeNull();
    }
  });

  it("does not interpret failed rehearsal or blocked advisory as passing evidence", () => {
    // The release guard separately requires the success boolean; this function
    // checks consistency of affirmative claims rather than granting success.
    expect(check("s14-full-contest.json", { passed: false, partial: true })).toBeNull();
    expect(check("security-advisor-classification.json", { releaseReady: false })).toBeNull();
  });
});
