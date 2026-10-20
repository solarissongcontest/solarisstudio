import type { V3SloEvidence } from "./v3-reliability-slo";
import type {
  V3ErrorBudgetEvaluation,
  V3OperationSuccessObjective,
  V3SloScope,
} from "./v3-error-budget";

export type V3StarterSloClass =
  | "contest_critical"
  | "participation_critical"
  | "evidence_required";

export type V3StarterAvailabilityPolicy = {
  schemaVersion: 1;
  scope: V3SloScope;
  serviceClass: V3StarterSloClass;
  targetSuccessRatio: number | null;
  operationalWindow:
    | "relevant_operational_window"
    | "defined_measurement_window"
    | "evidence_defined";
  activation: "requires_reviewed_evidence";
  rationale: string;
};

/**
 * Canonical System V3 starter availability targets.
 *
 * These are policy templates, not production certification. The System plan
 * gives Class A (contest-critical) a starter target of >= 99.9% and Class B
 * (participation-critical) >= 99.5%, while other domains require measured
 * evidence before Solaris chooses a numeric target. A template becomes an
 * evaluable objective only through createV3StarterOperationObjective(), which
 * attaches reviewed evidence to the target.
 */
export const V3_STARTER_AVAILABILITY_POLICIES: Readonly<
  Record<V3SloScope, V3StarterAvailabilityPolicy>
> = {
  system: {
    schemaVersion: 1,
    scope: "system",
    serviceClass: "evidence_required",
    targetSuccessRatio: null,
    operationalWindow: "evidence_defined",
    activation: "requires_reviewed_evidence",
    rationale:
      "System-wide availability has no canonical numeric starter target; use measured evidence.",
  },
  confirmation_submission: {
    schemaVersion: 1,
    scope: "confirmation_submission",
    serviceClass: "participation_critical",
    targetSuccessRatio: 0.995,
    operationalWindow: "defined_measurement_window",
    activation: "requires_reviewed_evidence",
    rationale: "Confirmation is a canonical Class B participation-critical workflow.",
  },
  entry_mutation: {
    schemaVersion: 1,
    scope: "entry_mutation",
    serviceClass: "participation_critical",
    targetSuccessRatio: 0.995,
    operationalWindow: "defined_measurement_window",
    activation: "requires_reviewed_evidence",
    rationale: "Entry is a canonical Class B participation-critical workflow.",
  },
  media_review_consequence: {
    schemaVersion: 1,
    scope: "media_review_consequence",
    serviceClass: "participation_critical",
    targetSuccessRatio: 0.995,
    operationalWindow: "defined_measurement_window",
    activation: "requires_reviewed_evidence",
    rationale: "Media is a canonical Class B participation-critical workflow.",
  },
  jury_submission: {
    schemaVersion: 1,
    scope: "jury_submission",
    serviceClass: "contest_critical",
    targetSuccessRatio: 0.999,
    operationalWindow: "relevant_operational_window",
    activation: "requires_reviewed_evidence",
    rationale: "Jury submission is a canonical Class A contest-critical workflow.",
  },
  televote_submission: {
    schemaVersion: 1,
    scope: "televote_submission",
    serviceClass: "contest_critical",
    targetSuccessRatio: 0.999,
    operationalWindow: "relevant_operational_window",
    activation: "requires_reviewed_evidence",
    rationale: "Televote submission is a canonical Class A contest-critical workflow.",
  },
  voting_round_transition: {
    schemaVersion: 1,
    scope: "voting_round_transition",
    serviceClass: "contest_critical",
    targetSuccessRatio: 0.999,
    operationalWindow: "relevant_operational_window",
    activation: "requires_reviewed_evidence",
    rationale: "Opening and closing official voting is contest-critical state transition work.",
  },
  results_lifecycle: {
    schemaVersion: 1,
    scope: "results_lifecycle",
    serviceClass: "contest_critical",
    targetSuccessRatio: 0.999,
    operationalWindow: "relevant_operational_window",
    activation: "requires_reviewed_evidence",
    rationale: "Result finalization is a canonical Class A contest-critical workflow.",
  },
  publication: {
    schemaVersion: 1,
    scope: "publication",
    serviceClass: "contest_critical",
    targetSuccessRatio: 0.999,
    operationalWindow: "relevant_operational_window",
    activation: "requires_reviewed_evidence",
    rationale:
      "Official result/publication release is a canonical Class A contest-critical workflow.",
  },
  notification_consequence: {
    schemaVersion: 1,
    scope: "notification_consequence",
    serviceClass: "evidence_required",
    targetSuccessRatio: null,
    operationalWindow: "evidence_defined",
    activation: "requires_reviewed_evidence",
    rationale:
      "The System plan requires a defined fanout window but does not specify a numeric availability target.",
  },
  projection_reconciliation: {
    schemaVersion: 1,
    scope: "projection_reconciliation",
    serviceClass: "evidence_required",
    targetSuccessRatio: null,
    operationalWindow: "evidence_defined",
    activation: "requires_reviewed_evidence",
    rationale:
      "Projection/reconciliation reliability must be set from measured freshness and recovery evidence.",
  },
};

export const V3_STARTER_LATENCY_GOALS = {
  criticalCommandAcknowledgementP95Ms: 1500,
  commonCachedPublicProjectionP95Ms: 1000,
  activation: "requires_reviewed_telemetry",
} as const;

export function createV3StarterOperationObjective(input: {
  scope: V3SloScope;
  evidence: V3SloEvidence;
  minimumCompletedOperations: number;
}): V3OperationSuccessObjective {
  const template = V3_STARTER_AVAILABILITY_POLICIES[input.scope];
  if (template.targetSuccessRatio === null) {
    throw new Error(
      `No canonical numeric starter availability target exists for ${input.scope}; reviewed evidence must define one`,
    );
  }

  return {
    schemaVersion: 1,
    id: `v3-starter-${input.scope}-availability-v1`,
    scope: input.scope,
    indicator: "successful_operation_ratio",
    targetSuccessRatio: template.targetSuccessRatio,
    minimumCompletedOperations: input.minimumCompletedOperations,
    evidence: input.evidence,
  };
}

export type V3StarterAvailabilityDecision = {
  schemaVersion: 1;
  status: "healthy" | "reliability_freeze" | "insufficient_data" | "invalid";
  scope: V3SloScope;
  alert: null | {
    code: "operation_error_budget_exhausted";
    severity: "critical";
    operatorAction: string;
  };
  certificationClaim: false;
};

export function evaluateV3StarterAvailabilityDecision(
  evaluation: V3ErrorBudgetEvaluation,
): V3StarterAvailabilityDecision {
  if (
    evaluation.status === "invalid_objective"
    || evaluation.status === "invalid_observation"
  ) {
    return {
      schemaVersion: 1,
      status: "invalid",
      scope: evaluation.scope,
      alert: null,
      certificationClaim: false,
    };
  }
  if (evaluation.status === "insufficient_data") {
    return {
      schemaVersion: 1,
      status: "insufficient_data",
      scope: evaluation.scope,
      alert: null,
      certificationClaim: false,
    };
  }
  if (evaluation.status === "exhausted") {
    return {
      schemaVersion: 1,
      status: "reliability_freeze",
      scope: evaluation.scope,
      alert: {
        code: "operation_error_budget_exhausted",
        severity: "critical",
        operatorAction:
          "Prioritize reliability investigation and recovery before risky feature rollout; do not hide the exhausted budget by changing the target.",
      },
      certificationClaim: false,
    };
  }
  return {
    schemaVersion: 1,
    status: "healthy",
    scope: evaluation.scope,
    alert: null,
    certificationClaim: false,
  };
}

export type V3CorrectnessObservation = {
  duplicateCommittedOperations: number;
  silentLostSuccessfulOperations: number;
  wrongEditionOfficialMutations: number;
};

export type V3CorrectnessSloEvaluation = {
  schemaVersion: 1;
  status: "ok" | "critical" | "invalid";
  alerts: readonly {
    code:
      | "duplicate_canonical_operation"
      | "silent_lost_successful_operation"
      | "wrong_edition_official_mutation";
    severity: "critical";
    observed: number;
    threshold: 0;
    operatorAction: string;
  }[];
  validationErrors: readonly string[];
  incidentReviewRequired: boolean;
  certificationClaim: false;
};

function nonNegativeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * System V3 correctness targets are deliberately zero-tolerance. These are not
 * availability errors to be spent from an error budget.
 */
export function evaluateV3CorrectnessSlo(
  observation: V3CorrectnessObservation,
): V3CorrectnessSloEvaluation {
  const validationErrors: string[] = [];
  for (const [field, value] of Object.entries(observation)) {
    if (!nonNegativeInteger(value)) {
      validationErrors.push(`${field} must be a non-negative safe integer`);
    }
  }
  if (validationErrors.length > 0) {
    return {
      schemaVersion: 1,
      status: "invalid",
      alerts: [],
      validationErrors,
      incidentReviewRequired: false,
      certificationClaim: false,
    };
  }

  const alerts: Array<V3CorrectnessSloEvaluation["alerts"][number]> = [];
  if (observation.duplicateCommittedOperations > 0) {
    alerts.push({
      code: "duplicate_canonical_operation",
      severity: "critical",
      observed: observation.duplicateCommittedOperations,
      threshold: 0,
      operatorAction:
        "Stop the affected consequential workflow, preserve operation/idempotency evidence and investigate duplicate commit integrity before resuming.",
    });
  }
  if (observation.silentLostSuccessfulOperations > 0) {
    alerts.push({
      code: "silent_lost_successful_operation",
      severity: "critical",
      observed: observation.silentLostSuccessfulOperations,
      threshold: 0,
      operatorAction:
        "Reconcile canonical state against operation receipts immediately and treat the loss as a major integrity incident.",
    });
  }
  if (observation.wrongEditionOfficialMutations > 0) {
    alerts.push({
      code: "wrong_edition_official_mutation",
      severity: "critical",
      observed: observation.wrongEditionOfficialMutations,
      threshold: 0,
      operatorAction:
        "Disable the affected mutation path, preserve audit evidence and investigate authorization/scope binding before restoring writes.",
    });
  }

  return {
    schemaVersion: 1,
    status: alerts.length > 0 ? "critical" : "ok",
    alerts,
    validationErrors: [],
    incidentReviewRequired: alerts.length > 0,
    certificationClaim: false,
  };
}
