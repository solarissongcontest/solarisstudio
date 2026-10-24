import { V3_CAPACITY_SCENARIOS } from "./v3-capacity-scenarios";

export const V3_CAPACITY_REHEARSAL_PLAN_LOAD_SOURCES = [
  "production-telemetry",
  "contest-participation-or-audience",
  "provider-constraint",
  "historical-peak",
  "approved-forecast",
  "explicit-rehearsal-plan",
  "exploratory",
] as const;

export type V3CapacityRehearsalPlanLoadSource =
  (typeof V3_CAPACITY_REHEARSAL_PLAN_LOAD_SOURCES)[number];

export type V3CapacityRehearsalPlanStatus =
  | "invalid"
  | "scenario_incomplete"
  | "exploratory_only"
  | "ready_for_execution_review";

export type V3CapacityRehearsalPlanAssessment = {
  schemaVersion: 1;
  status: V3CapacityRehearsalPlanStatus;
  expectedCommitSha: string | null;
  planCommitSha: string | null;
  planId: string | null;
  scenarioCount: number;
  runCount: number;
  missingScenarioIds: readonly string[];
  exploratoryScenarioIds: readonly string[];
  errors: readonly string[];
  productionTrafficAllowed: false;
  certificationClaim: false;
  qaReviewRequired: true;
};

type UnknownRecord = Record<string, unknown>;

const LOAD_SOURCES = new Set<string>(V3_CAPACITY_REHEARSAL_PLAN_LOAD_SOURCES);
const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const TOP_LEVEL_KEYS = new Set([
  "schemaVersion",
  "candidateSha",
  "planId",
  "preparedAt",
  "environment",
  "approval",
  "scenarios",
  "productionTrafficAllowed",
  "certificationClaim",
  "qaReviewRequired",
]);
const APPROVAL_KEYS = new Set(["status", "reference", "approvedAt"]);
const SCENARIO_KEYS = new Set(["scenarioId", "runs"]);
const RUN_KEYS = new Set([
  "runId",
  "targetPath",
  "method",
  "requests",
  "concurrency",
  "databaseSampleIntervalMs",
  "loadShapeSource",
  "evidenceRef",
  "rationale",
  "fixtureProfile",
]);

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function exactSha(value: unknown): string | null {
  const normalized = boundedText(value, 40);
  return normalized && /^[0-9a-f]{40}$/i.test(normalized)
    ? normalized.toLowerCase()
    : null;
}

function positiveSafeInteger(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function validIsoTimestamp(value: unknown): string | null {
  const normalized = boundedText(value, 64);
  return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : null;
}

function validPlanId(value: unknown): string | null {
  const normalized = boundedText(value, 128);
  return normalized && /^[a-z0-9][a-z0-9._-]{2,127}$/.test(normalized)
    ? normalized
    : null;
}

function validRunId(value: unknown): string | null {
  const normalized = boundedText(value, 128);
  return normalized && /^[a-z0-9][a-z0-9._-]{2,127}$/.test(normalized)
    ? normalized
    : null;
}

function validRelativeTargetPath(value: unknown): string | null {
  const normalized = boundedText(value, 512);
  if (!normalized) return null;
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return null;
  if (normalized.includes("://") || normalized.includes("\\")) return null;
  if (normalized.includes("?") || normalized.includes("#")) return null;
  if (/\s/.test(normalized)) return null;

  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  return normalized;
}

function assertOnlyKeys(
  record: UnknownRecord,
  allowed: ReadonlySet<string>,
  label: string,
  errors: string[],
) {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) errors.push(`${label} contains unsupported field ${key}`);
  }
}

export function assessV3CapacityRehearsalPlan(
  planValue: unknown,
  expectedCommitShaValue: unknown,
): V3CapacityRehearsalPlanAssessment {
  const errors: string[] = [];
  const plan = asRecord(planValue);
  const expectedCommitSha = exactSha(expectedCommitShaValue);
  const canonicalScenarioIds = V3_CAPACITY_SCENARIOS.map((scenario) => scenario.id);
  const canonicalScenarioSet = new Set(canonicalScenarioIds);
  const seenScenarioIds = new Set<string>();
  const seenRunIds = new Set<string>();
  const exploratoryScenarioIds = new Set<string>();
  let runCount = 0;

  if (!expectedCommitSha) {
    errors.push("expected commit SHA must be an exact 40-character SHA");
  }
  if (!plan) {
    errors.push("capacity rehearsal plan must be an object");
  }

  if (plan) assertOnlyKeys(plan, TOP_LEVEL_KEYS, "plan", errors);

  if (plan && plan.schemaVersion !== 1) {
    errors.push("capacity rehearsal plan schemaVersion must be 1");
  }

  const planCommitSha = exactSha(plan?.candidateSha);
  if (!planCommitSha) {
    errors.push("capacity rehearsal plan candidateSha must be an exact 40-character SHA");
  } else if (expectedCommitSha && planCommitSha !== expectedCommitSha) {
    errors.push("capacity rehearsal plan candidateSha does not match expected commit SHA");
  }

  const planId = validPlanId(plan?.planId);
  if (!planId) {
    errors.push("capacity rehearsal plan planId must be a bounded lowercase stable identifier");
  }

  const preparedAt = validIsoTimestamp(plan?.preparedAt);
  if (!preparedAt) errors.push("capacity rehearsal plan preparedAt must be an ISO timestamp");

  if (plan?.environment !== "local-isolated") {
    errors.push("capacity rehearsal plan environment must be local-isolated");
  }
  if (plan?.productionTrafficAllowed !== false) {
    errors.push("capacity rehearsal plan must set productionTrafficAllowed=false");
  }
  if (plan?.certificationClaim !== false) {
    errors.push("capacity rehearsal plan must set certificationClaim=false");
  }
  if (plan?.qaReviewRequired !== true) {
    errors.push("capacity rehearsal plan must set qaReviewRequired=true");
  }

  const approval = asRecord(plan?.approval);
  if (!approval) {
    errors.push("capacity rehearsal plan approval must be an object");
  } else {
    assertOnlyKeys(approval, APPROVAL_KEYS, "approval", errors);
    if (approval.status !== "approved_for_isolated_rehearsal") {
      errors.push("capacity rehearsal plan approval status must be approved_for_isolated_rehearsal");
    }
    if (!boundedText(approval.reference, 512)) {
      errors.push("capacity rehearsal plan approval reference is required");
    }
    const approvedAt = validIsoTimestamp(approval.approvedAt);
    if (!approvedAt) {
      errors.push("capacity rehearsal plan approval approvedAt must be an ISO timestamp");
    } else if (preparedAt && Date.parse(approvedAt) < Date.parse(preparedAt)) {
      errors.push("capacity rehearsal plan approval cannot predate preparedAt");
    }
  }

  if (!Array.isArray(plan?.scenarios)) {
    errors.push("capacity rehearsal plan scenarios must be an array");
  } else {
    for (const [scenarioIndex, scenarioValue] of plan.scenarios.entries()) {
      const scenario = asRecord(scenarioValue);
      const label = `scenarios[${scenarioIndex}]`;
      if (!scenario) {
        errors.push(`${label} must be an object`);
        continue;
      }
      assertOnlyKeys(scenario, SCENARIO_KEYS, label, errors);

      const scenarioId = boundedText(scenario.scenarioId, 128);
      if (!scenarioId || !canonicalScenarioSet.has(scenarioId)) {
        errors.push(`${label} has an unknown scenarioId`);
      } else if (seenScenarioIds.has(scenarioId)) {
        errors.push(`duplicate capacity rehearsal scenario ${scenarioId}`);
      } else {
        seenScenarioIds.add(scenarioId);
      }

      if (!Array.isArray(scenario.runs) || scenario.runs.length === 0) {
        errors.push(`${label}.runs must contain at least one concrete local run`);
        continue;
      }

      for (const [runIndex, runValue] of scenario.runs.entries()) {
        const run = asRecord(runValue);
        const runLabel = `${label}.runs[${runIndex}]`;
        if (!run) {
          errors.push(`${runLabel} must be an object`);
          continue;
        }
        assertOnlyKeys(run, RUN_KEYS, runLabel, errors);
        runCount += 1;

        const runId = validRunId(run.runId);
        if (!runId) {
          errors.push(`${runLabel}.runId must be a bounded lowercase stable identifier`);
        } else if (seenRunIds.has(runId)) {
          errors.push(`duplicate capacity rehearsal run ${runId}`);
        } else {
          seenRunIds.add(runId);
        }

        if (!validRelativeTargetPath(run.targetPath)) {
          errors.push(
            `${runLabel}.targetPath must be a relative local route path without query, fragment, traversal or authority`,
          );
        }

        const method = boundedText(run.method, 16)?.toUpperCase() ?? null;
        if (!method || !METHODS.has(method) || method !== run.method) {
          errors.push(`${runLabel}.method must be one of GET, POST, PUT, PATCH or DELETE`);
        }

        const requests = positiveSafeInteger(run.requests);
        const concurrency = positiveSafeInteger(run.concurrency);
        if (!requests) errors.push(`${runLabel}.requests must be a positive safe integer`);
        if (!concurrency) errors.push(`${runLabel}.concurrency must be a positive safe integer`);
        if (requests && concurrency && concurrency > requests) {
          errors.push(`${runLabel}.concurrency cannot exceed requests`);
        }
        if (!positiveSafeInteger(run.databaseSampleIntervalMs)) {
          errors.push(`${runLabel}.databaseSampleIntervalMs must be a positive safe integer`);
        }

        const source = boundedText(run.loadShapeSource, 64);
        if (!source || !LOAD_SOURCES.has(source)) {
          errors.push(`${runLabel}.loadShapeSource is unsupported`);
        } else if (source === "exploratory" && scenarioId) {
          exploratoryScenarioIds.add(scenarioId);
        }

        const evidenceRef = boundedText(run.evidenceRef, 512);
        if (!evidenceRef) {
          errors.push(`${runLabel}.evidenceRef is required`);
        } else if (source === "explicit-rehearsal-plan" && planId && evidenceRef === planId) {
          errors.push(`${runLabel}.evidenceRef cannot circularly reference the plan itself`);
        }
        if (!boundedText(run.rationale, 1000)) {
          errors.push(`${runLabel}.rationale is required`);
        }
        if (!boundedText(run.fixtureProfile, 128)) {
          errors.push(`${runLabel}.fixtureProfile is required`);
        }
      }
    }
  }

  const missingScenarioIds = canonicalScenarioIds.filter(
    (scenarioId) => !seenScenarioIds.has(scenarioId),
  );
  const exploratoryIds = canonicalScenarioIds.filter((scenarioId) =>
    exploratoryScenarioIds.has(scenarioId),
  );

  let status: V3CapacityRehearsalPlanStatus;
  if (errors.length > 0) status = "invalid";
  else if (missingScenarioIds.length > 0) status = "scenario_incomplete";
  else if (exploratoryIds.length > 0) status = "exploratory_only";
  else status = "ready_for_execution_review";

  return {
    schemaVersion: 1,
    status,
    expectedCommitSha,
    planCommitSha,
    planId,
    scenarioCount: seenScenarioIds.size,
    runCount,
    missingScenarioIds,
    exploratoryScenarioIds: exploratoryIds,
    errors,
    productionTrafficAllowed: false,
    certificationClaim: false,
    qaReviewRequired: true,
  };
}
