import {
  type V3OperationSuccessObservation,
  type V3SloScope,
} from "./v3-error-budget";

/**
 * Operation-success SLI evidence requires more than the existence of an S2
 * receipt. The receipt must be claimed at the real command boundary so failed
 * infrastructure attempts can enter the same denominator as successes.
 *
 * Confirmation, public Televote and Results currently bridge completion facts
 * into S2 only after success. Notification receipts describe queue/delivery/fail
 * lifecycle facts, where notification.fail is intentionally a successfully
 * recorded event rather than a successful delivery. Projection reconciliation
 * has separate freshness/recovery evidence but no canonical operation producer.
 */
export type V3WorkflowSliScope = Exclude<
  V3SloScope,
  | "system"
  | "confirmation_submission"
  | "televote_submission"
  | "results_lifecycle"
  | "notification_consequence"
  | "projection_reconciliation"
>;

export const V3_WORKFLOW_SLI_SCOPES = [
  "entry_mutation",
  "media_review_consequence",
  "jury_submission",
  "voting_round_transition",
  "publication",
] as const satisfies readonly V3WorkflowSliScope[];

export const V3_UNINSTRUMENTED_OPERATION_SLI_SCOPES = [
  "confirmation_submission",
  "televote_submission",
  "results_lifecycle",
  "notification_consequence",
  "projection_reconciliation",
] as const satisfies readonly V3SloScope[];

export type V3WorkflowSliMetric = {
  scope: V3WorkflowSliScope;
  totalOperations: number;
  completedOperations: number;
  succeededOperations: number;
  failedOperations: number;
  uncertainOperations: number;
  processingOperations: number;
  /** Current unresolved backlog; intentionally not restricted to the lookback. */
  reconciliationPendingOperations: number;
  successRatio: number | null;
  /** Number of terminal in-window operations with non-negative timing evidence. */
  operationLatencySamples: number;
  p50OperationLatencyMs: number | null;
  p95OperationLatencyMs: number | null;
  p99OperationLatencyMs: number | null;
  consequenceCount: number;
  completedConsequenceCount: number;
  unresolvedConsequenceCount: number;
  p95ConsequenceLagMs: number;
};

export type V3WorkflowSliSnapshot = {
  schemaVersion: 3;
  generatedAt: string;
  windowMinutes: number;
  workflows: readonly V3WorkflowSliMetric[];
};

type ObservationContext = {
  environment: string;
  commitSha: string;
};

const SHA_RE = /^[0-9a-f]{40}$/i;
const WORKFLOW_SCOPE_SET = new Set<string>(V3_WORKFLOW_SLI_SCOPES);

function assertFiniteNonNegativeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
}

function assertOptionalFiniteNonNegativeInteger(
  value: number | null,
  field: string,
) {
  if (value !== null) assertFiniteNonNegativeInteger(value, field);
}

function validateMetric(metric: V3WorkflowSliMetric) {
  if (!WORKFLOW_SCOPE_SET.has(metric.scope)) {
    throw new Error(`Unsupported workflow SLI scope: ${metric.scope}`);
  }

  for (const [field, value] of [
    ["totalOperations", metric.totalOperations],
    ["completedOperations", metric.completedOperations],
    ["succeededOperations", metric.succeededOperations],
    ["failedOperations", metric.failedOperations],
    ["uncertainOperations", metric.uncertainOperations],
    ["processingOperations", metric.processingOperations],
    ["reconciliationPendingOperations", metric.reconciliationPendingOperations],
    ["operationLatencySamples", metric.operationLatencySamples],
    ["consequenceCount", metric.consequenceCount],
    ["completedConsequenceCount", metric.completedConsequenceCount],
    ["unresolvedConsequenceCount", metric.unresolvedConsequenceCount],
    ["p95ConsequenceLagMs", metric.p95ConsequenceLagMs],
  ] as const) {
    assertFiniteNonNegativeInteger(value, field);
  }

  for (const [field, value] of [
    ["p50OperationLatencyMs", metric.p50OperationLatencyMs],
    ["p95OperationLatencyMs", metric.p95OperationLatencyMs],
    ["p99OperationLatencyMs", metric.p99OperationLatencyMs],
  ] as const) {
    assertOptionalFiniteNonNegativeInteger(value, field);
  }

  if (metric.completedOperations > metric.totalOperations) {
    throw new Error("completedOperations cannot exceed totalOperations");
  }
  if (metric.succeededOperations > metric.completedOperations) {
    throw new Error("succeededOperations cannot exceed completedOperations");
  }
  if (
    metric.succeededOperations + metric.failedOperations + metric.uncertainOperations
    !== metric.completedOperations
  ) {
    throw new Error(
      "completedOperations must equal succeeded + failed + uncertain operations",
    );
  }
  if (metric.completedOperations + metric.processingOperations !== metric.totalOperations) {
    throw new Error("totalOperations must equal completed + processing operations");
  }

  const unresolvedInWindow = metric.uncertainOperations + metric.processingOperations;
  if (metric.reconciliationPendingOperations < unresolvedInWindow) {
    throw new Error(
      "reconciliationPendingOperations cannot be lower than unresolved operations in the observation window",
    );
  }

  if (metric.operationLatencySamples > metric.completedOperations) {
    throw new Error("operationLatencySamples cannot exceed completedOperations");
  }
  const latencyPercentiles = [
    metric.p50OperationLatencyMs,
    metric.p95OperationLatencyMs,
    metric.p99OperationLatencyMs,
  ] as const;
  if (metric.operationLatencySamples === 0) {
    if (latencyPercentiles.some((value) => value !== null)) {
      throw new Error(
        "operation latency percentiles must be null when no trustworthy timing samples exist",
      );
    }
  } else {
    if (latencyPercentiles.some((value) => value === null)) {
      throw new Error(
        "operation latency percentiles are required when trustworthy timing samples exist",
      );
    }
    const [p50, p95, p99] = latencyPercentiles as readonly number[];
    if (p50 > p95 || p95 > p99) {
      throw new Error("operation latency percentiles must be monotonic");
    }
  }

  if (metric.completedConsequenceCount > metric.consequenceCount) {
    throw new Error("completedConsequenceCount cannot exceed consequenceCount");
  }
  if (metric.unresolvedConsequenceCount > metric.consequenceCount) {
    throw new Error("unresolvedConsequenceCount cannot exceed consequenceCount");
  }
  if (
    metric.successRatio !== null
    && (!Number.isFinite(metric.successRatio)
      || metric.successRatio < 0
      || metric.successRatio > 1)
  ) {
    throw new Error("successRatio must be null or a finite ratio between 0 and 1");
  }
  if (metric.completedOperations === 0 && metric.successRatio !== null) {
    throw new Error("successRatio must be null when there are no completed operations");
  }
}

/**
 * Convert one server-aggregated workflow SLI row into the canonical S10
 * operation-success observation shape. Only scopes with a true attempt boundary
 * are accepted. Completion/event bridges stay visible in operational telemetry
 * but cannot be laundered into an availability/error-budget observation.
 */
export function workflowOperationObservation(
  snapshot: V3WorkflowSliSnapshot,
  scope: V3WorkflowSliScope,
  context: ObservationContext,
): V3OperationSuccessObservation {
  if (snapshot.schemaVersion !== 3) {
    throw new Error("workflow SLI schemaVersion must be 3");
  }
  if (!Number.isFinite(Date.parse(snapshot.generatedAt))) {
    throw new Error("workflow SLI generatedAt must be an ISO-compatible timestamp");
  }
  if (
    !Number.isInteger(snapshot.windowMinutes)
    || snapshot.windowMinutes < 5
    || snapshot.windowMinutes > 10080
  ) {
    throw new Error("workflow SLI windowMinutes must be between 5 and 10080");
  }
  if (!context.environment.trim()) {
    throw new Error("workflow SLI environment is required");
  }
  if (!SHA_RE.test(context.commitSha)) {
    throw new Error("workflow SLI commitSha must be an exact 40-character SHA");
  }
  if (!WORKFLOW_SCOPE_SET.has(scope)) {
    throw new Error(`Unsupported workflow SLI scope: ${scope}`);
  }

  const matches = snapshot.workflows.filter((metric) => metric.scope === scope);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one workflow SLI row for ${scope}; received ${matches.length}`,
    );
  }

  const metric = matches[0];
  validateMetric(metric);

  return {
    generatedAt: snapshot.generatedAt,
    environment: context.environment,
    commitSha: context.commitSha,
    windowMinutes: snapshot.windowMinutes,
    completedOperations: metric.completedOperations,
    succeededOperations: metric.succeededOperations,
  };
}
