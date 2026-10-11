import { describe, expect, it } from "vitest";

import {
  evaluateV3WorkflowCutover,
  requiredV3WorkflowEvidence,
  type V3CriticalWorkflow,
  type V3WorkflowSafetyEvidence,
} from "./v3-workflow-cutover-gate";

function completeEvidence(): V3WorkflowSafetyEvidence {
  return {
    canonicalReadReady: true,
    canonicalReadParity: true,
    canonicalWriteReady: true,
    authoritativeContext: true,
    serverAuthoritativeTime: true,
    capabilityAuthorization: true,
    serverControlledRollout: true,
    idempotencyProtection: true,
    uncertainOutcomeReconciliation: true,
    authoritativeReceipts: true,
    rollbackPath: true,
    legacyFallbackAvailable: true,
    errorStatePolicy: true,
    accessibilityPolicy: true,
    observability: true,
    revisionSafeDrafts: true,
    immutableSubmittedVersion: true,
    verifiedMediaPipeline: true,
    officialBallotValidation: true,
    duplicateEvidenceReconciliation: true,
    verification: {
      functional: true,
      visual: true,
      interaction: true,
      infrastructure: true,
    },
  };
}

function expectBlockedOn(
  workflow: V3CriticalWorkflow,
  evidence: V3WorkflowSafetyEvidence,
  key: string,
) {
  const decision = evaluateV3WorkflowCutover({
    workflow,
    stage: "limited",
    evidence,
  });
  expect(decision.allowed).toBe(false);
  expect(decision.blockers.some((item) => item.key === key)).toBe(true);
}

describe("Solaris Studio V3 critical workflow cutover gate", () => {
  it("allows shadow observation before read parity and mutation safety are proven", () => {
    const evidence = completeEvidence();
    evidence.canonicalReadParity = false;
    evidence.canonicalWriteReady = false;
    evidence.idempotencyProtection = false;
    evidence.uncertainOutcomeReconciliation = false;
    evidence.authoritativeReceipts = false;
    evidence.rollbackPath = false;
    evidence.revisionSafeDrafts = false;
    evidence.immutableSubmittedVersion = false;
    evidence.verifiedMediaPipeline = false;
    evidence.officialBallotValidation = false;
    evidence.duplicateEvidenceReconciliation = false;
    evidence.verification.functional = false;
    evidence.verification.visual = false;
    evidence.verification.interaction = false;

    const decision = evaluateV3WorkflowCutover({
      workflow: "entry",
      stage: "shadow",
      evidence,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.blockers).toEqual([]);
  });

  it("blocks shadow observation when the canonical reader or infrastructure isolation is not ready", () => {
    const evidence = completeEvidence();
    evidence.canonicalReadReady = false;
    evidence.verification.infrastructure = false;

    const decision = evaluateV3WorkflowCutover({
      workflow: "confirmation",
      stage: "shadow",
      evidence,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockers.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        "canonicalReadReady",
        "verification.infrastructure",
      ]),
    );
  });

  it("requires server-controlled shutdown and the live legacy workflow while shadowing", () => {
    const evidence = completeEvidence();
    evidence.serverControlledRollout = false;
    evidence.legacyFallbackAvailable = false;

    const decision = evaluateV3WorkflowCutover({
      workflow: "jury",
      stage: "shadow",
      evidence,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockers.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        "serverControlledRollout",
        "legacyFallbackAvailable",
      ]),
    );
  });

  it("allows a limited critical-workflow cutover only with the complete evidence set", () => {
    const decision = evaluateV3WorkflowCutover({
      workflow: "confirmation",
      stage: "limited",
      evidence: completeEvidence(),
    });

    expect(decision.allowed).toBe(true);
    expect(decision.blockers).toEqual([]);
  });

  it("does not relax safety requirements merely because rollout is limited to a cohort", () => {
    const evidence = completeEvidence();
    evidence.idempotencyProtection = false;
    evidence.uncertainOutcomeReconciliation = false;
    evidence.authoritativeReceipts = false;

    const decision = evaluateV3WorkflowCutover({
      workflow: "televote",
      stage: "limited",
      evidence,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockers.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        "idempotencyProtection",
        "uncertainOutcomeReconciliation",
        "authoritativeReceipts",
      ]),
    );
  });

  it("requires revision-safe drafts before Confirmation cutover", () => {
    const evidence = completeEvidence();
    evidence.revisionSafeDrafts = false;
    expectBlockedOn("confirmation", evidence, "revisionSafeDrafts");
  });

  it("requires both revision-safe drafts and immutable submitted versions before Entry cutover", () => {
    const evidence = completeEvidence();
    evidence.revisionSafeDrafts = false;
    evidence.immutableSubmittedVersion = false;

    const decision = evaluateV3WorkflowCutover({
      workflow: "entry",
      stage: "full",
      evidence,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockers.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        "revisionSafeDrafts",
        "immutableSubmittedVersion",
      ]),
    );
  });

  it("requires the verified quarantine/finalization pipeline before Media cutover", () => {
    const evidence = completeEvidence();
    evidence.verifiedMediaPipeline = false;
    expectBlockedOn("media", evidence, "verifiedMediaPipeline");
  });

  it("requires revision-safe drafts and canonical ballot validation before Jury cutover", () => {
    const evidence = completeEvidence();
    evidence.revisionSafeDrafts = false;
    evidence.officialBallotValidation = false;

    const decision = evaluateV3WorkflowCutover({
      workflow: "jury",
      stage: "full",
      evidence,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockers.map((item) => item.key)).toEqual(
      expect.arrayContaining([
        "revisionSafeDrafts",
        "officialBallotValidation",
      ]),
    );
  });

  it("requires duplicate-evidence reconciliation before Televote cutover", () => {
    const evidence = completeEvidence();
    evidence.duplicateEvidenceReconciliation = false;
    expectBlockedOn(
      "televote",
      evidence,
      "duplicateEvidenceReconciliation",
    );
  });

  it.each([
    "functional",
    "visual",
    "interaction",
    "infrastructure",
  ] as const)("requires the %s verification gate on the actual cutover candidate", (gate) => {
    const evidence = completeEvidence();
    evidence.verification[gate] = false;

    const decision = evaluateV3WorkflowCutover({
      workflow: "confirmation",
      stage: "full",
      evidence,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockers.some((item) => item.key === `verification.${gate}`)).toBe(true);
  });

  it("keeps the legacy workflow available throughout limited and full staged cutover", () => {
    const evidence = completeEvidence();
    evidence.legacyFallbackAvailable = false;

    for (const stage of ["limited", "full"] as const) {
      const decision = evaluateV3WorkflowCutover({
        workflow: "jury",
        stage,
        evidence,
      });
      expect(decision.allowed).toBe(false);
      expect(
        decision.blockers.some(
          (item) => item.key === "legacyFallbackAvailable",
        ),
      ).toBe(true);
    }
  });

  it("blocks legacy retirement while the migration still declares fallback necessary", () => {
    const decision = evaluateV3WorkflowCutover({
      workflow: "confirmation",
      stage: "retire_legacy",
      evidence: completeEvidence(),
    });

    expect(decision.allowed).toBe(false);
    expect(decision.blockers).toContainEqual({
      key: "legacyFallbackAvailable",
      reason:
        "Legacy retirement is premature while staged cutover still declares the old workflow necessary as a fallback.",
    });
  });

  it("allows legacy retirement only after every other requirement passes and fallback is no longer required", () => {
    const evidence = completeEvidence();
    evidence.legacyFallbackAvailable = false;

    const decision = evaluateV3WorkflowCutover({
      workflow: "confirmation",
      stage: "retire_legacy",
      evidence,
    });

    expect(decision.allowed).toBe(true);
    expect(decision.blockers).toEqual([]);
  });

  it("exposes workflow-specific requirements without pretending unrelated guarantees apply everywhere", () => {
    expect(requiredV3WorkflowEvidence("entry")).toEqual(
      expect.arrayContaining(["revisionSafeDrafts", "immutableSubmittedVersion"]),
    );
    expect(requiredV3WorkflowEvidence("media")).toContain(
      "verifiedMediaPipeline",
    );
    expect(requiredV3WorkflowEvidence("media")).not.toContain(
      "revisionSafeDrafts",
    );
    expect(requiredV3WorkflowEvidence("televote")).toEqual(
      expect.arrayContaining([
        "officialBallotValidation",
        "duplicateEvidenceReconciliation",
      ]),
    );
  });
});
