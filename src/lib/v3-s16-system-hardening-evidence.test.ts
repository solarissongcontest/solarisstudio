import { describe, expect, it } from "vitest";
import {
  V3_S16_SYSTEM_HARDENING_PHASES,
  validateV3S16SystemHardeningEvidence,
} from "./v3-s16-system-hardening-evidence";

const SHA = "a".repeat(40);
const DIGEST = "b".repeat(64);

function completeEvidence() {
  return {
    schemaVersion: 1,
    candidateSha: SHA,
    passed: true,
    certificationClaim: false,
    unresolvedBlockers: [],
    phases: V3_S16_SYSTEM_HARDENING_PHASES.map((id, index) => ({
      id,
      candidateSha: SHA,
      passed: true,
      blockers: [],
      sources: [
        {
          artifact: `s${10 + index}-exact-sha.json`,
          sha256: DIGEST,
          workflow: `V3 ${id} evidence`,
          runId: 100 + index,
          runAttempt: 1,
          headSha: SHA,
          conclusion: "success",
        },
      ],
    })),
  };
}

describe("V3 S16 System hardening evidence", () => {
  it("accepts only a complete exact-SHA S10-S13 portfolio", () => {
    expect(validateV3S16SystemHardeningEvidence(completeEvidence(), SHA)).toEqual([]);
  });

  it("fails closed when one required System phase is missing or blocked", () => {
    const missing = completeEvidence();
    missing.phases = missing.phases.filter((phase) => phase.id !== "S12");
    expect(validateV3S16SystemHardeningEvidence(missing, SHA)).toContain(
      "system-hardening: expected exactly one S12 phase; found 0",
    );

    const blocked = completeEvidence();
    const s11 = blocked.phases.find((phase) => phase.id === "S11")!;
    s11.passed = false;
    s11.blockers = ["full-service recovery drill incomplete"];
    const blockedIssues = validateV3S16SystemHardeningEvidence(blocked, SHA);
    expect(blockedIssues).toContain("system-hardening: S11 does not prove passed=true");
    expect(blockedIssues).toContain("system-hardening: S11 still has blockers");
  });

  it("rejects mixed candidate SHAs and stale source runs", () => {
    const evidence = completeEvidence();
    const s10 = evidence.phases.find((phase) => phase.id === "S10")!;
    s10.candidateSha = "c".repeat(40);
    s10.sources[0]!.headSha = "c".repeat(40);
    const issues = validateV3S16SystemHardeningEvidence(evidence, SHA);
    expect(issues).toContain(
      `system-hardening: S10 certifies ${"c".repeat(40)}, not exact candidate ${SHA}`,
    );
    expect(issues).toContain(
      `system-hardening: S10 source 1 ran on ${"c".repeat(40)}, not exact candidate ${SHA}`,
    );
  });

  it("requires retained source provenance instead of accepting cheerful phase booleans", () => {
    const evidence = completeEvidence();
    const s12 = evidence.phases.find((phase) => phase.id === "S12")!;
    s12.sources = [];
    expect(validateV3S16SystemHardeningEvidence(evidence, SHA)).toContain(
      "system-hardening: S12 must retain at least one exact-SHA source artifact",
    );
  });

  it("requires source digest, workflow/run identity and successful exact-head conclusion", () => {
    const evidence = completeEvidence();
    const source = evidence.phases[0]!.sources[0]!;
    source.sha256 = "bad";
    source.workflow = "";
    source.runId = 0;
    source.runAttempt = 0;
    source.conclusion = "failure";
    const issues = validateV3S16SystemHardeningEvidence(evidence, SHA);
    expect(issues).toContain("system-hardening: S10 source 1 sha256 must be 64 lowercase hex characters");
    expect(issues).toContain("system-hardening: S10 source 1 workflow is missing");
    expect(issues).toContain("system-hardening: S10 source 1 runId must be a positive integer");
    expect(issues).toContain("system-hardening: S10 source 1 runAttempt must be a positive integer");
    expect(issues).toContain("system-hardening: S10 source 1 conclusion must be success");
  });

  it("forbids component evidence from claiming final release certification", () => {
    const evidence = completeEvidence();
    evidence.certificationClaim = true;
    expect(validateV3S16SystemHardeningEvidence(evidence, SHA)).toContain(
      "system-hardening: component evidence must explicitly set certificationClaim=false",
    );
  });
});
