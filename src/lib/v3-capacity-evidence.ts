import {
  V3_CAPACITY_BUDGET_BANDS,
  V3_CAPACITY_DIMENSIONS,
  type V3CapacityBudgetBand,
  type V3CapacityDimension,
  type V3CapacityMeasurement,
  v3CapacityScenario,
} from "./v3-capacity-scenarios";

export const V3_CAPACITY_EXTERNAL_EVIDENCE_SOURCES = [
  "provider-constraint",
  "production-telemetry",
  "historical-peak",
  "approved-forecast",
  "runtime-observation",
] as const;

export type V3CapacityExternalEvidenceSource =
  (typeof V3_CAPACITY_EXTERNAL_EVIDENCE_SOURCES)[number];

export type V3CapacityEvidenceStatus =
  | "invalid"
  | "measurement_incomplete"
  | "evidence_incomplete"
  | "ready_for_qa_review";

export type V3CapacityDimensionEvidence = {
  dimension: V3CapacityDimension;
  sourceType: V3CapacityExternalEvidenceSource;
  observedAt: string;
  reference: string;
  notes: string;
};

export type V3CapacityBudgetEvidence = {
  dimension: V3CapacityDimension;
  band: V3CapacityBudgetBand;
  limit: number;
  unit: string;
  evidenceRef: string;
  rationale: string;
};

export type V3CapacityEvidenceContext = {
  expectedCommitSha: string;
  dimensionEvidence: readonly V3CapacityDimensionEvidence[];
  budgets: readonly V3CapacityBudgetEvidence[];
};

export type V3CapacityEvidenceAssessment = {
  schemaVersion: 1;
  status: V3CapacityEvidenceStatus;
  scenarioId: string | null;
  expectedCommitSha: string | null;
  reportCommitSha: string | null;
  missingMeasurements: readonly V3CapacityMeasurement[];
  missingExternalEvidenceDimensions: readonly V3CapacityDimension[];
  missingBudgetKeys: readonly string[];
  errors: readonly string[];
  certificationClaim: false;
  qaReviewRequired: true;
};

type UnknownRecord = Record<string, unknown>;

type ParsedBudget = {
  dimension: V3CapacityDimension;
  band: V3CapacityBudgetBand;
  limit: number;
  unit: string;
};

const LOAD_SHAPE_SOURCES = new Set([
  "production-telemetry",
  "contest-participation-or-audience",
  "provider-constraint",
  "historical-peak",
  "approved-forecast",
  "explicit-rehearsal-plan",
  "exploratory",
]);

const externalEvidenceSources = new Set<string>(V3_CAPACITY_EXTERNAL_EVIDENCE_SOURCES);
const capacityDimensions = new Set<string>(V3_CAPACITY_DIMENSIONS);
const budgetBands = new Set<string>(V3_CAPACITY_BUDGET_BANDS);

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function exactSha(value: unknown): string | null {
  const normalized = nonEmptyString(value);
  return normalized && /^[0-9a-f]{40}$/i.test(normalized) ? normalized.toLowerCase() : null;
}

function validIsoTimestamp(value: unknown): boolean {
  const normalized = nonEmptyString(value);
  if (!normalized) return false;
  return Number.isFinite(Date.parse(normalized));
}

function readRecord(parent: UnknownRecord | null, key: string): UnknownRecord | null {
  return parent ? asRecord(parent[key]) : null;
}

function measurementPresent(report: UnknownRecord, measurement: V3CapacityMeasurement): boolean {
  const latency = readRecord(report, "latencyMs");
  const outcomes = readRecord(report, "outcomes");
  const egress = readRecord(report, "egress");
  const clientMemory = readRecord(report, "clientMemory");
  const peakMemory = readRecord(clientMemory, "peakObserved");
  const database = readRecord(report, "databaseActivity");

  switch (measurement) {
    case "throughput": {
      const value = finiteNumber(report.requestThroughputPerSecond);
      return value !== null && value > 0;
    }
    case "p95-latency": {
      const value = finiteNumber(latency?.p95);
      return value !== null && value >= 0;
    }
    case "p99-latency": {
      const value = finiteNumber(latency?.p99);
      return value !== null && value >= 0;
    }
    case "error-rate": {
      const value = finiteNumber(outcomes?.errorRate);
      return value !== null && value >= 0 && value <= 1;
    }
    case "database-activity":
      return database !== null;
    case "lock-contention":
      return readRecord(database, "lockContention") !== null;
    case "connection-pressure":
      return readRecord(database, "connectionPressure") !== null;
    case "observed-response-bytes": {
      const value = finiteNumber(egress?.observedResponseBytes);
      return value !== null && value >= 0;
    }
    case "client-memory": {
      const rss = finiteNumber(peakMemory?.rssBytes);
      return rss !== null && rss > 0;
    }
    case "queue-depth": {
      const value = finiteNumber(database?.peakObservedQueueDepth);
      return value !== null && value >= 0;
    }
    case "retry-pressure": {
      const retry = readRecord(database, "retryPressure");
      const attempts = finiteNumber(retry?.totalAttemptsDelta);
      return retry !== null && attempts !== null;
    }
  }
}

function validateLoopbackTarget(value: unknown) {
  const raw = nonEmptyString(value);
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function parseDimensionEvidence(
  raw: unknown,
  scenarioDimensions: readonly V3CapacityDimension[],
  errors: string[],
) {
  const valid = new Set<V3CapacityDimension>();
  if (!Array.isArray(raw)) {
    errors.push("dimensionEvidence must be an array");
    return valid;
  }

  const scenarioSet = new Set<string>(scenarioDimensions);
  for (const [index, item] of raw.entries()) {
    const record = asRecord(item);
    if (!record) {
      errors.push(`dimensionEvidence[${index}] must be an object`);
      continue;
    }
    const dimension = nonEmptyString(record.dimension);
    const sourceType = nonEmptyString(record.sourceType);
    const reference = nonEmptyString(record.reference);
    const notes = nonEmptyString(record.notes);
    let entryValid = true;

    if (!dimension || !capacityDimensions.has(dimension)) {
      errors.push(`dimensionEvidence[${index}] has an unknown dimension`);
      entryValid = false;
    } else if (!scenarioSet.has(dimension)) {
      errors.push(`dimensionEvidence[${index}] covers ${dimension} outside this scenario`);
      entryValid = false;
    }
    if (!sourceType || !externalEvidenceSources.has(sourceType)) {
      errors.push(`dimensionEvidence[${index}] has an unsupported sourceType`);
      entryValid = false;
    }
    if (!validIsoTimestamp(record.observedAt)) {
      errors.push(`dimensionEvidence[${index}] observedAt must be an ISO timestamp`);
      entryValid = false;
    }
    if (!reference) {
      errors.push(`dimensionEvidence[${index}] reference is required`);
      entryValid = false;
    }
    if (!notes) {
      errors.push(`dimensionEvidence[${index}] notes are required`);
      entryValid = false;
    }

    if (entryValid && dimension) valid.add(dimension as V3CapacityDimension);
  }
  return valid;
}

function parseBudgets(
  raw: unknown,
  scenarioDimensions: readonly V3CapacityDimension[],
  errors: string[],
) {
  const parsed = new Map<string, ParsedBudget>();
  if (!Array.isArray(raw)) {
    errors.push("budgets must be an array");
    return parsed;
  }

  const scenarioSet = new Set<string>(scenarioDimensions);
  for (const [index, item] of raw.entries()) {
    const record = asRecord(item);
    if (!record) {
      errors.push(`budgets[${index}] must be an object`);
      continue;
    }
    const dimension = nonEmptyString(record.dimension);
    const band = nonEmptyString(record.band);
    const limit = finiteNumber(record.limit);
    const unit = nonEmptyString(record.unit);
    const evidenceRef = nonEmptyString(record.evidenceRef);
    const rationale = nonEmptyString(record.rationale);
    let entryValid = true;

    if (!dimension || !capacityDimensions.has(dimension) || !scenarioSet.has(dimension)) {
      errors.push(`budgets[${index}] has an invalid scenario dimension`);
      entryValid = false;
    }
    if (!band || !budgetBands.has(band)) {
      errors.push(`budgets[${index}] has an invalid budget band`);
      entryValid = false;
    }
    if (limit === null || limit <= 0) {
      errors.push(`budgets[${index}] limit must be a positive finite number`);
      entryValid = false;
    }
    if (!unit) {
      errors.push(`budgets[${index}] unit is required`);
      entryValid = false;
    }
    if (!evidenceRef) {
      errors.push(`budgets[${index}] evidenceRef is required`);
      entryValid = false;
    }
    if (!rationale) {
      errors.push(`budgets[${index}] rationale is required`);
      entryValid = false;
    }

    if (!entryValid || !dimension || !band || limit === null || !unit) continue;
    const key = `${dimension}:${band}`;
    if (parsed.has(key)) {
      errors.push(`duplicate capacity budget ${key}`);
      continue;
    }
    parsed.set(key, {
      dimension: dimension as V3CapacityDimension,
      band: band as V3CapacityBudgetBand,
      limit,
      unit,
    });
  }
  return parsed;
}

export function assessV3CapacityEvidence(
  reportValue: unknown,
  contextValue: unknown,
): V3CapacityEvidenceAssessment {
  const errors: string[] = [];
  const report = asRecord(reportValue);
  const context = asRecord(contextValue);

  if (!report) errors.push("capacity report must be an object");
  if (!context) errors.push("capacity evidence context must be an object");

  const scenarioId = nonEmptyString(report?.scenarioId);
  const scenario = scenarioId ? v3CapacityScenario(scenarioId) : null;
  if (!scenarioId) errors.push("capacity report scenarioId is required");
  if (scenarioId && !scenario) errors.push(`unknown capacity scenario ${scenarioId}`);

  const expectedCommitSha = exactSha(context?.expectedCommitSha);
  const reportIdentity = readRecord(report, "evidenceIdentity");
  const reportCommitSha = exactSha(reportIdentity?.commitSha);
  if (!expectedCommitSha) errors.push("expectedCommitSha must be an exact 40-character SHA");
  if (!reportCommitSha) errors.push("capacity report commitSha must be an exact 40-character SHA");
  if (expectedCommitSha && reportCommitSha && expectedCommitSha !== reportCommitSha) {
    errors.push("capacity report commitSha does not match expectedCommitSha");
  }

  if (report && report.schemaVersion !== 3) {
    errors.push("capacity report schemaVersion must be 3");
  }
  if (report && report.thresholds !== null) {
    errors.push("capacity report must not embed pass/fail thresholds");
  }
  if (report && !validateLoopbackTarget(report.target)) {
    errors.push("capacity report target must be loopback/local");
  }

  const loadSource = nonEmptyString(reportIdentity?.loadShapeSource);
  if (!loadSource || !LOAD_SHAPE_SOURCES.has(loadSource)) {
    errors.push("capacity report has an unsupported load-shape source");
  }
  if (!nonEmptyString(reportIdentity?.loadShapeRationale)) {
    errors.push("capacity report load-shape rationale is required");
  }

  const requestedLoad = readRecord(report, "requestedLoad");
  const requestCount = positiveInteger(requestedLoad?.requests);
  const concurrency = positiveInteger(requestedLoad?.concurrency);
  if (!requestCount) errors.push("capacity report requests must be a positive integer");
  if (!concurrency) errors.push("capacity report concurrency must be a positive integer");
  if (requestCount && concurrency && concurrency > requestCount) {
    errors.push("capacity report concurrency cannot exceed requests");
  }

  const duration = finiteNumber(report?.durationMs);
  if (duration === null || duration <= 0) errors.push("capacity report durationMs must be positive");

  const latency = readRecord(report, "latencyMs");
  const p95 = finiteNumber(latency?.p95);
  const p99 = finiteNumber(latency?.p99);
  if (p95 !== null && p99 !== null && p99 < p95) {
    errors.push("capacity report p99 latency cannot be below p95 latency");
  }

  const outcomes = readRecord(report, "outcomes");
  const successes = finiteNumber(outcomes?.successes);
  const httpErrors = finiteNumber(outcomes?.httpErrors);
  const transportErrors = finiteNumber(outcomes?.transportErrors);
  if (
    requestCount &&
    successes !== null &&
    httpErrors !== null &&
    transportErrors !== null &&
    successes + httpErrors + transportErrors !== requestCount
  ) {
    errors.push("capacity report outcome totals do not equal requested requests");
  }

  const missingMeasurements = scenario && report
    ? scenario.requiredMeasurements.filter((measurement) => !measurementPresent(report, measurement))
    : [];

  const scenarioDimensions = scenario?.capacityDimensions ?? [];
  const validDimensionEvidence = parseDimensionEvidence(
    context?.dimensionEvidence,
    scenarioDimensions,
    errors,
  );
  const missingExternalEvidenceDimensions = scenarioDimensions.filter(
    (dimension) => !validDimensionEvidence.has(dimension),
  );

  const parsedBudgets = parseBudgets(context?.budgets, scenarioDimensions, errors);
  const missingBudgetKeys: string[] = [];
  for (const dimension of scenarioDimensions) {
    const dimensionBudgets: ParsedBudget[] = [];
    for (const band of V3_CAPACITY_BUDGET_BANDS) {
      const key = `${dimension}:${band}`;
      const budget = parsedBudgets.get(key);
      if (!budget) missingBudgetKeys.push(key);
      else dimensionBudgets.push(budget);
    }
    if (dimensionBudgets.length !== V3_CAPACITY_BUDGET_BANDS.length) continue;

    const units = new Set(dimensionBudgets.map((budget) => budget.unit));
    if (units.size !== 1) {
      errors.push(`${dimension} capacity budget bands must use one unit`);
      continue;
    }
    const limits = dimensionBudgets.map((budget) => budget.limit);
    for (let index = 1; index < limits.length; index += 1) {
      if (limits[index] < limits[index - 1]) {
        errors.push(`${dimension} capacity budget limits must be nondecreasing by band`);
        break;
      }
    }
  }

  let status: V3CapacityEvidenceStatus;
  if (errors.length > 0) status = "invalid";
  else if (missingMeasurements.length > 0) status = "measurement_incomplete";
  else if (missingExternalEvidenceDimensions.length > 0 || missingBudgetKeys.length > 0) {
    status = "evidence_incomplete";
  } else {
    status = "ready_for_qa_review";
  }

  return {
    schemaVersion: 1,
    status,
    scenarioId: scenario?.id ?? scenarioId ?? null,
    expectedCommitSha,
    reportCommitSha,
    missingMeasurements,
    missingExternalEvidenceDimensions,
    missingBudgetKeys,
    errors,
    certificationClaim: false,
    qaReviewRequired: true,
  };
}
