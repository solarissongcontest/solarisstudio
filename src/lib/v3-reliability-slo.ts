export const V3_OPERATION_ERROR_CODES = [
  "AUTHENTICATION",
  "AUTHORIZATION",
  "VALIDATION",
  "STATE_CHANGED",
  "VERSION_CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMIT",
  "DEPENDENCY_FAILURE",
  "DATABASE",
  "STORAGE",
  "TIMEOUT",
  "UNKNOWN",
] as const;

export type V3OperationErrorCode = (typeof V3_OPERATION_ERROR_CODES)[number];

export type V3ReliabilityFailureClass =
  | "authentication_failure"
  | "authorization_failure"
  | "validation_failure"
  | "conflict_or_stale_state"
  | "dependency_failure"
  | "transient_infrastructure_failure"
  | "permanent_domain_failure"
  | "reconciliation_pending"
  | "operator_required_recovery"
  | "unknown_failure";

export function classifyV3ReliabilityFailure(input: {
  errorCode?: V3OperationErrorCode | null;
  reconciliationRequired?: boolean;
  operatorRecoveryRequired?: boolean;
  domainDisposition?: "transient" | "permanent";
}): V3ReliabilityFailureClass {
  if (input.operatorRecoveryRequired) return "operator_required_recovery";
  if (input.reconciliationRequired) return "reconciliation_pending";

  switch (input.errorCode) {
    case "AUTHENTICATION":
      return "authentication_failure";
    case "AUTHORIZATION":
      return "authorization_failure";
    case "VALIDATION":
      return "validation_failure";
    case "STATE_CHANGED":
    case "VERSION_CONFLICT":
    case "IDEMPOTENCY_CONFLICT":
      return "conflict_or_stale_state";
    case "DEPENDENCY_FAILURE":
      return input.domainDisposition === "permanent"
        ? "permanent_domain_failure"
        : "dependency_failure";
    case "RATE_LIMIT":
    case "DATABASE":
    case "STORAGE":
    case "TIMEOUT":
      return "transient_infrastructure_failure";
    case "UNKNOWN":
    case null:
    case undefined:
      return input.domainDisposition === "permanent"
        ? "permanent_domain_failure"
        : "unknown_failure";
  }
}

export type V3OperationalMetricsSnapshot = {
  schemaVersion: number;
  generatedAt: string;
  windowMinutes: number;
  windowStart: string;
  operations: {
    total: number;
    completed: number;
    processing: number;
    succeeded: number;
    failed: number;
    uncertain: number;
    successRate: number | null;
    oldestProcessingAgeSeconds: number;
    errorCounts: Record<string, number>;
  };
  deliveries: {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    deadLetter: number;
    retrying: number;
    totalAttempts: number;
    expiredProcessingLeases: number;
    oldestActionableAgeSeconds: number;
    averageCompletedLagMs: number;
    p95CompletedLagMs: number;
    maxCompletedLagMs: number;
    errorCounts: Record<string, number>;
  };
  reconciliation: {
    processingOperations: number;
    uncertainOperations: number;
    oldestProcessingAgeSeconds: number;
    deadLetterDeliveries: number;
    expiredProcessingLeases: number;
  };
};

export type V3SloEvidence = {
  source: "isolated_rehearsal" | "staging" | "production_observation";
  environment: string;
  observedAt: string;
  commitSha: string;
  windowMinutes: number;
  sampleCount: number;
  rationale: string;
};

type UpperThreshold = {
  warningAbove: number;
  criticalAbove: number;
};

type LowerThreshold = {
  warningBelow: number;
  criticalBelow: number;
};

export type V3SloPolicy = {
  id: string;
  evidence: V3SloEvidence;
  minCompletedOperations: number;
  thresholds: {
    operationSuccessRate?: LowerThreshold;
    p95ConsequenceLagMs?: UpperThreshold;
    oldestActionableDeliveryAgeSeconds?: UpperThreshold;
    deadLetterDeliveries?: UpperThreshold;
    expiredProcessingLeases?: UpperThreshold;
    uncertainOperations?: UpperThreshold;
    oldestProcessingOperationAgeSeconds?: UpperThreshold;
  };
};

export type V3ReliabilityAlertMetric = keyof V3SloPolicy["thresholds"];

export type V3ReliabilityAlert = {
  code: string;
  severity: "warning" | "critical";
  metric: V3ReliabilityAlertMetric;
  observed: number;
  threshold: number;
  operatorAction: string;
};

export type V3SloEvaluation = {
  status: "ok" | "warning" | "critical" | "insufficient_data" | "invalid_policy";
  policyId: string;
  generatedAt: string;
  sample: {
    completedOperations: number;
    windowMinutes: number;
  };
  alerts: readonly V3ReliabilityAlert[];
  policyErrors: readonly string[];
};

export type V3SliBaseline = {
  schemaVersion: 1;
  capturedAt: string;
  source: V3SloEvidence["source"];
  environment: string;
  commitSha: string;
  windowMinutes: number;
  completedOperations: number;
  metrics: {
    operationSuccessRate: number | null;
    p95ConsequenceLagMs: number;
    oldestActionableDeliveryAgeSeconds: number;
    deadLetterDeliveries: number;
    expiredProcessingLeases: number;
    uncertainOperations: number;
    oldestProcessingOperationAgeSeconds: number;
  };
};

const SHA_RE = /^[0-9a-f]{40}$/i;

function isFiniteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function validateUpperThreshold(name: string, threshold: UpperThreshold, errors: string[]) {
  if (!isFiniteNonNegative(threshold.warningAbove) || !isFiniteNonNegative(threshold.criticalAbove)) {
    errors.push(`${name} thresholds must be finite and non-negative`);
  } else if (threshold.warningAbove > threshold.criticalAbove) {
    errors.push(`${name} warningAbove must not exceed criticalAbove`);
  }
}

function validateLowerThreshold(name: string, threshold: LowerThreshold, errors: string[]) {
  if (
    !Number.isFinite(threshold.warningBelow)
    || !Number.isFinite(threshold.criticalBelow)
    || threshold.warningBelow < 0
    || threshold.warningBelow > 1
    || threshold.criticalBelow < 0
    || threshold.criticalBelow > 1
  ) {
    errors.push(`${name} thresholds must be finite ratios between 0 and 1`);
  } else if (threshold.criticalBelow > threshold.warningBelow) {
    errors.push(`${name} criticalBelow must not exceed warningBelow`);
  }
}

export function validateV3SloPolicy(policy: V3SloPolicy) {
  const errors: string[] = [];
  if (!policy.id.trim()) errors.push("policy id is required");
  if (!policy.evidence.environment.trim()) errors.push("evidence environment is required");
  if (!policy.evidence.rationale.trim()) errors.push("evidence rationale is required");
  if (!SHA_RE.test(policy.evidence.commitSha)) errors.push("evidence commitSha must be an exact 40-character SHA");
  if (!Number.isFinite(Date.parse(policy.evidence.observedAt))) errors.push("evidence observedAt must be an ISO-compatible timestamp");
  if (!Number.isInteger(policy.evidence.windowMinutes) || policy.evidence.windowMinutes < 1 || policy.evidence.windowMinutes > 10080) {
    errors.push("evidence windowMinutes must be between 1 and 10080");
  }
  if (!Number.isInteger(policy.evidence.sampleCount) || policy.evidence.sampleCount <= 0) {
    errors.push("evidence sampleCount must be a positive integer");
  }
  if (!Number.isInteger(policy.minCompletedOperations) || policy.minCompletedOperations <= 0) {
    errors.push("minCompletedOperations must be a positive integer");
  }

  const configured = Object.entries(policy.thresholds).filter(([, value]) => value !== undefined);
  if (configured.length === 0) errors.push("at least one evidence-backed threshold is required");

  if (policy.thresholds.operationSuccessRate) {
    validateLowerThreshold("operationSuccessRate", policy.thresholds.operationSuccessRate, errors);
  }
  for (const metric of [
    "p95ConsequenceLagMs",
    "oldestActionableDeliveryAgeSeconds",
    "deadLetterDeliveries",
    "expiredProcessingLeases",
    "uncertainOperations",
    "oldestProcessingOperationAgeSeconds",
  ] as const) {
    const threshold = policy.thresholds[metric];
    if (threshold) validateUpperThreshold(metric, threshold, errors);
  }

  return errors;
}

export function captureV3SliBaseline(
  snapshot: V3OperationalMetricsSnapshot,
  context: Pick<V3SloEvidence, "source" | "environment" | "commitSha">,
): V3SliBaseline {
  if (!SHA_RE.test(context.commitSha)) {
    throw new Error("baseline commitSha must be an exact 40-character SHA");
  }
  if (!context.environment.trim()) throw new Error("baseline environment is required");

  return {
    schemaVersion: 1,
    capturedAt: snapshot.generatedAt,
    source: context.source,
    environment: context.environment,
    commitSha: context.commitSha,
    windowMinutes: snapshot.windowMinutes,
    completedOperations: snapshot.operations.completed,
    metrics: {
      operationSuccessRate: snapshot.operations.successRate,
      p95ConsequenceLagMs: snapshot.deliveries.p95CompletedLagMs,
      oldestActionableDeliveryAgeSeconds: snapshot.deliveries.oldestActionableAgeSeconds,
      deadLetterDeliveries: snapshot.deliveries.deadLetter,
      expiredProcessingLeases: snapshot.deliveries.expiredProcessingLeases,
      uncertainOperations: snapshot.operations.uncertain,
      oldestProcessingOperationAgeSeconds: snapshot.operations.oldestProcessingAgeSeconds,
    },
  };
}

function upperAlert(
  metric: V3ReliabilityAlertMetric,
  observed: number,
  threshold: UpperThreshold | undefined,
  code: string,
  operatorAction: string,
): V3ReliabilityAlert | null {
  if (!threshold) return null;
  if (observed > threshold.criticalAbove) {
    return { code, severity: "critical", metric, observed, threshold: threshold.criticalAbove, operatorAction };
  }
  if (observed > threshold.warningAbove) {
    return { code, severity: "warning", metric, observed, threshold: threshold.warningAbove, operatorAction };
  }
  return null;
}

function lowerAlert(
  metric: V3ReliabilityAlertMetric,
  observed: number | null,
  threshold: LowerThreshold | undefined,
  code: string,
  operatorAction: string,
): V3ReliabilityAlert | null {
  if (!threshold || observed === null) return null;
  if (observed < threshold.criticalBelow) {
    return { code, severity: "critical", metric, observed, threshold: threshold.criticalBelow, operatorAction };
  }
  if (observed < threshold.warningBelow) {
    return { code, severity: "warning", metric, observed, threshold: threshold.warningBelow, operatorAction };
  }
  return null;
}

export function evaluateV3SloPolicy(
  snapshot: V3OperationalMetricsSnapshot,
  policy: V3SloPolicy,
): V3SloEvaluation {
  const policyErrors = validateV3SloPolicy(policy);
  const base = {
    policyId: policy.id,
    generatedAt: snapshot.generatedAt,
    sample: {
      completedOperations: snapshot.operations.completed,
      windowMinutes: snapshot.windowMinutes,
    },
  };

  if (policyErrors.length > 0) {
    return { ...base, status: "invalid_policy", alerts: [], policyErrors };
  }
  if (snapshot.operations.completed < policy.minCompletedOperations) {
    return { ...base, status: "insufficient_data", alerts: [], policyErrors: [] };
  }

  const alerts = [
    lowerAlert(
      "operationSuccessRate",
      snapshot.operations.successRate,
      policy.thresholds.operationSuccessRate,
      "operation_success_rate_low",
      "Inspect privacy-safe failure-class counts and the affected critical workflow before retrying operations.",
    ),
    upperAlert(
      "p95ConsequenceLagMs",
      snapshot.deliveries.p95CompletedLagMs,
      policy.thresholds.p95ConsequenceLagMs,
      "consequence_delivery_lag_high",
      "Inspect outbox consumer backlog, worker health and retry pressure; use canonical replay only after the failure cause is understood.",
    ),
    upperAlert(
      "oldestActionableDeliveryAgeSeconds",
      snapshot.deliveries.oldestActionableAgeSeconds,
      policy.thresholds.oldestActionableDeliveryAgeSeconds,
      "outbox_oldest_actionable_age_high",
      "Trace the oldest exact event/consumer delivery and determine whether it is waiting, lease-stuck or poison before recovery.",
    ),
    upperAlert(
      "deadLetterDeliveries",
      snapshot.deliveries.deadLetter,
      policy.thresholds.deadLetterDeliveries,
      "outbox_dead_letter_backlog_high",
      "Diagnose each dead-letter consumer failure, fix the cause, then replay only the exact delivery through the canonical service-role requeue path.",
    ),
    upperAlert(
      "expiredProcessingLeases",
      snapshot.deliveries.expiredProcessingLeases,
      policy.thresholds.expiredProcessingLeases,
      "outbox_expired_leases_high",
      "Inspect consumer worker health and allow the canonical lease claim path to recover expired work; do not edit outbox rows manually.",
    ),
    upperAlert(
      "uncertainOperations",
      snapshot.operations.uncertain,
      policy.thresholds.uncertainOperations,
      "uncertain_operations_high",
      "Reconcile the exact operation receipts before any client or operator retries the underlying command.",
    ),
    upperAlert(
      "oldestProcessingOperationAgeSeconds",
      snapshot.operations.oldestProcessingAgeSeconds,
      policy.thresholds.oldestProcessingOperationAgeSeconds,
      "processing_operation_age_high",
      "Trace the exact operation/correlation chain and reconcile committed canonical state before deciding whether recovery is required.",
    ),
  ].filter((alert): alert is V3ReliabilityAlert => alert !== null);

  const status = alerts.some((alert) => alert.severity === "critical")
    ? "critical"
    : alerts.length > 0
      ? "warning"
      : "ok";

  return { ...base, status, alerts, policyErrors: [] };
}