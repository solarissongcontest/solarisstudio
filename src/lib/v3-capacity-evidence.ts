import {
  V3_CAPACITY_BUDGET_BANDS,
  V3_CAPACITY_DIMENSIONS,
  v3CapacityScenario,
  type V3CapacityBudgetBand,
  type V3CapacityDimension,
  type V3CapacityMeasurement,
} from "./v3-capacity-scenarios";

export const V3_CAPACITY_EVIDENCE_KINDS = [
  "local_rehearsal",
  "provider_constraint",
  "provider_runtime_measurement",
  "historical_observation",
  "approved_forecast",
] as const;

export type V3CapacityEvidenceKind = (typeof V3_CAPACITY_EVIDENCE_KINDS)[number];

export type V3CapacityEvidenceRecord = {
  id: string;
  kind: V3CapacityEvidenceKind;
  environment: string;
  observedAt: string;
  recordedAgainstCommitSha: string;
  rationale: string;
  sourceReference: string;
  dimensions: readonly V3CapacityDimension[];
  bands: readonly V3CapacityBudgetBand[];
};

export type V3CapacityBudgetPoint = {
  value: number;
  evidenceIds: readonly string[];
};

export type V3CapacityDimensionBudget = {
  dimension: V3CapacityDimension;
  unit: string;
  bands: Partial<Record<V3CapacityBudgetBand, V3CapacityBudgetPoint>>;
};

export type V3CapacityBudgetPlan = {
  schemaVersion: 1;
  id: string;
  scenarioId: string;
  recordedAt: string;
  commitSha: string;
  rationale: string;
  dimensions: readonly V3CapacityDimensionBudget[];
  evidence: readonly V3CapacityEvidenceRecord[];
};

export type V3CapacityEvidenceEvaluation = {
  schemaVersion: 1;
  scenarioId: string;
  status: "invalid" | "evidence_incomplete" | "exploratory" | "comparison_ready";
  validationErrors: readonly string[];
  gaps: readonly string[];
  releaseEvidenceGaps: readonly string[];
  report: {
    commitSha: string | null;
    loadShapeSource: string | null;
    loadShapeEvidenceBacked: boolean;
    missingMeasurements: readonly V3CapacityMeasurement[];
  };
  budget: {
    complete: boolean;
    providerEvidenceComplete: boolean;
  };
  comparisonReady: boolean;
  certificationClaim: false;
};

type JsonObject = Record<string, unknown>;

const SHA_RE = /^[0-9a-f]{40}$/i;
const dimensionSet = new Set<string>(V3_CAPACITY_DIMENSIONS);
const bandSet = new Set<string>(V3_CAPACITY_BUDGET_BANDS);
const evidenceKindSet = new Set<string>(V3_CAPACITY_EVIDENCE_KINDS);
const providerKinds = new Set<V3CapacityEvidenceKind>([
  "provider_constraint",
  "provider_runtime_measurement",
]);

function asObject(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNonNegativeNumber(value: unknown): number | null {
  const number = asFiniteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

function asPositiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && typeof value === "number" && value > 0 ? value : null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasMeasurement(report: JsonObject, measurement: V3CapacityMeasurement) {
  const latency = asObject(report.latencyMs);
  const outcomes = asObject(report.outcomes);
  const egress = asObject(report.egress);
  const memory = asObject(report.clientMemory);
  const database = asObject(report.databaseActivity);

  switch (measurement) {
    case "throughput":
      return asNonNegativeNumber(report.requestThroughputPerSecond) !== null;
    case "p95-latency":
      return asNonNegativeNumber(latency?.p95) !== null;
    case "p99-latency":
      return asNonNegativeNumber(latency?.p99) !== null;
    case "error-rate":
      return asNonNegativeNumber(outcomes?.errorRate) !== null;
    case "database-activity":
      return database !== null;
    case "lock-contention":
      return asObject(database?.lockContention) !== null;
    case "connection-pressure":
      return asObject(database?.connectionPressure) !== null;
    case "observed-response-bytes":
      return asNonNegativeNumber(egress?.observedResponseBytes) !== null;
    case "client-memory":
      return asObject(memory?.peakObserved) !== null;
    case "queue-depth":
      return asNonNegativeNumber(database?.peakObservedQueueDepth) !== null;
    case "retry-pressure":
      return asObject(database?.retryPressure) !== null;
  }
}

function validateHarnessReport(report: JsonObject, scenarioId: string) {
  const errors: string[] = [];
  const schemaVersion = report.schemaVersion;
  if (schemaVersion !== 3) errors.push("capacity report schemaVersion must be 3");
  if (report.scenarioId !== scenarioId) errors.push("capacity report scenarioId does not match budget plan");

  const identity = asObject(report.evidenceIdentity);
  const commitSha = isNonEmptyString(identity?.commitSha) ? identity.commitSha : null;
  if (!commitSha || !SHA_RE.test(commitSha)) {
    errors.push("capacity report evidenceIdentity.commitSha must be an exact 40-character SHA");
  }
  const loadShapeSource = isNonEmptyString(identity?.loadShapeSource)
    ? identity.loadShapeSource
    : null;
  if (!loadShapeSource) errors.push("capacity report loadShapeSource is required");
  if (!isNonEmptyString(identity?.loadShapeRationale)) {
    errors.push("capacity report loadShapeRationale is required");
  }

  const requested = asObject(report.requestedLoad);
  const requests = asPositiveInteger(requested?.requests);
  const concurrency = asPositiveInteger(requested?.concurrency);
  if (requests === null) errors.push("capacity report requestedLoad.requests must be a positive integer");
  if (concurrency === null) errors.push("capacity report requestedLoad.concurrency must be a positive integer");
  if (requests !== null && concurrency !== null && concurrency > requests) {
    errors.push("capacity report concurrency cannot exceed requests");
  }

  const durationMs = asNonNegativeNumber(report.durationMs);
  if (durationMs === null || durationMs === 0) errors.push("capacity report durationMs must be positive");

  const outcomes = asObject(report.outcomes);
  const successes = asNonNegativeNumber(outcomes?.successes);
  const httpErrors = asNonNegativeNumber(outcomes?.httpErrors);
  const transportErrors = asNonNegativeNumber(outcomes?.transportErrors);
  const errorRate = asNonNegativeNumber(outcomes?.errorRate);
  if (requests !== null && successes !== null && httpErrors !== null && transportErrors !== null) {
    const total = successes + httpErrors + transportErrors;
    if (total !== requests) errors.push("capacity report outcome counts must equal requested requests");
    if (errorRate !== null) {
      const expected = (httpErrors + transportErrors) / requests;
      if (Math.abs(errorRate - expected) > 1e-9) {
        errors.push("capacity report errorRate does not match outcome counts");
      }
    }
  }

  const latency = asObject(report.latencyMs);
  const p95 = asNonNegativeNumber(latency?.p95);
  const p99 = asNonNegativeNumber(latency?.p99);
  if (p95 !== null && p99 !== null && p99 < p95) {
    errors.push("capacity report p99 latency cannot be lower than p95 latency");
  }

  if (report.thresholds !== null) {
    errors.push("capacity report thresholds must remain null; targets belong to evidence-backed policy");
  }

  return { errors, commitSha, loadShapeSource };
}

function validatePlan(plan: V3CapacityBudgetPlan) {
  const errors: string[] = [];
  const gaps: string[] = [];
  const releaseEvidenceGaps: string[] = [];
  const scenario = v3CapacityScenario(plan.scenarioId);

  if (plan.schemaVersion !== 1) errors.push("capacity budget plan schemaVersion must be 1");
  if (!isNonEmptyString(plan.id)) errors.push("capacity budget plan id is required");
  if (!scenario) errors.push("capacity budget plan scenarioId is not canonical");
  if (!isNonEmptyString(plan.rationale)) errors.push("capacity budget plan rationale is required");
  if (!SHA_RE.test(plan.commitSha)) errors.push("capacity budget plan commitSha must be an exact 40-character SHA");
  if (!Number.isFinite(Date.parse(plan.recordedAt))) {
    errors.push("capacity budget plan recordedAt must be an ISO-compatible timestamp");
  }

  const evidenceById = new Map<string, V3CapacityEvidenceRecord>();
  for (const evidence of plan.evidence) {
    if (!isNonEmptyString(evidence.id)) {
      errors.push("capacity evidence id is required");
      continue;
    }
    if (evidenceById.has(evidence.id)) errors.push(`duplicate capacity evidence id ${evidence.id}`);
    evidenceById.set(evidence.id, evidence);
    if (!evidenceKindSet.has(evidence.kind)) errors.push(`${evidence.id} has unsupported evidence kind`);
    if (!isNonEmptyString(evidence.environment)) errors.push(`${evidence.id} environment is required`);
    if (!Number.isFinite(Date.parse(evidence.observedAt))) errors.push(`${evidence.id} observedAt is invalid`);
    if (!SHA_RE.test(evidence.recordedAgainstCommitSha)) {
      errors.push(`${evidence.id} recordedAgainstCommitSha must be an exact 40-character SHA`);
    }
    if (!isNonEmptyString(evidence.rationale)) errors.push(`${evidence.id} rationale is required`);
    if (!isNonEmptyString(evidence.sourceReference)) errors.push(`${evidence.id} sourceReference is required`);
    if (evidence.dimensions.length === 0) errors.push(`${evidence.id} must cover at least one capacity dimension`);
    for (const dimension of evidence.dimensions) {
      if (!dimensionSet.has(dimension)) errors.push(`${evidence.id} has unknown capacity dimension ${dimension}`);
    }
    if (evidence.bands.length === 0) errors.push(`${evidence.id} must cover at least one capacity budget band`);
    for (const band of evidence.bands) {
      if (!bandSet.has(band)) errors.push(`${evidence.id} has unknown capacity budget band ${band}`);
    }
  }

  const budgetsByDimension = new Map<V3CapacityDimension, V3CapacityDimensionBudget>();
  for (const budget of plan.dimensions) {
    if (!dimensionSet.has(budget.dimension)) {
      errors.push(`budget has unknown capacity dimension ${budget.dimension}`);
      continue;
    }
    if (budgetsByDimension.has(budget.dimension)) {
      errors.push(`duplicate capacity budget dimension ${budget.dimension}`);
      continue;
    }
    budgetsByDimension.set(budget.dimension, budget);
    if (!isNonEmptyString(budget.unit)) errors.push(`${budget.dimension} budget unit is required`);

    let previous: number | null = null;
    for (const band of V3_CAPACITY_BUDGET_BANDS) {
      const point = budget.bands[band];
      if (!point) {
        gaps.push(`${budget.dimension} is missing ${band} budget`);
        continue;
      }
      if (!Number.isFinite(point.value) || point.value < 0) {
        errors.push(`${budget.dimension} ${band} budget value must be finite and non-negative`);
      }
      if (previous !== null && Number.isFinite(point.value) && point.value < previous) {
        errors.push(`${budget.dimension} budget bands must be non-decreasing from normal to hard-safety-limit`);
      }
      if (Number.isFinite(point.value)) previous = point.value;
      if (!Array.isArray(point.evidenceIds) || point.evidenceIds.length === 0) {
        gaps.push(`${budget.dimension} ${band} budget has no evidence reference`);
        continue;
      }
      for (const evidenceId of point.evidenceIds) {
        const evidence = evidenceById.get(evidenceId);
        if (!evidence) {
          errors.push(`${budget.dimension} ${band} references unknown evidence ${evidenceId}`);
          continue;
        }
        if (!evidence.dimensions.includes(budget.dimension) || !evidence.bands.includes(band)) {
          errors.push(`${evidenceId} does not cover ${budget.dimension} ${band}`);
        }
      }
    }
  }

  if (scenario) {
    for (const dimension of scenario.capacityDimensions) {
      if (!budgetsByDimension.has(dimension)) gaps.push(`scenario budget is missing ${dimension}`);
      const providerCovered = plan.evidence.some((evidence) =>
        providerKinds.has(evidence.kind)
        && evidence.dimensions.includes(dimension)
      );
      if (!providerCovered) {
        releaseEvidenceGaps.push(`${dimension} lacks provider constraint/runtime evidence`);
      }
    }
    for (const dimension of budgetsByDimension.keys()) {
      if (!scenario.capacityDimensions.includes(dimension)) {
        errors.push(`budget dimension ${dimension} is outside scenario ${scenario.id}`);
      }
    }
  }

  return {
    errors,
    gaps: [...new Set(gaps)],
    releaseEvidenceGaps: [...new Set(releaseEvidenceGaps)],
    scenario,
  };
}

export function evaluateV3CapacityEvidence(
  plan: V3CapacityBudgetPlan,
  rawReport: unknown,
): V3CapacityEvidenceEvaluation {
  const planValidation = validatePlan(plan);
  const report = asObject(rawReport);
  const validationErrors = [...planValidation.errors];
  const gaps = [...planValidation.gaps];
  const releaseEvidenceGaps = [...planValidation.releaseEvidenceGaps];

  if (!report) {
    validationErrors.push("capacity report must be a JSON object");
    return {
      schemaVersion: 1,
      scenarioId: plan.scenarioId,
      status: "invalid",
      validationErrors,
      gaps,
      releaseEvidenceGaps,
      report: {
        commitSha: null,
        loadShapeSource: null,
        loadShapeEvidenceBacked: false,
        missingMeasurements: [],
      },
      budget: {
        complete: gaps.length === 0,
        providerEvidenceComplete: releaseEvidenceGaps.length === 0,
      },
      comparisonReady: false,
      certificationClaim: false,
    };
  }

  const reportValidation = validateHarnessReport(report, plan.scenarioId);
  validationErrors.push(...reportValidation.errors);
  const missingMeasurements: V3CapacityMeasurement[] = [];
  if (planValidation.scenario) {
    for (const measurement of planValidation.scenario.requiredMeasurements) {
      if (!hasMeasurement(report, measurement)) missingMeasurements.push(measurement);
    }
  }
  for (const measurement of missingMeasurements) {
    gaps.push(`capacity report is missing required measurement ${measurement}`);
  }

  const loadShapeEvidenceBacked = reportValidation.loadShapeSource !== null
    && reportValidation.loadShapeSource !== "exploratory";
  if (!loadShapeEvidenceBacked) {
    releaseEvidenceGaps.push("load shape is exploratory rather than evidence-backed");
  }

  const dedupedGaps = [...new Set(gaps)];
  const dedupedReleaseGaps = [...new Set(releaseEvidenceGaps)];
  const budgetComplete = planValidation.gaps.length === 0;
  const providerEvidenceComplete = planValidation.releaseEvidenceGaps.length === 0;
  const comparisonReady = validationErrors.length === 0
    && dedupedGaps.length === 0
    && loadShapeEvidenceBacked;

  let status: V3CapacityEvidenceEvaluation["status"];
  if (validationErrors.length > 0) status = "invalid";
  else if (dedupedGaps.length > 0) status = "evidence_incomplete";
  else if (!loadShapeEvidenceBacked) status = "exploratory";
  else status = "comparison_ready";

  return {
    schemaVersion: 1,
    scenarioId: plan.scenarioId,
    status,
    validationErrors,
    gaps: dedupedGaps,
    releaseEvidenceGaps: dedupedReleaseGaps,
    report: {
      commitSha: reportValidation.commitSha,
      loadShapeSource: reportValidation.loadShapeSource,
      loadShapeEvidenceBacked,
      missingMeasurements,
    },
    budget: {
      complete: budgetComplete,
      providerEvidenceComplete,
    },
    comparisonReady,
    certificationClaim: false,
  };
}
