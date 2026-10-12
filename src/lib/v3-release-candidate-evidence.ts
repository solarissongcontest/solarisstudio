import type {
  V3CriticalWorkflow,
  V3VerificationGate,
  V3WorkflowCutoverDecision,
  V3WorkflowCutoverStage,
} from "./v3-workflow-cutover-gate";

export type V3CandidateEvidenceStatus = "passed" | "failed" | "skipped";

export type V3CandidateEvidenceRef = {
  candidateSha: string;
  evidenceRef: string;
  observedAt: string;
};

export type V3CandidateVerificationEvidence = V3CandidateEvidenceRef & {
  gate: V3VerificationGate;
  status: V3CandidateEvidenceStatus;
};

export type V3CandidateWorkflowDecisionEvidence = V3CandidateEvidenceRef & {
  decision: V3WorkflowCutoverDecision;
};

export type V3CandidateObservabilityTarget =
  | "limited"
  | "full"
  | "retire_legacy";

/**
 * Structural output compatible with the dedicated rollout-observability slice.
 * This module intentionally does not recalculate telemetry thresholds.
 */
export type V3CandidateObservabilityDecision = {
  target: V3CandidateObservabilityTarget;
  ready: boolean;
  blockers: readonly { id: string; passed: boolean }[];
};

export type V3CandidateObservabilityEvidence = V3CandidateEvidenceRef & {
  windowStart: string;
  windowEnd: string;
  decision: V3CandidateObservabilityDecision;
};

export type V3ReleaseEvidenceBlocker = {
  id: string;
  reason: string;
};

export type V3ReleaseCandidateDecision = {
  candidateSha: string;
  target: V3WorkflowCutoverStage;
  workflows: readonly V3CriticalWorkflow[];
  ready: boolean;
  blockers: readonly V3ReleaseEvidenceBlocker[];
};

const ALL_VERIFICATION_GATES: readonly V3VerificationGate[] = [
  "functional",
  "visual",
  "interaction",
  "infrastructure",
] as const;

function normalizeCandidateSha(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) {
    throw new Error("V3 release evidence requires a full 40-character commit SHA.");
  }
  return normalized;
}

function requiredText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} must not be empty.`);
  return normalized;
}

function timestamp(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    throw new Error(`${label} must be a valid timestamp.`);
  }
  return normalized;
}

function assertBoundEvidence(
  expectedSha: string,
  evidence: V3CandidateEvidenceRef,
  label: string,
) {
  const evidenceSha = normalizeCandidateSha(evidence.candidateSha);
  if (evidenceSha !== expectedSha) {
    throw new Error(
      `${label} belongs to candidate ${evidenceSha}, not ${expectedSha}.`,
    );
  }
  requiredText(evidence.evidenceRef, `${label}.evidenceRef`);
  timestamp(evidence.observedAt, `${label}.observedAt`);
}

function requestedWorkflows(workflows: readonly V3CriticalWorkflow[]) {
  if (!workflows.length) {
    throw new Error("V3 release evidence requires at least one critical workflow.");
  }
  const unique = [...new Set(workflows)];
  if (unique.length !== workflows.length) {
    throw new Error("V3 release evidence cannot request the same workflow twice.");
  }
  return unique;
}

function requiredVerificationGates(target: V3WorkflowCutoverStage) {
  return target === "shadow"
    ? (["infrastructure"] as const)
    : ALL_VERIFICATION_GATES;
}

function expectedObservabilityTarget(
  target: V3WorkflowCutoverStage,
): V3CandidateObservabilityTarget | null {
  if (target === "shadow") return null;
  return target;
}

/**
 * Binds release proof to the exact candidate being promoted.
 *
 * This module does not run tests, evaluate workflow safety, calculate telemetry
 * thresholds, enable rollout or fetch GitHub artifacts. It consumes those
 * already-authoritative decisions and refuses to combine evidence from another
 * commit SHA. A later integration may populate `evidenceRef` from immutable CI,
 * browser-audit, review or aggregate-telemetry artifacts.
 */
export function evaluateV3ReleaseCandidateEvidence(input: {
  candidateSha: string;
  target: V3WorkflowCutoverStage;
  workflows: readonly V3CriticalWorkflow[];
  verification: readonly V3CandidateVerificationEvidence[];
  workflowDecisions: readonly V3CandidateWorkflowDecisionEvidence[];
  observability?: V3CandidateObservabilityEvidence | null;
}): V3ReleaseCandidateDecision {
  const candidateSha = normalizeCandidateSha(input.candidateSha);
  const workflows = requestedWorkflows(input.workflows);
  const blockers: V3ReleaseEvidenceBlocker[] = [];

  const verificationByGate = new Map<
    V3VerificationGate,
    V3CandidateVerificationEvidence
  >();
  for (const evidence of input.verification) {
    assertBoundEvidence(candidateSha, evidence, `verification.${evidence.gate}`);
    if (verificationByGate.has(evidence.gate)) {
      throw new Error(`Duplicate ${evidence.gate} verification evidence.`);
    }
    verificationByGate.set(evidence.gate, evidence);
  }

  for (const gate of requiredVerificationGates(input.target)) {
    const evidence = verificationByGate.get(gate);
    if (!evidence) {
      blockers.push({
        id: `verification.${gate}.missing`,
        reason: `${gate} verification evidence is missing for this candidate.`,
      });
      continue;
    }
    if (evidence.status !== "passed") {
      blockers.push({
        id: `verification.${gate}.${evidence.status}`,
        reason: `${gate} verification did not pass on this candidate.`,
      });
    }
  }

  const decisionsByWorkflow = new Map<
    V3CriticalWorkflow,
    V3CandidateWorkflowDecisionEvidence
  >();
  for (const evidence of input.workflowDecisions) {
    assertBoundEvidence(
      candidateSha,
      evidence,
      `workflow.${evidence.decision.workflow}`,
    );
    const workflow = evidence.decision.workflow;
    if (decisionsByWorkflow.has(workflow)) {
      throw new Error(`Duplicate ${workflow} cutover decision evidence.`);
    }
    decisionsByWorkflow.set(workflow, evidence);
  }

  for (const workflow of workflows) {
    const evidence = decisionsByWorkflow.get(workflow);
    if (!evidence) {
      blockers.push({
        id: `workflow.${workflow}.missing`,
        reason: `${workflow} has no cutover-gate decision bound to this candidate.`,
      });
      continue;
    }

    const decision = evidence.decision;
    if (decision.stage !== input.target) {
      blockers.push({
        id: `workflow.${workflow}.wrong_stage`,
        reason: `${workflow} evidence was evaluated for ${decision.stage}, not ${input.target}.`,
      });
      continue;
    }
    if (!decision.allowed) {
      blockers.push({
        id: `workflow.${workflow}.blocked`,
        reason:
          decision.blockers.map((item) => item.reason).join(" ") ||
          `${workflow} cutover gate is blocked.`,
      });
      continue;
    }
    if (decision.blockers.length > 0) {
      blockers.push({
        id: `workflow.${workflow}.inconsistent_decision`,
        reason: `${workflow} decision is marked allowed but still contains blockers.`,
      });
    }
  }

  const expectedTarget = expectedObservabilityTarget(input.target);
  if (expectedTarget) {
    const evidence = input.observability;
    if (!evidence) {
      blockers.push({
        id: "observability.missing",
        reason: `Observability evidence is required before ${input.target} promotion.`,
      });
    } else {
      assertBoundEvidence(candidateSha, evidence, "observability");
      const windowStart = Date.parse(
        timestamp(evidence.windowStart, "observability.windowStart"),
      );
      const windowEnd = Date.parse(
        timestamp(evidence.windowEnd, "observability.windowEnd"),
      );
      const observedAt = Date.parse(
        timestamp(evidence.observedAt, "observability.observedAt"),
      );
      if (windowEnd < windowStart) {
        throw new Error("Observability windowEnd cannot be before windowStart.");
      }
      if (observedAt < windowEnd) {
        throw new Error(
          "Observability evidence cannot be recorded before its observation window ends.",
        );
      }
      if (evidence.decision.target !== expectedTarget) {
        blockers.push({
          id: "observability.wrong_target",
          reason: `Observability was evaluated for ${evidence.decision.target}, not ${expectedTarget}.`,
        });
      } else if (!evidence.decision.ready) {
        blockers.push({
          id: "observability.blocked",
          reason:
            evidence.decision.blockers.map((item) => item.id).join(", ") ||
            "Observability evidence is not ready.",
        });
      } else if (evidence.decision.blockers.some((item) => !item.passed)) {
        blockers.push({
          id: "observability.inconsistent_decision",
          reason:
            "Observability is marked ready while unresolved blocker evidence remains.",
        });
      }
    }
  } else if (input.observability) {
    assertBoundEvidence(candidateSha, input.observability, "observability");
  }

  return {
    candidateSha,
    target: input.target,
    workflows,
    ready: blockers.length === 0,
    blockers,
  };
}

export { ALL_VERIFICATION_GATES as V3_RELEASE_VERIFICATION_GATES };
