import type { V3SloEvidence } from "./v3-reliability-slo";

export const V3_SLO_SCOPES = [
  "system",
  "confirmation_submission",
  "entry_mutation",
  "media_review_consequence",
  "jury_submission",
  "televote_submission",
  "voting_round_transition",
  "results_lifecycle",
  "publication",
  "notification_consequence",
  "projection_reconciliation",
] as const;

export type V3SloScope = (typeof V3_SLO_SCOPES)[number];

export type V3OperationSuccessObjective = {
  schemaVersion: 1;
  id: string;
  scope: V3SloScope;
  indicator: "successful_operation_ratio";
  targetSuccessRatio: number;
  minimumCompletedOperations: number;
  evidence: V3SloEvidence;
};

export type V3OperationSuccessObservation = {
  generatedAt: string;
  environment: string;
  commitSha: string;
  windowMinutes: number;
  completedOperations: number;
  succeededOperations: number;
};

export type V3ErrorBudgetEvaluation = {
  schemaVersion: 1;
  status:
    | "within_budget"
    | "exhausted"
    | "insufficient_data"
    | "invalid_objective"
    | "invalid_observation";
  objectiveId: string;
  scope: V3SloScope;
  indicator: "successful_operation_ratio";
  targetSuccessRatio: number;
  allowedBadRatio: number;
  observed: {
    generatedAt: string;
    environment: string;
    commitSha: string;
    windowMinutes: number;
    completedOperations: number;
    succeededOperations: number;
    badOperations: number;
    observedSuccessRatio: number | null;
    observedBadRatio: number | null;
  };
  budget: {
    allowedBadOperations: number;
    consumedBadOperations: number;
    remainingBadOperations: number;
    overspentBadOperations: number;
    consumedRatio: number | null;
    burnRate: number | null;
  };
  objectiveEvidence: V3SloEvidence;
  validationErrors: readonly string[];
  certificationClaim: false;
};

const SHA_RE = /^[0-9a-f]{40}$/i;
const scopeSet = new Set<string>(V3_SLO_SCOPES);
const evidenceSourceSet = new Set<V3SloEvidence["source"]>([
  "isolated_rehearsal",
  "staging",
  "production_observation",
]);

function finiteRatio(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function positiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

function nonNegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}

function validateObjective(objective: V3OperationSuccessObjective) {
  const errors: string[] = [];
  if (objective.schemaVersion !== 1) errors.push("objective schemaVersion must be 1");
  if (!objective.id.trim()) errors.push("objective id is required");
  if (!scopeSet.has(objective.scope)) errors.push("objective scope is not canonical");
  if (objective.indicator !== "successful_operation_ratio") {
    errors.push("objective indicator is unsupported");
  }
  if (!finiteRatio(objective.targetSuccessRatio) || objective.targetSuccessRatio <= 0) {
    errors.push("targetSuccessRatio must be greater than 0 and at most 1");
  }
  if (!positiveInteger(objective.minimumCompletedOperations)) {
    errors.push("minimumCompletedOperations must be a positive integer");
  }

  const evidence = objective.evidence;
  if (!evidenceSourceSet.has(evidence.source)) {
    errors.push("objective evidence source is unsupported");
  }
  if (!evidence.environment.trim()) errors.push("objective evidence environment is required");
  if (!evidence.rationale.trim()) errors.push("objective evidence rationale is required");
  if (!SHA_RE.test(evidence.commitSha)) {
    errors.push("objective evidence commitSha must be an exact 40-character SHA");
  }
  if (!Number.isFinite(Date.parse(evidence.observedAt))) {
    errors.push("objective evidence observedAt must be an ISO-compatible timestamp");
  }
  if (!positiveInteger(evidence.windowMinutes) || evidence.windowMinutes > 10080) {
    errors.push("objective evidence windowMinutes must be between 1 and 10080");
  }
  if (!positiveInteger(evidence.sampleCount)) {
    errors.push("objective evidence sampleCount must be a positive integer");
  } else if (
    positiveInteger(objective.minimumCompletedOperations)
    && evidence.sampleCount < objective.minimumCompletedOperations
  ) {
    errors.push("objective evidence sampleCount must cover minimumCompletedOperations");
  }
  return errors;
}

function validateObservation(observation: V3OperationSuccessObservation) {
  const errors: string[] = [];
  if (!Number.isFinite(Date.parse(observation.generatedAt))) {
    errors.push("observation generatedAt must be an ISO-compatible timestamp");
  }
  if (!observation.environment.trim()) errors.push("observation environment is required");
  if (!SHA_RE.test(observation.commitSha)) {
    errors.push("observation commitSha must be an exact 40-character SHA");
  }
  if (!positiveInteger(observation.windowMinutes) || observation.windowMinutes > 10080) {
    errors.push("observation windowMinutes must be between 1 and 10080");
  }
  if (!nonNegativeInteger(observation.completedOperations)) {
    errors.push("completedOperations must be a non-negative integer");
  }
  if (!nonNegativeInteger(observation.succeededOperations)) {
    errors.push("succeededOperations must be a non-negative integer");
  }
  if (
    nonNegativeInteger(observation.completedOperations)
    && nonNegativeInteger(observation.succeededOperations)
    && observation.succeededOperations > observation.completedOperations
  ) {
    errors.push("succeededOperations cannot exceed completedOperations");
  }
  return errors;
}

export function evaluateV3OperationErrorBudget(
  objective: V3OperationSuccessObjective,
  observation: V3OperationSuccessObservation,
): V3ErrorBudgetEvaluation {
  const objectiveErrors = validateObjective(objective);
  const observationErrors = validateObservation(observation);
  const validationErrors = [...objectiveErrors, ...observationErrors];

  const completed = nonNegativeInteger(observation.completedOperations)
    ? observation.completedOperations
    : 0;
  const succeeded = nonNegativeInteger(observation.succeededOperations)
    ? Math.min(observation.succeededOperations, completed)
    : 0;
  const badOperations = Math.max(0, completed - succeeded);
  const observedSuccessRatio = completed > 0 ? succeeded / completed : null;
  const observedBadRatio = completed > 0 ? badOperations / completed : null;
  const allowedBadRatio = finiteRatio(objective.targetSuccessRatio)
    ? Math.max(0, 1 - objective.targetSuccessRatio)
    : 0;
  const allowedBadOperations = completed * allowedBadRatio;
  const remainingBadOperations = Math.max(0, allowedBadOperations - badOperations);
  const overspentBadOperations = Math.max(0, badOperations - allowedBadOperations);
  const consumedRatio = allowedBadOperations > 0
    ? badOperations / allowedBadOperations
    : badOperations === 0
      ? 0
      : null;
  const burnRate = observedBadRatio === null
    ? null
    : allowedBadRatio > 0
      ? observedBadRatio / allowedBadRatio
      : observedBadRatio === 0
        ? 0
        : null;

  let status: V3ErrorBudgetEvaluation["status"];
  if (objectiveErrors.length > 0) status = "invalid_objective";
  else if (observationErrors.length > 0) status = "invalid_observation";
  else if (completed < objective.minimumCompletedOperations) status = "insufficient_data";
  else if (badOperations > allowedBadOperations) status = "exhausted";
  else status = "within_budget";

  return {
    schemaVersion: 1,
    status,
    objectiveId: objective.id,
    scope: objective.scope,
    indicator: "successful_operation_ratio",
    targetSuccessRatio: objective.targetSuccessRatio,
    allowedBadRatio,
    observed: {
      generatedAt: observation.generatedAt,
      environment: observation.environment,
      commitSha: observation.commitSha,
      windowMinutes: observation.windowMinutes,
      completedOperations: completed,
      succeededOperations: succeeded,
      badOperations,
      observedSuccessRatio,
      observedBadRatio,
    },
    budget: {
      allowedBadOperations,
      consumedBadOperations: badOperations,
      remainingBadOperations,
      overspentBadOperations,
      consumedRatio,
      burnRate,
    },
    objectiveEvidence: objective.evidence,
    validationErrors,
    certificationClaim: false,
  };
}
