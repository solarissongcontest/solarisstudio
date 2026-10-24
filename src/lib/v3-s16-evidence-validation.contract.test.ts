import { describe, expect, it } from "vitest";
import {
  V3_S14_FAILURE_INJECTIONS,
  V3_S14_INVARIANTS,
  V3_S14_SEED_CONTRACT,
  V3_S14_STAGES,
} from "../../scripts/v3-s14-full-contest-spec";
import { validateV3S16CategorySourceEvidence } from "./v3-s16-evidence-validation";

const SHA = "a".repeat(40);
const GRAND_FINAL_EXTENSIONS = [
  "grand-final-qualifier-bridge",
  "grand-final-voting",
  "grand-final-results",
  "grand-final-publication",
];

function coreEvidence(workflow: string) {
  return {
    schemaVersion: 1,
    candidateSha: SHA,
    passed: true,
    provenance: {
      workflow,
      runId: 123,
      runAttempt: 1,
      conclusion: "success",
    },
  };
}

function productionIsolationEvidence() {
  return {
    ...coreEvidence("Quality"),
    guard: {
      workflowPath: ".github/workflows/ci.yml",
      scriptPath: "scripts/check-v3-production-isolation.ts",
      invocationVerified: true,
    },
  };
}

function completeS14Evidence() {
  return {
    schemaVersion: 2,
    candidateSha: SHA,
    passed: true,
    partial: false,
    runtimeFailure: false,
    completedStages: V3_S14_STAGES.map((item) => item.id),
    pendingStages: [],
    completedContestExtensions: [...GRAND_FINAL_EXTENSIONS],
    pendingContestExtensions: [],
    blockedContestExtensions: [],
    implementedInvariants: V3_S14_INVARIANTS.map((item) => item.id),
    implementedFailureInjections: V3_S14_FAILURE_INJECTIONS.map((item) => item.id),
    seed: {
      editionCount: V3_S14_SEED_CONTRACT.editionCount,
      delegationCount: V3_S14_SEED_CONTRACT.delegationCount,
      showCount: V3_S14_SEED_CONTRACT.minimumShowCount,
    },
  };
}

function completeS15Evidence() {
  return {
    schemaVersion: 4,
    candidateSha: SHA,
    zeroOrphans: true,
    findings: [],
    inventory: {
      v3IntegrationAdapters: 8,
      edgeFunctions: 6,
      scheduledJobs: 3,
      physicalOwnershipDomains: 39,
      uniquePhysicalTables: 149,
      domainTableAssignments: 170,
      explicitlySharedTables: 12,
    },
    physicalOwnership: {
      schemaVersion: 1,
      zeroOwnershipConflicts: true,
    },
  };
}

describe("S16 source evidence validation", () => {
  it("accepts canonical Quality provenance for CI and guarded production isolation", () => {
    expect(validateV3S16CategorySourceEvidence("canonical-ci", coreEvidence("Quality"), SHA)).toEqual([]);
    expect(
      validateV3S16CategorySourceEvidence(
        "production-isolation",
        productionIsolationEvidence(),
        SHA,
      ),
    ).toEqual([]);
  });

  it("rejects production-isolation evidence that only inherits a successful Quality conclusion", () => {
    const issues = validateV3S16CategorySourceEvidence(
      "production-isolation",
      coreEvidence("Quality"),
      SHA,
    );
    expect(issues).toContain(
      "production-isolation: evidence is not bound to canonical Quality workflow path",
    );
    expect(issues).toContain(
      "production-isolation: evidence is not bound to canonical production-isolation guard",
    );
    expect(issues).toContain(
      "production-isolation: exact-SHA Quality invocation of the isolation guard was not verified",
    );
  });

  it("rejects forged workflow provenance", () => {
    expect(
      validateV3S16CategorySourceEvidence("canonical-ci", coreEvidence("Some other workflow"), SHA),
    ).toContain("canonical-ci: provenance must come from canonical Quality workflow");
  });

  it("requires the canonical migration rehearsal provenance", () => {
    const good = coreEvidence("Rules + Integrity migration rehearsal");
    expect(validateV3S16CategorySourceEvidence("migration-rehearsal", good, SHA)).toEqual([]);

    const bad = coreEvidence("Quality");
    expect(validateV3S16CategorySourceEvidence("migration-rehearsal", bad, SHA)).toContain(
      "migration-rehearsal: provenance must come from canonical migration rehearsal workflow",
    );
  });

  it("rejects authorization evidence while declared commands or incomplete hostile paths remain", () => {
    const evidence = {
      schemaVersion: 1,
      candidateSha: SHA,
      passed: true,
      authorization: {
        ready: false,
        declaredCount: 2,
        knownGapCount: 0,
        registryErrors: [],
        incompleteVerifiedCommands: ["entry.review"],
      },
      securityAdvisors: { exactCandidateSha: true, releaseReady: true },
    };
    const issues = validateV3S16CategorySourceEvidence("authorization-security", evidence, SHA);
    expect(issues).toContain(
      "authorization-security: canonical authorization registry is not release-ready",
    );
    expect(issues).toContain(
      "authorization-security: declared commands or known authorization gaps remain",
    );
    expect(issues).toContain(
      "authorization-security: verified commands have incomplete hostile-path evidence",
    );
  });

  it("rejects authorization evidence with stale or blocking security-advisor classification", () => {
    const evidence = {
      schemaVersion: 1,
      candidateSha: SHA,
      passed: true,
      authorization: {
        ready: true,
        declaredCount: 0,
        knownGapCount: 0,
        registryErrors: [],
        incompleteVerifiedCommands: [],
      },
      securityAdvisors: { exactCandidateSha: false, releaseReady: false },
    };
    expect(
      validateV3S16CategorySourceEvidence("authorization-security", evidence, SHA),
    ).toContain(
      "authorization-security: security advisor classification is not exact-SHA release-ready",
    );
  });

  it("accepts complete exact-SHA S14 evidence only when the canonical rehearsal contents are present", () => {
    expect(
      validateV3S16CategorySourceEvidence("full-contest-rehearsal", completeS14Evidence(), SHA),
    ).toEqual([]);
  });

  it("rejects partial, runtime-failed or unfinished S14 evidence", () => {
    const evidence = {
      ...completeS14Evidence(),
      partial: true,
      runtimeFailure: true,
      pendingStages: ["stage-10-archive"],
    };
    const issues = validateV3S16CategorySourceEvidence("full-contest-rehearsal", evidence, SHA);
    expect(issues).toContain(
      "full-contest-rehearsal: final evidence must explicitly prove partial=false",
    );
    expect(issues).toContain(
      "full-contest-rehearsal: final evidence must explicitly prove runtimeFailure=false",
    );
    expect(issues).toContain("full-contest-rehearsal: pending stages remain");
  });

  it("rejects cheerful S14 booleans that omit lifecycle, invariant or failure-injection proof", () => {
    const evidence = {
      ...completeS14Evidence(),
      completedStages: V3_S14_STAGES.slice(0, -1).map((item) => item.id),
      completedContestExtensions: GRAND_FINAL_EXTENSIONS.slice(0, -1),
      implementedInvariants: V3_S14_INVARIANTS.slice(0, -1).map((item) => item.id),
      implementedFailureInjections: V3_S14_FAILURE_INJECTIONS.slice(0, -1).map((item) => item.id),
    };
    const issues = validateV3S16CategorySourceEvidence("full-contest-rehearsal", evidence, SHA);
    expect(issues).toContain(
      `full-contest-rehearsal: completed lifecycle stages missing: ${V3_S14_STAGES.at(-1)?.id}`,
    );
    expect(issues).toContain(
      "full-contest-rehearsal: completed contest extensions missing: grand-final-publication",
    );
    expect(issues).toContain(
      `full-contest-rehearsal: invariant evidence missing: ${V3_S14_INVARIANTS.at(-1)?.id}`,
    );
    expect(issues).toContain(
      `full-contest-rehearsal: failure-injection evidence missing: ${V3_S14_FAILURE_INJECTIONS.at(-1)?.id}`,
    );
  });

  it("rejects S14 evidence that does not prove empty extension queues and the bounded canonical seed", () => {
    const evidence = {
      ...completeS14Evidence(),
      pendingContestExtensions: ["grand-final-publication"],
      blockedContestExtensions: ["grand-final-results"],
      seed: { editionCount: 2, delegationCount: 65, showCount: 1 },
    };
    const issues = validateV3S16CategorySourceEvidence("full-contest-rehearsal", evidence, SHA);
    expect(issues).toContain(
      "full-contest-rehearsal: pending contest extensions remain or are not recorded",
    );
    expect(issues).toContain(
      "full-contest-rehearsal: blocked contest extensions remain or are not recorded",
    );
    expect(issues).toContain(
      "full-contest-rehearsal: seed evidence does not match the canonical bounded S14 contest",
    );
  });

  it("accepts S15 only with concrete inventory and conflict-free physical ownership evidence", () => {
    expect(
      validateV3S16CategorySourceEvidence("registry-zero-gap", completeS15Evidence(), SHA),
    ).toEqual([]);
  });

  it("rejects zero-orphan S15 claims without scanner inventory and physical-ownership provenance", () => {
    const evidence = {
      candidateSha: SHA,
      schemaVersion: 3,
      zeroOrphans: true,
      findings: [],
    };
    const issues = validateV3S16CategorySourceEvidence("registry-zero-gap", evidence, SHA);
    expect(issues).toContain(
      "registry-zero-gap: S15 evidence schemaVersion is missing or predates physical-ownership evidence",
    );
    expect(issues).toContain("registry-zero-gap: concrete inventory is missing");
    expect(issues).toContain("registry-zero-gap: physical ownership is not explicitly conflict-free");
    expect(issues).toContain("registry-zero-gap: physical ownership scanner provenance is missing");
  });

  it("rejects zero-orphan evidence that still carries findings", () => {
    const evidence = {
      ...completeS15Evidence(),
      findings: ["ORPHAN"],
    };
    expect(validateV3S16CategorySourceEvidence("registry-zero-gap", evidence, SHA)).toContain(
      "registry-zero-gap: orphan findings remain",
    );
  });

  it("rejects stale source evidence even when the pass field is true", () => {
    const evidence = coreEvidence("Quality");
    evidence.candidateSha = "b".repeat(40);
    expect(validateV3S16CategorySourceEvidence("canonical-ci", evidence, SHA)).toContain(
      `canonical-ci: source evidence certifies ${"b".repeat(40)}, not exact candidate ${SHA}`,
    );
  });
});
