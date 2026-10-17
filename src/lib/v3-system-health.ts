import type {
  V3OperationalMetricsSnapshot,
  V3ReliabilityAlert,
  V3ReliabilityAlertMetric,
  V3SloEvaluation,
} from "./v3-reliability-slo";

export type V3SystemHealthLevel =
  | "healthy"
  | "degraded"
  | "critical"
  | "insufficient_data"
  | "invalid";

export type V3SubsystemHealthLevel = "healthy" | "degraded" | "critical" | "unknown";

export type V3RecoveryReadinessSummary = {
  rebuildableProjectionCount: number;
  blockedProjectionCount: number;
  maxBatchSize: number;
  deadLetterReplayAvailable: boolean;
};

export type V3SystemHealth = {
  schemaVersion: 1;
  generatedAt: string;
  windowMinutes: number;
  status: V3SystemHealthLevel;
  policy: {
    id: string;
    status: V3SloEvaluation["status"];
  };
  subsystems: {
    operations: {
      status: V3SubsystemHealthLevel;
      completed: number;
      processing: number;
      uncertain: number;
      successRate: number | null;
      oldestProcessingAgeSeconds: number;
      alertCodes: readonly string[];
    };
    consequences: {
      status: V3SubsystemHealthLevel;
      pending: number;
      processing: number;
      retrying: number;
      deadLetter: number;
      expiredProcessingLeases: number;
      oldestActionableAgeSeconds: number;
      p95CompletedLagMs: number;
      alertCodes: readonly string[];
    };
    reconciliation: {
      status: V3SubsystemHealthLevel;
      required: boolean;
      reasons: readonly (
        | "uncertain_operations"
        | "dead_letter_deliveries"
        | "expired_processing_leases"
      )[];
      uncertainOperations: number;
      deadLetterDeliveries: number;
      expiredProcessingLeases: number;
      alertCodes: readonly string[];
    };
  };
  recoveryReadiness: {
    status: "available" | "partial" | "unknown";
    rebuildableProjectionCount: number | null;
    blockedProjectionCount: number | null;
    maxBatchSize: number | null;
    deadLetterReplayAvailable: boolean | null;
  };
  criticalAlertCodes: readonly string[];
  operatorActions: readonly string[];
  validationErrors: readonly string[];
  privacy: {
    aggregateOnly: true;
    userIdentifiers: false;
    rawPayloads: false;
    highCardinalityLabels: false;
  };
};

const OPERATION_METRICS = new Set<V3ReliabilityAlertMetric>([
  "operationSuccessRate",
  "oldestProcessingOperationAgeSeconds",
]);
const RECONCILIATION_METRICS = new Set<V3ReliabilityAlertMetric>([
  "uncertainOperations",
]);

function validDate(value: string) {
  return Number.isFinite(Date.parse(value));
}

function finiteNonNegative(value: number) {
  return Number.isFinite(value) && value >= 0;
}

function nonNegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}

function validateSnapshot(snapshot: V3OperationalMetricsSnapshot) {
  const errors: string[] = [];
  if (!Number.isInteger(snapshot.windowMinutes) || snapshot.windowMinutes < 1 || snapshot.windowMinutes > 10080) {
    errors.push("snapshot windowMinutes must be between 1 and 10080");
  }
  if (!validDate(snapshot.generatedAt)) errors.push("snapshot generatedAt must be a timestamp");
  if (!validDate(snapshot.windowStart)) errors.push("snapshot windowStart must be a timestamp");
  if (
    validDate(snapshot.generatedAt)
    && validDate(snapshot.windowStart)
    && Date.parse(snapshot.windowStart) > Date.parse(snapshot.generatedAt)
  ) {
    errors.push("snapshot windowStart cannot be after generatedAt");
  }

  for (const [name, value] of Object.entries({
    operationTotal: snapshot.operations.total,
    operationCompleted: snapshot.operations.completed,
    operationProcessing: snapshot.operations.processing,
    operationSucceeded: snapshot.operations.succeeded,
    operationFailed: snapshot.operations.failed,
    operationUncertain: snapshot.operations.uncertain,
    deliveryTotal: snapshot.deliveries.total,
    deliveryPending: snapshot.deliveries.pending,
    deliveryProcessing: snapshot.deliveries.processing,
    deliveryCompleted: snapshot.deliveries.completed,
    deliveryDeadLetter: snapshot.deliveries.deadLetter,
    deliveryRetrying: snapshot.deliveries.retrying,
    deliveryTotalAttempts: snapshot.deliveries.totalAttempts,
    deliveryExpiredLeases: snapshot.deliveries.expiredProcessingLeases,
  })) {
    if (!nonNegativeInteger(value)) errors.push(`${name} must be a non-negative integer`);
  }

  if (
    snapshot.operations.successRate !== null
    && (!Number.isFinite(snapshot.operations.successRate)
      || snapshot.operations.successRate < 0
      || snapshot.operations.successRate > 1)
  ) {
    errors.push("operation successRate must be null or a ratio between 0 and 1");
  }

  for (const [name, value] of Object.entries({
    oldestProcessingAgeSeconds: snapshot.operations.oldestProcessingAgeSeconds,
    oldestActionableAgeSeconds: snapshot.deliveries.oldestActionableAgeSeconds,
    averageCompletedLagMs: snapshot.deliveries.averageCompletedLagMs,
    p95CompletedLagMs: snapshot.deliveries.p95CompletedLagMs,
    maxCompletedLagMs: snapshot.deliveries.maxCompletedLagMs,
  })) {
    if (!finiteNonNegative(value)) errors.push(`${name} must be finite and non-negative`);
  }

  if (snapshot.reconciliation.processingOperations !== snapshot.operations.processing) {
    errors.push("reconciliation processingOperations does not match operations.processing");
  }
  if (snapshot.reconciliation.uncertainOperations !== snapshot.operations.uncertain) {
    errors.push("reconciliation uncertainOperations does not match operations.uncertain");
  }
  if (
    snapshot.reconciliation.oldestProcessingAgeSeconds
    !== snapshot.operations.oldestProcessingAgeSeconds
  ) {
    errors.push("reconciliation oldestProcessingAgeSeconds does not match operations");
  }
  if (snapshot.reconciliation.deadLetterDeliveries !== snapshot.deliveries.deadLetter) {
    errors.push("reconciliation deadLetterDeliveries does not match deliveries.deadLetter");
  }
  if (
    snapshot.reconciliation.expiredProcessingLeases
    !== snapshot.deliveries.expiredProcessingLeases
  ) {
    errors.push("reconciliation expiredProcessingLeases does not match deliveries");
  }

  return errors;
}

function validateEvaluation(snapshot: V3OperationalMetricsSnapshot, evaluation: V3SloEvaluation) {
  const errors: string[] = [];
  if (evaluation.generatedAt !== snapshot.generatedAt) {
    errors.push("SLO evaluation generatedAt does not match snapshot generatedAt");
  }
  if (evaluation.sample.windowMinutes !== snapshot.windowMinutes) {
    errors.push("SLO evaluation window does not match snapshot window");
  }
  if (evaluation.sample.completedOperations !== snapshot.operations.completed) {
    errors.push("SLO evaluation completed-operation sample does not match snapshot");
  }

  if (evaluation.status === "ok" && evaluation.alerts.length > 0) {
    errors.push("SLO evaluation status ok cannot contain alerts");
  }
  if (
    evaluation.status === "warning"
    && (evaluation.alerts.length === 0 || evaluation.alerts.some((alert) => alert.severity === "critical"))
  ) {
    errors.push("SLO evaluation warning status must contain warning alerts and no critical alerts");
  }
  if (
    evaluation.status === "critical"
    && !evaluation.alerts.some((alert) => alert.severity === "critical")
  ) {
    errors.push("SLO evaluation critical status must contain a critical alert");
  }
  if (evaluation.status === "insufficient_data" && evaluation.alerts.length > 0) {
    errors.push("SLO evaluation insufficient_data status cannot contain alerts");
  }
  if (evaluation.status === "invalid_policy" && evaluation.policyErrors.length === 0) {
    errors.push("SLO evaluation invalid_policy status must include policy errors");
  }
  if (evaluation.status !== "invalid_policy" && evaluation.policyErrors.length > 0) {
    errors.push("SLO evaluation policy errors require invalid_policy status");
  }

  for (const alert of evaluation.alerts) {
    if (!Number.isFinite(alert.observed) || !Number.isFinite(alert.threshold)) {
      errors.push(`SLO alert ${alert.code} must contain finite observed and threshold values`);
    }
    if (!alert.operatorAction.trim()) {
      errors.push(`SLO alert ${alert.code} must contain an operator action`);
    }
  }

  return errors;
}

function validateRecoveryReadiness(readiness: V3RecoveryReadinessSummary | null | undefined) {
  const errors: string[] = [];
  if (!readiness) return errors;
  if (!nonNegativeInteger(readiness.rebuildableProjectionCount)) {
    errors.push("recovery rebuildableProjectionCount must be a non-negative integer");
  }
  if (!nonNegativeInteger(readiness.blockedProjectionCount)) {
    errors.push("recovery blockedProjectionCount must be a non-negative integer");
  }
  if (!Number.isInteger(readiness.maxBatchSize) || readiness.maxBatchSize <= 0) {
    errors.push("recovery maxBatchSize must be a positive integer");
  }
  if (typeof readiness.deadLetterReplayAvailable !== "boolean") {
    errors.push("recovery deadLetterReplayAvailable must be boolean");
  }
  return errors;
}

function alertSubsystem(alert: V3ReliabilityAlert) {
  if (OPERATION_METRICS.has(alert.metric)) return "operations" as const;
  if (RECONCILIATION_METRICS.has(alert.metric)) return "reconciliation" as const;
  return "consequences" as const;
}

function statusForAlerts(alerts: readonly V3ReliabilityAlert[]): V3SubsystemHealthLevel {
  if (alerts.some((alert) => alert.severity === "critical")) return "critical";
  if (alerts.length > 0) return "degraded";
  return "healthy";
}

function maxSubsystemStatus(
  left: V3SubsystemHealthLevel,
  right: V3SubsystemHealthLevel,
): V3SubsystemHealthLevel {
  const rank: Record<V3SubsystemHealthLevel, number> = {
    unknown: 0,
    healthy: 1,
    degraded: 2,
    critical: 3,
  };
  return rank[right] > rank[left] ? right : left;
}

function unique(values: readonly string[]) {
  return [...new Set(values)];
}

export function buildV3SystemHealth(input: {
  snapshot: V3OperationalMetricsSnapshot;
  evaluation: V3SloEvaluation;
  recoveryReadiness?: V3RecoveryReadinessSummary | null;
}): V3SystemHealth {
  const { snapshot, evaluation } = input;
  const validationErrors = [
    ...validateSnapshot(snapshot),
    ...validateEvaluation(snapshot, evaluation),
    ...validateRecoveryReadiness(input.recoveryReadiness),
  ];

  const baseUnknown = validationErrors.length > 0 || evaluation.status === "invalid_policy";
  const operationAlerts = evaluation.alerts.filter((alert) => alertSubsystem(alert) === "operations");
  const consequenceAlerts = evaluation.alerts.filter((alert) => alertSubsystem(alert) === "consequences");
  const reconciliationAlerts = evaluation.alerts.filter(
    (alert) => alertSubsystem(alert) === "reconciliation",
  );

  const reconciliationReasons: V3SystemHealth["subsystems"]["reconciliation"]["reasons"] = [
    ...(snapshot.reconciliation.uncertainOperations > 0 ? ["uncertain_operations" as const] : []),
    ...(snapshot.reconciliation.deadLetterDeliveries > 0 ? ["dead_letter_deliveries" as const] : []),
    ...(snapshot.reconciliation.expiredProcessingLeases > 0
      ? ["expired_processing_leases" as const]
      : []),
  ];

  const operationsStatus: V3SubsystemHealthLevel = baseUnknown
    ? "unknown"
    : statusForAlerts(operationAlerts);
  let consequencesStatus: V3SubsystemHealthLevel = baseUnknown
    ? "unknown"
    : statusForAlerts(consequenceAlerts);
  let reconciliationStatus: V3SubsystemHealthLevel = baseUnknown
    ? "unknown"
    : statusForAlerts(reconciliationAlerts);

  if (!baseUnknown && snapshot.deliveries.deadLetter > 0) {
    consequencesStatus = maxSubsystemStatus(consequencesStatus, "degraded");
  }
  if (!baseUnknown && snapshot.deliveries.expiredProcessingLeases > 0) {
    consequencesStatus = maxSubsystemStatus(consequencesStatus, "degraded");
  }
  if (!baseUnknown && reconciliationReasons.length > 0) {
    reconciliationStatus = maxSubsystemStatus(reconciliationStatus, "degraded");
  }

  const criticalAlertCodes = evaluation.alerts
    .filter((alert) => alert.severity === "critical")
    .map((alert) => alert.code);

  const operatorActions = unique([
    ...evaluation.alerts.map((alert) => alert.operatorAction),
    ...(snapshot.reconciliation.uncertainOperations > 0
      ? ["Reconcile uncertain operation receipts before retrying the underlying commands."]
      : []),
    ...(snapshot.reconciliation.deadLetterDeliveries > 0
      ? ["Diagnose each exact dead-letter event/consumer pair before bounded canonical replay."]
      : []),
    ...(snapshot.reconciliation.expiredProcessingLeases > 0
      ? ["Inspect consumer worker health and lease expiry before intervening in delivery state."]
      : []),
  ]);

  const recovery = validationErrors.length === 0 ? input.recoveryReadiness ?? null : null;
  const recoveryStatus = !recovery
    ? "unknown"
    : recovery.blockedProjectionCount > 0
      ? "partial"
      : "available";

  let status: V3SystemHealthLevel;
  if (validationErrors.length > 0 || evaluation.status === "invalid_policy") {
    status = "invalid";
  } else if (
    operationsStatus === "critical"
    || consequencesStatus === "critical"
    || reconciliationStatus === "critical"
  ) {
    status = "critical";
  } else if (
    operationsStatus === "degraded"
    || consequencesStatus === "degraded"
    || reconciliationStatus === "degraded"
  ) {
    status = "degraded";
  } else if (evaluation.status === "insufficient_data") {
    status = "insufficient_data";
  } else {
    status = "healthy";
  }

  return {
    schemaVersion: 1,
    generatedAt: snapshot.generatedAt,
    windowMinutes: snapshot.windowMinutes,
    status,
    policy: {
      id: evaluation.policyId,
      status: evaluation.status,
    },
    subsystems: {
      operations: {
        status: operationsStatus,
        completed: snapshot.operations.completed,
        processing: snapshot.operations.processing,
        uncertain: snapshot.operations.uncertain,
        successRate: snapshot.operations.successRate,
        oldestProcessingAgeSeconds: snapshot.operations.oldestProcessingAgeSeconds,
        alertCodes: operationAlerts.map((alert) => alert.code),
      },
      consequences: {
        status: consequencesStatus,
        pending: snapshot.deliveries.pending,
        processing: snapshot.deliveries.processing,
        retrying: snapshot.deliveries.retrying,
        deadLetter: snapshot.deliveries.deadLetter,
        expiredProcessingLeases: snapshot.deliveries.expiredProcessingLeases,
        oldestActionableAgeSeconds: snapshot.deliveries.oldestActionableAgeSeconds,
        p95CompletedLagMs: snapshot.deliveries.p95CompletedLagMs,
        alertCodes: consequenceAlerts.map((alert) => alert.code),
      },
      reconciliation: {
        status: reconciliationStatus,
        required: reconciliationReasons.length > 0,
        reasons: reconciliationReasons,
        uncertainOperations: snapshot.reconciliation.uncertainOperations,
        deadLetterDeliveries: snapshot.reconciliation.deadLetterDeliveries,
        expiredProcessingLeases: snapshot.reconciliation.expiredProcessingLeases,
        alertCodes: reconciliationAlerts.map((alert) => alert.code),
      },
    },
    recoveryReadiness: {
      status: recoveryStatus,
      rebuildableProjectionCount: recovery?.rebuildableProjectionCount ?? null,
      blockedProjectionCount: recovery?.blockedProjectionCount ?? null,
      maxBatchSize: recovery?.maxBatchSize ?? null,
      deadLetterReplayAvailable: recovery?.deadLetterReplayAvailable ?? null,
    },
    criticalAlertCodes,
    operatorActions,
    validationErrors,
    privacy: {
      aggregateOnly: true,
      userIdentifiers: false,
      rawPayloads: false,
      highCardinalityLabels: false,
    },
  };
}
