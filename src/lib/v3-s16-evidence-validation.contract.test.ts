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

  it("rejects partial, runtime-failed or unfinished S14 evidence", () => {
    const evidence = {
      schemaVersion: 2,
      candidateSha: SHA,
      passed: true,
      partial: true,
      runtimeFailure: true,
      pendingStages: ["stage-10-archive"],
    };
    const issues = validateV3S16CategorySourceEvidence("full-contest-rehearsal", evidence, SHA);
    expect(issues).toContain("full-contest-rehearsal: partial evidence cannot certify S16");
    expect(issues).toContain("full-contest-rehearsal: runtime failure evidence cannot certify S16");
    expect(issues).toContain("full-contest-rehearsal: pending stages remain");
  });

  it("rejects zero-orphan evidence that still carries findings", () => {
    const evidence = {
      candidateSha: SHA,
      zeroOrphans: true,
      findings: [{ code: "ORPHAN" }],
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
