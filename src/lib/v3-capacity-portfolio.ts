import {
  V3_CAPACITY_SCENARIOS,
  type V3CapacityDimension,
  type V3CapacityMeasurement,
} from "./v3-capacity-scenarios";
import type {
  V3CapacityEvidenceAssessment,
  V3CapacityEvidenceStatus,
} from "./v3-capacity-evidence";

export type V3CapacityPortfolioStatus =
  | "invalid"
  | "incomplete"
  | "ready_for_qa_review";

export type V3CapacityPortfolioAssessment = {
  schemaVersion: 1;
  status: V3CapacityPortfolioStatus;
  expectedCommitSha: string | null;
  canonicalScenarioCount: number;
  observedScenarioCount: number;
  readyScenarioCount: number;
  missingScenarioIds: readonly string[];
  incompleteScenarioIds: readonly string[];
  invalidScenarioIds: readonly string[];
  missingMeasurements: readonly V3CapacityMeasurement[];
  missingExternalEvidenceDimensions: readonly V3CapacityDimension[];
  missingBudgetKeys: readonly string[];
  errors: readonly string[];
  certificationClaim: false;
  qaReviewRequired: true;
};

type UnknownRecord = Record<string, unknown>;

const EVIDENCE_STATUSES = new Set<V3CapacityEvidenceStatus>([
  "invalid",
  "measurement_incomplete",
  "evidence_incomplete",
  "ready_for_qa_review",
]);
const SCENARIOS_BY_ID = new Map(
  V3_CAPACITY_SCENARIOS.map((scenario) => [scenario.id, scenario] as const),
);

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
  return normalized && /^[0-9a-f]{40}$/i.test(normalized)
    ? normalized.toLowerCase()
    : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  const normalized = value.map((item) => item.trim());
  return normalized.some((item) => item.length === 0) ? null : normalized;
}

function unionSorted<T extends string>(values: readonly (readonly T[])[]): T[] {
  return [...new Set(values.flat())].sort((left, right) => left.localeCompare(right));
}

/**
 * Aggregate the per-scenario S12 evidence assessments into one exact-SHA
 * portfolio. This is intentionally a review-readiness boundary, not a release
 * certification boundary: System can prove the canonical scenario set is
 * complete and internally coherent, while Chat 5 / release certification still
 * owns the final capacity gate.
 *
 * The function consumes only already-assessed capacity evidence. It never
 * invents request counts, concurrency, budget values, provider ceilings or
 * production observations.
 */
export function assessV3CapacityEvidencePortfolio(
  assessmentValues: unknown,
  expectedCommitShaValue: unknown,
): V3CapacityPortfolioAssessment {
  const errors: string[] = [];
  const expectedCommitSha = exactSha(expectedCommitShaValue);
  if (!expectedCommitSha) {
    errors.push("expectedCommitSha must be an exact 40-character SHA");
  }

  const canonicalScenarioIds = V3_CAPACITY_SCENARIOS.map((scenario) => scenario.id);
  const canonicalScenarioSet = new Set(canonicalScenarioIds);
  const observed = new Map<string, V3CapacityEvidenceAssessment>();
  const incompleteScenarioIds = new Set<string>();
  const invalidScenarioIds = new Set<string>();
  const missingMeasurementSets: V3CapacityMeasurement[][] = [];
  const missingDimensionSets: V3CapacityDimension[][] = [];
  const missingBudgetKeySets: string[][] = [];
  let readyScenarioCount = 0;

  if (!Array.isArray(assessmentValues)) {
    errors.push("capacity portfolio assessments must be an array");
  } else {
    assessmentValues.forEach((value, index) => {
      const record = asRecord(value);
      if (!record) {
        errors.push(`assessments[${index}] must be an object`);
        return;
      }

      const scenarioId = nonEmptyString(record.scenarioId);
      const scenario = scenarioId ? SCENARIOS_BY_ID.get(scenarioId) : undefined;
      const status = nonEmptyString(record.status) as V3CapacityEvidenceStatus | null;
      const assessmentExpectedSha = exactSha(record.expectedCommitSha);
      const reportCommitSha = exactSha(record.reportCommitSha);
      const missingMeasurements = stringArray(record.missingMeasurements);
      const missingExternalEvidenceDimensions = stringArray(
        record.missingExternalEvidenceDimensions,
      );
      const missingBudgetKeys = stringArray(record.missingBudgetKeys);
      const assessmentErrors = stringArray(record.errors);
      let entryValid = true;

      if (record.schemaVersion !== 1) {
        errors.push(`assessments[${index}] schemaVersion must be 1`);
        entryValid = false;
      }
      if (!scenarioId || !scenario) {
        errors.push(`assessments[${index}] has an unknown scenarioId`);
        entryValid = false;
      } else if (observed.has(scenarioId)) {
        errors.push(`duplicate capacity scenario assessment ${scenarioId}`);
        invalidScenarioIds.add(scenarioId);
        entryValid = false;
      }
      if (!status || !EVIDENCE_STATUSES.has(status)) {
        errors.push(`assessments[${index}] has an unsupported status`);
        entryValid = false;
      }
      if (!assessmentExpectedSha || !reportCommitSha) {
        errors.push(`assessments[${index}] must carry exact expected/report SHAs`);
        entryValid = false;
      } else if (
        expectedCommitSha &&
        (assessmentExpectedSha !== expectedCommitSha || reportCommitSha !== expectedCommitSha)
      ) {
        errors.push(`assessments[${index}] does not belong to the expected commit SHA`);
        entryValid = false;
      }
      if (record.certificationClaim !== false) {
        errors.push(`assessments[${index}] must not claim certification`);
        entryValid = false;
      }
      if (record.qaReviewRequired !== true) {
        errors.push(`assessments[${index}] must require QA review`);
        entryValid = false;
      }
      if (!missingMeasurements) {
        errors.push(`assessments[${index}] missingMeasurements must be a string array`);
        entryValid = false;
      } else if (
        scenario &&
        missingMeasurements.some((item) => !scenario.requiredMeasurements.includes(item as V3CapacityMeasurement))
      ) {
        errors.push(`assessments[${index}] contains a measurement outside its scenario contract`);
        entryValid = false;
      }
      if (!missingExternalEvidenceDimensions) {
        errors.push(
          `assessments[${index}] missingExternalEvidenceDimensions must be a string array`,
        );
        entryValid = false;
      } else if (
        scenario &&
        missingExternalEvidenceDimensions.some(
          (item) => !scenario.capacityDimensions.includes(item as V3CapacityDimension),
        )
      ) {
        errors.push(`assessments[${index}] contains a capacity dimension outside its scenario contract`);
        entryValid = false;
      }
      if (!missingBudgetKeys) {
        errors.push(`assessments[${index}] missingBudgetKeys must be a string array`);
        entryValid = false;
      } else if (scenario) {
        const allowedBudgetKeys = new Set(
          scenario.capacityDimensions.flatMap((dimension) =>
            scenario.requiredBudgetBands.map((band) => `${dimension}:${band}`),
          ),
        );
        if (missingBudgetKeys.some((key) => !allowedBudgetKeys.has(key))) {
          errors.push(`assessments[${index}] contains a budget key outside its scenario contract`);
          entryValid = false;
        }
      }
      if (!assessmentErrors) {
        errors.push(`assessments[${index}] errors must be a string array`);
        entryValid = false;
      }

      if (
        status === "ready_for_qa_review" &&
        ((missingMeasurements?.length ?? 0) > 0 ||
          (missingExternalEvidenceDimensions?.length ?? 0) > 0 ||
          (missingBudgetKeys?.length ?? 0) > 0 ||
          (assessmentErrors?.length ?? 0) > 0)
      ) {
        errors.push(`assessments[${index}] claims review readiness with unresolved gaps`);
        entryValid = false;
      }

      if (!entryValid || !scenarioId || !status) {
        if (scenarioId && canonicalScenarioSet.has(scenarioId)) {
          invalidScenarioIds.add(scenarioId);
        }
        return;
      }

      const typed = record as unknown as V3CapacityEvidenceAssessment;
      observed.set(scenarioId, typed);
      missingMeasurementSets.push(
        (missingMeasurements ?? []) as V3CapacityMeasurement[],
      );
      missingDimensionSets.push(
        (missingExternalEvidenceDimensions ?? []) as V3CapacityDimension[],
      );
      missingBudgetKeySets.push(missingBudgetKeys ?? []);

      if (status === "ready_for_qa_review") {
        readyScenarioCount += 1;
      } else if (status === "invalid") {
        invalidScenarioIds.add(scenarioId);
      } else {
        incompleteScenarioIds.add(scenarioId);
      }
    });
  }

  const missingScenarioIds = canonicalScenarioIds
    .filter((scenarioId) => !observed.has(scenarioId))
    .sort((left, right) => left.localeCompare(right));

  const sortedIncomplete = [...incompleteScenarioIds].sort((left, right) =>
    left.localeCompare(right),
  );
  const sortedInvalid = [...invalidScenarioIds].sort((left, right) =>
    left.localeCompare(right),
  );

  let status: V3CapacityPortfolioStatus;
  if (errors.length > 0 || sortedInvalid.length > 0) {
    status = "invalid";
  } else if (missingScenarioIds.length > 0 || sortedIncomplete.length > 0) {
    status = "incomplete";
  } else {
    status = "ready_for_qa_review";
  }

  return {
    schemaVersion: 1,
    status,
    expectedCommitSha,
    canonicalScenarioCount: canonicalScenarioIds.length,
    observedScenarioCount: observed.size,
    readyScenarioCount,
    missingScenarioIds,
    incompleteScenarioIds: sortedIncomplete,
    invalidScenarioIds: sortedInvalid,
    missingMeasurements: unionSorted(missingMeasurementSets),
    missingExternalEvidenceDimensions: unionSorted(missingDimensionSets),
    missingBudgetKeys: unionSorted(missingBudgetKeySets),
    errors,
    certificationClaim: false,
    qaReviewRequired: true,
  };
}
