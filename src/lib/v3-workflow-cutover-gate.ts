export type V3CriticalWorkflow =
  | "confirmation"
  | "entry"
  | "media"
  | "jury"
  | "televote";

export type V3WorkflowCutoverStage =
  | "shadow"
  | "limited"
  | "full"
  | "retire_legacy";

export type V3VerificationGate =
  | "functional"
  | "visual"
  | "interaction"
  | "infrastructure";

export type V3WorkflowSafetyEvidence = {
  canonicalReadReady: boolean;
  canonicalReadParity: boolean;
  canonicalWriteReady: boolean;
  authoritativeContext: boolean;
  serverAuthoritativeTime: boolean;
  capabilityAuthorization: boolean;
  serverControlledRollout: boolean;
  idempotencyProtection: boolean;
  uncertainOutcomeReconciliation: boolean;
  authoritativeReceipts: boolean;
  rollbackPath: boolean;
  legacyFallbackAvailable: boolean;
  errorStatePolicy: boolean;
  accessibilityPolicy: boolean;
  observability: boolean;
  revisionSafeDrafts: boolean;
  immutableSubmittedVersion: boolean;
  verifiedMediaPipeline: boolean;
  officialBallotValidation: boolean;
  duplicateEvidenceReconciliation: boolean;
  verification: Record<V3VerificationGate, boolean>;
};

export type V3CutoverBlocker = {
  key:
    | keyof Omit<V3WorkflowSafetyEvidence, "verification">
    | `verification.${V3VerificationGate}`;
  reason: string;
};

export type V3WorkflowCutoverDecision = {
  workflow: V3CriticalWorkflow;
  stage: V3WorkflowCutoverStage;
  allowed: boolean;
  blockers: V3CutoverBlocker[];
};

type EvidenceKey = keyof Omit<V3WorkflowSafetyEvidence, "verification">;

const CORE_USER_CUTOVER_REQUIREMENTS: readonly EvidenceKey[] = [
  "canonicalReadReady",
  "canonicalReadParity",
  "canonicalWriteReady",
  "authoritativeContext",
  "serverAuthoritativeTime",
  "capabilityAuthorization",
  "serverControlledRollout",
  "idempotencyProtection",
  "uncertainOutcomeReconciliation",
  "authoritativeReceipts",
  "rollbackPath",
  "legacyFallbackAvailable",
  "errorStatePolicy",
  "accessibilityPolicy",
  "observability",
] as const;

const WORKFLOW_REQUIREMENTS: Readonly<
  Record<V3CriticalWorkflow, readonly EvidenceKey[]>
> = {
  confirmation: ["revisionSafeDrafts"],
  entry: ["revisionSafeDrafts", "immutableSubmittedVersion"],
  media: ["verifiedMediaPipeline"],
  jury: ["revisionSafeDrafts", "officialBallotValidation"],
  televote: ["officialBallotValidation", "duplicateEvidenceReconciliation"],
};

const REASONS: Readonly<Record<EvidenceKey, string>> = {
  canonicalReadReady:
    "The canonical V3 read path is not ready for isolated observation.",
  canonicalReadParity:
    "Canonical V3 reads have not proven parity with the current workflow.",
  canonicalWriteReady:
    "The canonical V3 write path is not ready for production mutation ownership.",
  authoritativeContext:
    "Competition, edition and show context is not yet authoritative and explicitly scoped.",
  serverAuthoritativeTime:
    "Deadlines or acceptance rules can still depend on an untrusted client clock.",
  capabilityAuthorization:
    "The surface is not yet driven by authoritative capability/permission evidence.",
  serverControlledRollout:
    "The workflow cannot yet be enabled and disabled through server-controlled rollout.",
  idempotencyProtection:
    "A repeated protected request could still create a duplicate mutation.",
  uncertainOutcomeReconciliation:
    "Transport ambiguity cannot yet be reconciled safely before retry.",
  authoritativeReceipts:
    "Successful mutations do not yet produce operation-bound authoritative receipt evidence.",
  rollbackPath:
    "There is no proven reversible path back to the current workflow if cutover fails.",
  legacyFallbackAvailable:
    "The current workflow is not available as a fallback during staged cutover.",
  errorStatePolicy:
    "Failure, rejection and uncertain-submit states are not yet represented safely for users.",
  accessibilityPolicy:
    "Critical workflow status and blocked states do not yet satisfy the V3 accessibility contract.",
  observability:
    "The workflow lacks enough operational evidence to detect and diagnose cutover failures.",
  revisionSafeDrafts:
    "Cross-device draft writes can still overwrite a newer authoritative revision.",
  immutableSubmittedVersion:
    "Submission approval is not yet bound to one exact immutable submitted version.",
  verifiedMediaPipeline:
    "User media is not yet guaranteed to pass through authorized quarantine and verification.",
  officialBallotValidation:
    "Official ballot acceptance is not yet protected by canonical server validation.",
  duplicateEvidenceReconciliation:
    "Duplicate-protection evidence can still be mistaken for proof that this exact submission committed.",
};

const ALL_VERIFICATION_GATES: readonly V3VerificationGate[] = [
  "functional",
  "visual",
  "interaction",
  "infrastructure",
] as const;

function blocker(key: EvidenceKey): V3CutoverBlocker {
  return { key, reason: REASONS[key] };
}

function verificationBlocker(gate: V3VerificationGate): V3CutoverBlocker {
  return {
    key: `verification.${gate}`,
    reason: `${gate[0]!.toUpperCase()}${gate.slice(1)} verification has not passed on the cutover candidate.`,
  };
}

function uniqueRequirements(workflow: V3CriticalWorkflow) {
  return [
    ...new Set([
      ...CORE_USER_CUTOVER_REQUIREMENTS,
      ...WORKFLOW_REQUIREMENTS[workflow],
    ]),
  ];
}

/**
 * Fail-closed production cutover decision for critical Solaris workflows.
 *
 * This is intentionally an evidence gate, not a feature flag and not a test
 * runner. Callers must populate it from objective release evidence. A UI toggle,
 * browser-local opt-in value, optimistic client state, or "we tested this earlier"
 * is not evidence that a missing requirement passed on the current candidate.
 */
export function evaluateV3WorkflowCutover(input: {
  workflow: V3CriticalWorkflow;
  stage: V3WorkflowCutoverStage;
  evidence: V3WorkflowSafetyEvidence;
}): V3WorkflowCutoverDecision {
  const { workflow, stage, evidence } = input;
  const blockers: V3CutoverBlocker[] = [];

  if (stage === "shadow") {
    // Shadow mode must not own the participant mutation. It requires a safe
    // canonical observer, explicit context/time/permissions, a server kill
    // switch, the live legacy workflow and infrastructure isolation so parity
    // can be measured without changing the current participant experience.
    // Parity itself is deliberately NOT a prerequisite for entering shadow.
    for (const key of [
      "canonicalReadReady",
      "authoritativeContext",
      "serverAuthoritativeTime",
      "capabilityAuthorization",
      "serverControlledRollout",
      "legacyFallbackAvailable",
      "observability",
    ] as const) {
      if (!evidence[key]) blockers.push(blocker(key));
    }
    if (!evidence.verification.infrastructure) {
      blockers.push(verificationBlocker("infrastructure"));
    }

    return { workflow, stage, allowed: blockers.length === 0, blockers };
  }

  for (const key of uniqueRequirements(workflow)) {
    if (!evidence[key]) blockers.push(blocker(key));
  }

  for (const gate of ALL_VERIFICATION_GATES) {
    if (!evidence.verification[gate]) blockers.push(verificationBlocker(gate));
  }

  if (stage === "retire_legacy") {
    // Retirement has the inverse fallback requirement: the new path must be
    // fully proven, and evidence must explicitly say legacy fallback is no
    // longer required. A still-required fallback means retirement is premature.
    const fallbackIndex = blockers.findIndex(
      (item) => item.key === "legacyFallbackAvailable",
    );
    if (fallbackIndex >= 0) blockers.splice(fallbackIndex, 1);

    if (evidence.legacyFallbackAvailable) {
      blockers.push({
        key: "legacyFallbackAvailable",
        reason:
          "Legacy retirement is premature while staged cutover still declares the old workflow necessary as a fallback.",
      });
    }
  }

  return { workflow, stage, allowed: blockers.length === 0, blockers };
}

export function requiredV3WorkflowEvidence(workflow: V3CriticalWorkflow) {
  return uniqueRequirements(workflow);
}
