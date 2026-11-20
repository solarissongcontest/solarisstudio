import { V3_SLO_SCOPES, type V3SloScope } from "./v3-error-budget";
import {
  V3_STARTER_AVAILABILITY_POLICIES,
  V3_STARTER_LATENCY_GOALS,
} from "./v3-s10-slo-policy";

export const V3_S10_REQUIRED_CRITICAL_ALERTS = [
  "critical_submission_error_rate_spike",
  "result_publication_mismatch",
  "database_unavailable",
  "auth_failure_spike",
  "production_egress_anomaly",
  "notification_queue_deadline_drain_failure",
] as const;

export type V3S10CriticalAlertCode = (typeof V3_S10_REQUIRED_CRITICAL_ALERTS)[number];

export type V3S10EvidenceStatus =
  | "invalid"
  | "measurement_incomplete"
  | "review_incomplete"
  | "alert_incomplete"
  | "blocked"
  | "ready_for_qa_review";

export type V3S10EvidenceAssessment = {
  schemaVersion: 1;
  phase: "S10";
  candidateCommitSha: string | null;
  status: V3S10EvidenceStatus;
  passed: boolean;
  missingMeasurements: readonly string[];
  missingReviewedScopes: readonly V3SloScope[];
  missingFunctionalAlerts: readonly V3S10CriticalAlertCode[];
  unhealthyScopes: readonly V3SloScope[];
  errors: readonly string[];
  issuesFound: readonly string[];
  productionTrafficGenerated: false;
  certificationClaim: false;
  qaReviewRequired: true;
};

type UnknownRecord = Record<string, unknown>;

const SHA_RE = /^[0-9a-f]{40}$/i;
const SLO_SCOPE_SET = new Set<string>(V3_SLO_SCOPES);
const BASELINE_SOURCES = new Set(["isolated_rehearsal", "staging", "production_observation"]);
const REVIEW_SOURCES = new Set(["production_observation"]);
const HEALTH_STATUSES = new Set(["healthy", "reliability_freeze", "insufficient_data", "invalid"]);

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function exactSha(value: unknown): string | null {
  const normalized = nonEmptyString(value);
  return normalized && SHA_RE.test(normalized) ? normalized.toLowerCase() : null;
}

function validTimestamp(value: unknown): boolean {
  const normalized = nonEmptyString(value);
  return normalized !== null && Number.isFinite(Date.parse(normalized));
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function ratio(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1
    ? value
    : null;
}

function metricMissing(record: UnknownRecord | null, key: string, ratioMetric = false): boolean {
  if (!record) return true;
  const value = record[key];
  if (ratioMetric) return typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1;
  return typeof value !== "number" || !Number.isFinite(value) || value < 0;
}

export function assessV3S10SloEvidence(
  evidenceValue: unknown,
  expectedCommitShaValue: unknown,
): V3S10EvidenceAssessment {
  const errors: string[] = [];
  const missingMeasurements: string[] = [];
  const missingReviewedScopes: V3SloScope[] = [];
  const missingFunctionalAlerts: V3S10CriticalAlertCode[] = [];
  const unhealthyScopes: V3SloScope[] = [];
  const blockers: string[] = [];

  const evidence = asRecord(evidenceValue);
  if (!evidence) errors.push("S10 evidence must be an object");

  const expectedCommitSha = exactSha(expectedCommitShaValue);
  const candidateCommitSha = exactSha(evidence?.candidateCommitSha);
  if (!expectedCommitSha) errors.push("expected commit SHA must be an exact 40-character SHA");
  if (!candidateCommitSha) errors.push("candidateCommitSha must be an exact 40-character SHA");
  if (expectedCommitSha && candidateCommitSha && expectedCommitSha !== candidateCommitSha) {
    errors.push("candidateCommitSha does not match the expected exact SHA");
  }

  if (evidence && evidence.schemaVersion !== 1) errors.push("S10 evidence schemaVersion must be 1");
  if (evidence && evidence.productionTrafficGenerated !== false) {
    errors.push("S10 evidence must explicitly state productionTrafficGenerated=false");
  }
  if (evidence && evidence.certificationClaim !== false) {
    errors.push("S10 evidence must explicitly state certificationClaim=false");
  }
  if (evidence && evidence.qaReviewRequired !== true) {
    errors.push("S10 evidence must explicitly state qaReviewRequired=true");
  }

  const baseline = asRecord(evidence?.baseline);
  if (!baseline) {
    missingMeasurements.push("baseline");
  } else {
    const baselineSha = exactSha(baseline.commitSha);
    if (!baselineSha) errors.push("baseline.commitSha must be an exact 40-character SHA");
    if (candidateCommitSha && baselineSha && candidateCommitSha !== baselineSha) {
      errors.push("baseline.commitSha must match candidateCommitSha");
    }
    if (baseline.schemaVersion !== 1) errors.push("baseline.schemaVersion must be 1");
    if (!validTimestamp(baseline.capturedAt)) errors.push("baseline.capturedAt must be an ISO timestamp");
    if (!nonEmptyString(baseline.environment)) errors.push("baseline.environment is required");
    const baselineSource = nonEmptyString(baseline.source);
    if (!baselineSource || !BASELINE_SOURCES.has(baselineSource)) {
      errors.push("baseline.source must be isolated_rehearsal, staging or production_observation");
    }
    if (!positiveInteger(baseline.windowMinutes)) errors.push("baseline.windowMinutes must be a positive integer");
    const completedOperations = nonNegativeInteger(baseline.completedOperations);
    if (completedOperations === null) errors.push("baseline.completedOperations must be a non-negative integer");
    if (completedOperations === 0) missingMeasurements.push("completedOperations");

    const metrics = asRecord(baseline.metrics);
    const requiredMetrics: Array<[string, boolean]> = [
      ["operationSuccessRate", true],
      ["p95ConsequenceLagMs", false],
      ["oldestActionableDeliveryAgeSeconds", false],
      ["deadLetterDeliveries", false],
      ["expiredProcessingLeases", false],
      ["uncertainOperations", false],
      ["oldestProcessingOperationAgeSeconds", false],
    ];
    for (const [metric, ratioMetric] of requiredMetrics) {
      if (metricMissing(metrics, metric, ratioMetric)) missingMeasurements.push(metric);
    }
  }

  const review = asRecord(evidence?.review);
  const reviewedScopes = new Set<V3SloScope>();
  if (!review) {
    missingReviewedScopes.push(...V3_SLO_SCOPES);
  } else {
    if (!validTimestamp(review.reviewedAt)) errors.push("review.reviewedAt must be an ISO timestamp");
    if (!nonEmptyString(review.reviewer)) errors.push("review.reviewer is required");
    if (!nonEmptyString(review.rationale)) errors.push("review.rationale is required");
    if (!REVIEW_SOURCES.has(nonEmptyString(review.source) ?? "")) {
      blockers.push("S10 objectives and latency goals require reviewed production-observation evidence");
    }
    if (!nonEmptyString(review.baselineReference)) errors.push("review.baselineReference is required");

    if (!Array.isArray(review.objectives)) {
      missingReviewedScopes.push(...V3_SLO_SCOPES);
    } else {
      for (const [index, item] of review.objectives.entries()) {
        const objective = asRecord(item);
        if (!objective) {
          errors.push(`review.objectives[${index}] must be an object`);
          continue;
        }
        const scope = nonEmptyString(objective.scope);
        if (!scope || !SLO_SCOPE_SET.has(scope)) {
          errors.push(`review.objectives[${index}] has an unknown scope`);
          continue;
        }
        const typedScope = scope as V3SloScope;
        if (reviewedScopes.has(typedScope)) {
          errors.push(`duplicate reviewed S10 objective for ${typedScope}`);
          continue;
        }
        reviewedScopes.add(typedScope);

        const target = ratio(objective.targetSuccessRatio);
        if (target === null) {
          errors.push(`review.objectives[${index}].targetSuccessRatio must be a ratio above 0 and at most 1`);
        }
        const starterTarget = V3_STARTER_AVAILABILITY_POLICIES[typedScope].targetSuccessRatio;
        if (starterTarget !== null && target !== null && target !== starterTarget) {
          errors.push(
            `review objective for ${typedScope} must use canonical starter target ${starterTarget}`,
          );
        }
        if (!positiveInteger(objective.minimumCompletedOperations)) {
          errors.push(`review.objectives[${index}].minimumCompletedOperations must be positive`);
        }
        if (!nonEmptyString(objective.evidenceRef)) {
          errors.push(`review.objectives[${index}].evidenceRef is required`);
        }
        if (!nonEmptyString(objective.rationale)) {
          errors.push(`review.objectives[${index}].rationale is required`);
        }
      }
      for (const scope of V3_SLO_SCOPES) {
        if (!reviewedScopes.has(scope)) missingReviewedScopes.push(scope);
      }
    }

    const latency = asRecord(review.latencyGoals);
    if (!latency) {
      blockers.push("reviewed latency goals are missing");
    } else {
      if (
        finitePositive(latency.criticalCommandAcknowledgementP95Ms)
        !== V3_STARTER_LATENCY_GOALS.criticalCommandAcknowledgementP95Ms
      ) {
        errors.push("critical command acknowledgement p95 goal must match the canonical 1500 ms starter goal");
      }
      if (
        finitePositive(latency.commonCachedPublicProjectionP95Ms)
        !== V3_STARTER_LATENCY_GOALS.commonCachedPublicProjectionP95Ms
      ) {
        errors.push("cached public projection p95 goal must match the canonical 1000 ms starter goal");
      }
      if (!nonEmptyString(latency.evidenceRef)) errors.push("review.latencyGoals.evidenceRef is required");
      if (!nonEmptyString(latency.rationale)) errors.push("review.latencyGoals.rationale is required");
    }
  }

  const alertProofs = new Map<string, UnknownRecord>();
  if (Array.isArray(evidence?.alerts)) {
    for (const [index, item] of evidence.alerts.entries()) {
      const alert = asRecord(item);
      if (!alert) {
        errors.push(`alerts[${index}] must be an object`);
        continue;
      }
      const code = nonEmptyString(alert.code);
      if (!code) {
        errors.push(`alerts[${index}].code is required`);
        continue;
      }
      if (alertProofs.has(code)) {
        errors.push(`duplicate S10 alert proof for ${code}`);
        continue;
      }
      if (alert.severity !== "critical") errors.push(`alerts[${index}].severity must be critical`);
      if (!nonEmptyString(alert.condition)) errors.push(`alerts[${index}].condition is required`);
      if (!nonEmptyString(alert.thresholdRef)) errors.push(`alerts[${index}].thresholdRef is required`);
      if (!nonEmptyString(alert.testEvidenceRef)) errors.push(`alerts[${index}].testEvidenceRef is required`);
      if (!validTimestamp(alert.testedAt)) errors.push(`alerts[${index}].testedAt must be an ISO timestamp`);
      alertProofs.set(code, alert);
    }
  }
  for (const code of V3_S10_REQUIRED_CRITICAL_ALERTS) {
    const proof = alertProofs.get(code);
    if (!proof || proof.functional !== true) missingFunctionalAlerts.push(code);
  }

  const dashboard = asRecord(evidence?.errorBudgetDashboard);
  if (!dashboard) {
    blockers.push("error-budget dashboard evidence is missing");
  } else {
    if (!nonEmptyString(dashboard.reference)) errors.push("errorBudgetDashboard.reference is required");
    if (!validTimestamp(dashboard.reviewedAt)) errors.push("errorBudgetDashboard.reviewedAt must be an ISO timestamp");
    if (!nonEmptyString(dashboard.reviewer)) errors.push("errorBudgetDashboard.reviewer is required");
    if (dashboard.containsAllCanonicalScopes !== true) {
      blockers.push("error-budget dashboard must cover all canonical S10 scopes");
    }
    if (dashboard.errorBudgetStatusVisible !== true) {
      blockers.push("error-budget dashboard must expose current budget status");
    }
    if (dashboard.alertStateVisible !== true) {
      blockers.push("error-budget dashboard must expose alert state");
    }
  }

  const healthByScope = new Map<V3SloScope, string>();
  if (!Array.isArray(evidence?.scopeHealth)) {
    unhealthyScopes.push(...V3_SLO_SCOPES);
  } else {
    for (const [index, item] of evidence.scopeHealth.entries()) {
      const health = asRecord(item);
      if (!health) {
        errors.push(`scopeHealth[${index}] must be an object`);
        continue;
      }
      const scope = nonEmptyString(health.scope);
      const status = nonEmptyString(health.status);
      if (!scope || !SLO_SCOPE_SET.has(scope)) {
        errors.push(`scopeHealth[${index}] has an unknown scope`);
        continue;
      }
      const typedScope = scope as V3SloScope;
      if (healthByScope.has(typedScope)) {
        errors.push(`duplicate scopeHealth entry for ${typedScope}`);
        continue;
      }
      if (!status || !HEALTH_STATUSES.has(status)) {
        errors.push(`scopeHealth[${index}] has an unsupported status`);
        continue;
      }
      if (!nonEmptyString(health.evidenceRef)) errors.push(`scopeHealth[${index}].evidenceRef is required`);
      if (!validTimestamp(health.evaluatedAt)) errors.push(`scopeHealth[${index}].evaluatedAt must be an ISO timestamp`);
      healthByScope.set(typedScope, status);
    }
    for (const scope of V3_SLO_SCOPES) {
      if (healthByScope.get(scope) !== "healthy") unhealthyScopes.push(scope);
    }
  }

  const correctness = asRecord(evidence?.correctness);
  if (!correctness) {
    blockers.push("zero-tolerance correctness SLO evidence is missing");
  } else {
    for (const key of [
      "duplicateCommittedOperations",
      "silentLostSuccessfulOperations",
      "wrongEditionOfficialMutations",
    ] as const) {
      const value = nonNegativeInteger(correctness[key]);
      if (value === null) errors.push(`correctness.${key} must be a non-negative integer`);
      else if (value > 0) blockers.push(`correctness.${key} is ${value}; zero is required`);
    }
    if (!nonEmptyString(correctness.evidenceRef)) errors.push("correctness.evidenceRef is required");
    if (!validTimestamp(correctness.observedAt)) errors.push("correctness.observedAt must be an ISO timestamp");
  }

  if (!Array.isArray(evidence?.unresolvedIssues)) {
    errors.push("unresolvedIssues must be an array");
  } else {
    for (const [index, issue] of evidence.unresolvedIssues.entries()) {
      const normalized = nonEmptyString(issue);
      if (!normalized) errors.push(`unresolvedIssues[${index}] must be a non-empty string`);
      else blockers.push(normalized);
    }
  }

  let status: V3S10EvidenceStatus;
  if (errors.length > 0) status = "invalid";
  else if (missingMeasurements.length > 0) status = "measurement_incomplete";
  else if (missingReviewedScopes.length > 0 || blockers.some((item) => item.includes("reviewed latency") || item.includes("production-observation") || item.includes("dashboard"))) {
    status = "review_incomplete";
  } else if (missingFunctionalAlerts.length > 0) status = "alert_incomplete";
  else if (unhealthyScopes.length > 0 || blockers.length > 0) status = "blocked";
  else status = "ready_for_qa_review";

  const issuesFound = [
    ...errors,
    ...missingMeasurements.map((item) => `missing measurement: ${item}`),
    ...missingReviewedScopes.map((scope) => `missing reviewed SLO objective: ${scope}`),
    ...missingFunctionalAlerts.map((code) => `missing functional critical alert proof: ${code}`),
    ...unhealthyScopes.map((scope) => `S10 scope not healthy: ${scope}`),
    ...blockers,
  ];

  return {
    schemaVersion: 1,
    phase: "S10",
    candidateCommitSha,
    status,
    passed: status === "ready_for_qa_review",
    missingMeasurements,
    missingReviewedScopes,
    missingFunctionalAlerts,
    unhealthyScopes,
    errors,
    issuesFound,
    productionTrafficGenerated: false,
    certificationClaim: false,
    qaReviewRequired: true,
  };
}
