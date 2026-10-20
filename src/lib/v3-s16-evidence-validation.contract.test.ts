import { describe, expect, it } from "vitest";
import { validateV3S16CategorySourceEvidence } from "./v3-s16-evidence-validation";

const SHA = "a".repeat(40);

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
      "grand-final-jury",
      "grand-final-televote",
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
      "grand-final-televote-source-parity",
      "grand-final-result-reproducible",
      "grand-final-publication-final-version",
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
  };
}

function completeS15Evidence() {
  return {
    schemaVersion: 4,
    candidateSha: SHA,
    zeroOrphans: true,
    findings: [],
    inventory: { routes: 100 },
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

  it("accepts only complete canonical S14 evidence", () => {
    expect(
      validateV3S16CategorySourceEvidence("full-contest-rehearsal", completeS14Evidence(), SHA),
    ).toEqual([]);
  });

  it("rejects S14 evidence that says passed without proving the complete lifecycle", () => {
    const evidence = completeS14Evidence();
    evidence.completedStages = evidence.completedStages.slice(0, 9);
    evidence.completedContestExtensions = ["grand-final-qualifier-bridge"];
    evidence.pendingContestExtensions = ["grand-final-publication"];
    evidence.blockedContestExtensions = ["grand-final-publication"];
    evidence.implementedInvariants = evidence.implementedInvariants.filter(
      (item) => item !== "tasks-canonical",
    );
    evidence.implementedFailureInjections = evidence.implementedFailureInjections.filter(
      (item) => item !== "supabase-outage",
    );
    evidence.seed = { editionCount: 1, delegationCount: 65, showCount: 3 };

    const issues = validateV3S16CategorySourceEvidence("full-contest-rehearsal", evidence, SHA);
    expect(issues).toContain(
      "full-contest-rehearsal: completedStages does not prove the canonical 10-stage lifecycle",
    );
    expect(issues).toContain("full-contest-rehearsal: Grand Final completion evidence is incomplete");
    expect(issues).toContain(
      "full-contest-rehearsal: pending contest extensions remain or are not explicitly reported",
    );
    expect(issues).toContain(
      "full-contest-rehearsal: blocked contest extensions remain or are not explicitly reported",
    );
    expect(issues).toContain("full-contest-rehearsal: required invariants missing: tasks-canonical");
    expect(issues).toContain(
      "full-contest-rehearsal: required failure injections missing: supabase-outage",
    );
    expect(issues).toContain(
      "full-contest-rehearsal: seed evidence must prove one edition, 66 delegations and three shows",
    );
  });

  it("rejects partial, runtime-failed or ambiguous final S14 evidence", () => {
    const evidence = completeS14Evidence();
    evidence.partial = true;
    evidence.runtimeFailure = true;
    evidence.pendingStages = ["stage-10-archive"];
    const issues = validateV3S16CategorySourceEvidence("full-contest-rehearsal", evidence, SHA);
    expect(issues).toContain("full-contest-rehearsal: final evidence must prove partial=false");
    expect(issues).toContain("full-contest-rehearsal: final evidence must prove runtimeFailure=false");
    expect(issues).toContain(
      "full-contest-rehearsal: pending stages remain or are not explicitly reported",
    );
  });

  it("accepts only S15 zero-gap evidence with conflict-free physical ownership", () => {
    expect(
      validateV3S16CategorySourceEvidence("registry-zero-gap", completeS15Evidence(), SHA),
    ).toEqual([]);
  });

  it("rejects zero-orphan claims that retain findings or ambiguous physical ownership", () => {
    const evidence = completeS15Evidence();
    evidence.findings = [{ code: "ORPHAN" }];
    evidence.physicalOwnership.zeroOwnershipConflicts = false;
    const issues = validateV3S16CategorySourceEvidence("registry-zero-gap", evidence, SHA);
    expect(issues).toContain(
      "registry-zero-gap: orphan findings remain or findings are not explicitly reported",
    );
    expect(issues).toContain("registry-zero-gap: physical ownership is not conflict-free");
  });

  it("rejects stale source evidence even when the pass field is true", () => {
    const evidence = coreEvidence("Quality");
    evidence.candidateSha = "b".repeat(40);
    expect(validateV3S16CategorySourceEvidence("canonical-ci", evidence, SHA)).toContain(
      `canonical-ci: source evidence certifies ${"b".repeat(40)}, not exact candidate ${SHA}`,
    );
  });
});
