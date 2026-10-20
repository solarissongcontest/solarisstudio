import {
  V3_SLO_SCOPES,
  type V3OperationSuccessObservation,
  type V3SloScope,
} from "./v3-error-budget";

export type V3WorkflowSliScope = Exclude<V3SloScope, "system">;

export const V3_WORKFLOW_SLI_SCOPES = V3_SLO_SCOPES.filter(
  (scope): scope is V3WorkflowSliScope => scope !== "system",
);

export type V3WorkflowSliMetric = {
  scope: V3WorkflowSliScope;
  totalOperations: number;
  completedOperations: number;
  succeededOperations: number;
  failedOperations: number;
  uncertainOperations: number;
  processingOperations: number;
  reconciliationPendingOperations: number;
  successRatio: number | null;
  p50OperationLatencyMs: number;
  p95OperationLatencyMs: number;
  p99OperationLatencyMs: number;
  consequenceCount: number;
  completedConsequenceCount: number;
  unresolvedConsequenceCount: number;
  p95ConsequenceLagMs: number;
};

export type V3WorkflowSliSnapshot = {
  schemaVersion: number;
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
    ["p50OperationLatencyMs", metric.p50OperationLatencyMs],
    ["p95OperationLatencyMs", metric.p95OperationLatencyMs],
    ["p99OperationLatencyMs", metric.p99OperationLatencyMs],
    ["consequenceCount", metric.consequenceCount],
    ["completedConsequenceCount", metric.completedConsequenceCount],
    ["unresolvedConsequenceCount", metric.unresolvedConsequenceCount],
    ["p95ConsequenceLagMs", metric.p95ConsequenceLagMs],
  ] as const) {
    assertFiniteNonNegativeInteger(value, field);
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
  if (
    metric.reconciliationPendingOperations
    !== metric.uncertainOperations + metric.processingOperations
  ) {
    throw new Error(
      "reconciliationPendingOperations must equal uncertain + processing operations",
    );
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
 * Convert one server-aggregated workflow SLI row into the already-canonical S10
 * operation-success observation shape. This deliberately accepts only the
 * aggregate snapshot. Callers must never derive workflow evidence by filtering
 * raw operation receipts in the browser or in release tooling.
 */
export function workflowOperationObservation(
  snapshot: V3WorkflowSliSnapshot,
  scope: V3WorkflowSliScope,
  context: ObservationContext,
): V3OperationSuccessObservation {
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
