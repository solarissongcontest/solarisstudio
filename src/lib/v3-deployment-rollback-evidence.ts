export type V3DeploymentRollbackEvidenceStatus = "invalid" | "ready_for_qa_review";

type UnknownRecord = Record<string, unknown>;

export type V3DeploymentRollbackEvidenceAssessment = {
  schemaVersion: 1;
  status: V3DeploymentRollbackEvidenceStatus;
  expectedCommitSha: string | null;
  evidenceCommitSha: string | null;
  rehearsalId: string | null;
  workerName: string | null;
  baselineVersionId: string | null;
  defectiveVersionId: string | null;
  rollbackDeploymentId: string | null;
  isolatedProviderRollbackMs: number | null;
  errors: readonly string[];
  certificationClaim: false;
  fullServiceRecoveryClaim: false;
  qaReviewRequired: true;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER_RE = /^solaris-s11-rollback-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const WRANGLER_VERSION = "4.141.0";
const REQUIRED_ARTIFACT_DIGESTS = [
  "fixtureConfig",
  "baselineDeploy",
  "baselineRuntime",
  "defectiveUpload",
  "defectiveDeploy",
  "defectiveRuntime",
  "preRollbackDeployments",
  "rollbackCommandOutput",
  "postRollbackDeployments",
  "rollbackRuntime",
] as const;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function exactSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function exactSha256(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(normalized) ? normalized : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID_RE.test(value) ? value.toLowerCase() : null;
}

function boundedLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= 120 ? normalized : null;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function isoInstant(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value.map((item) => item.trim());
}

function isolatedWorkersDevUrl(value: unknown, workerName: string | null): string | null {
  if (typeof value !== "string" || !workerName) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (!host.endsWith(".workers.dev")) return null;
    if (!host.startsWith(`${workerName}.`) && !host.includes(`-${workerName}.`)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Validate retained S11 Cloudflare deployment-rollback rehearsal evidence.
 *
 * This proves only an isolated provider-level Worker rollback. It cannot claim
 * production RTO/RPO, database rollback, Storage recovery, full-service
 * recovery, or final release certification.
 */
export function assessV3DeploymentRollbackEvidence(
  value: unknown,
  expectedCommitShaValue: unknown,
): V3DeploymentRollbackEvidenceAssessment {
  const errors: string[] = [];
  const expectedCommitSha = exactSha(expectedCommitShaValue);
  if (!expectedCommitSha) {
    errors.push("expectedCommitSha must be an exact 40-character SHA");
  }

  const record = asRecord(value);
  if (!record) {
    return {
      schemaVersion: 1,
      status: "invalid",
      expectedCommitSha,
      evidenceCommitSha: null,
      rehearsalId: null,
      workerName: null,
      baselineVersionId: null,
      defectiveVersionId: null,
      rollbackDeploymentId: null,
      isolatedProviderRollbackMs: null,
      errors: [...errors, "deployment rollback evidence must be an object"],
      certificationClaim: false,
      fullServiceRecoveryClaim: false,
      qaReviewRequired: true,
    };
  }

  const evidenceCommitSha = exactSha(record.commitSha);
  const rehearsalId = uuid(record.rehearsalId);
  const environment = boundedLabel(record.environment);
  const operatorIdentity = boundedLabel(record.operatorIdentity);
  const startedAt = isoInstant(record.startedAt);
  const completedAt = isoInstant(record.completedAt);
  const worker = asRecord(record.worker);
  const versions = asRecord(record.versions);
  const baseline = asRecord(versions?.baseline);
  const defective = asRecord(versions?.defective);
  const achieved = asRecord(record.achieved);
  const validation = asRecord(record.validation);
  const artifactDigests = asRecord(record.artifactDigests);
  const workerName =
    typeof worker?.name === "string" ? worker.name.trim().toLowerCase() : null;
  const baselineVersionId = uuid(baseline?.id);
  const defectiveVersionId = uuid(defective?.id);
  const rolledBackToVersionId = uuid(versions?.rolledBackToVersionId);
  const rollbackDeploymentId = uuid(versions?.rollbackDeploymentId);
  const targetUrl = isolatedWorkersDevUrl(worker?.targetUrl, workerName);
  const isolatedProviderRollbackMs = finiteNonNegative(
    achieved?.isolatedProviderRollbackMs,
  );
  const issuesFound = stringArray(record.issuesFound);
  const followUpActions = stringArray(record.followUpActions);

  if (record.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (record.kind !== "cloudflare_deployment_rollback_rehearsal") {
    errors.push("kind must be cloudflare_deployment_rollback_rehearsal");
  }
  if (record.scope !== "isolated_cloudflare_worker") {
    errors.push("scope must be isolated_cloudflare_worker");
  }
  if (record.status !== "passed") errors.push("status must be passed");
  if (!evidenceCommitSha) {
    errors.push("commitSha must be an exact 40-character SHA");
  } else if (expectedCommitSha && evidenceCommitSha !== expectedCommitSha) {
    errors.push("deployment rollback evidence does not belong to the expected commit SHA");
  }
  if (!environment) errors.push("environment must be a 1..120 character label");
  if (!operatorIdentity) {
    errors.push("operatorIdentity must be a 1..120 character label");
  }
  if (!rehearsalId) errors.push("rehearsalId must be a UUID");
  if (startedAt === null || completedAt === null || completedAt < startedAt) {
    errors.push("startedAt/completedAt must be ordered ISO timestamps");
  }

  if (!workerName || workerName.length > 63 || !WORKER_RE.test(workerName)) {
    errors.push("worker name must be a bounded solaris-s11-rollback-* test Worker");
  }
  if (workerName === "studio") {
    errors.push("production Worker name is forbidden");
  }
  if (worker?.productionWorkerName !== "studio") {
    errors.push("productionWorkerName boundary must remain studio");
  }
  if (!targetUrl) {
    errors.push("targetUrl must be an HTTPS workers.dev URL for the isolated Worker");
  }
  if (worker?.fixtureBindings !== "CF_VERSION_METADATA only") {
    errors.push("fixtureBindings must prove the test Worker has no Solaris resource bindings");
  }
  if (record.wranglerVersion !== WRANGLER_VERSION) {
    errors.push(`wranglerVersion must be pinned to ${WRANGLER_VERSION}`);
  }

  if (!baselineVersionId) errors.push("baseline version id must be a UUID");
  if (!defectiveVersionId) errors.push("defective version id must be a UUID");
  if (baselineVersionId && defectiveVersionId && baselineVersionId === defectiveVersionId) {
    errors.push("baseline and defective Worker versions must be distinct");
  }
  if (!rolledBackToVersionId || rolledBackToVersionId !== baselineVersionId) {
    errors.push("rolledBackToVersionId must equal the known-good baseline version");
  }
  if (!rollbackDeploymentId) {
    errors.push("rollbackDeploymentId must be a UUID");
  }
  if (baseline?.marker !== "known-good") {
    errors.push("baseline marker must be known-good");
  }
  if (defective?.marker !== "defective") {
    errors.push("defective marker must be defective");
  }

  if (isolatedProviderRollbackMs === null) {
    errors.push("isolatedProviderRollbackMs must be non-negative");
  }
  if (achieved?.productionRpoClaim !== false || achieved?.productionRtoClaim !== false) {
    errors.push("isolated rollback rehearsal must not claim production RPO/RTO");
  }
  if (achieved?.dataRollbackClaim !== false) {
    errors.push("application rollback must not claim database or Storage rollback");
  }

  for (const key of [
    "baselineServedBeforeDefect",
    "defectiveServedBeforeRollback",
    "rollbackDeploymentSingleVersion",
    "runtimeVersionMatchesBaseline",
    "runtimeMarkerMatchesBaseline",
    "fixtureContainsNoSolarisBindings",
  ] as const) {
    if (validation?.[key] !== true) errors.push(`${key} must be true`);
  }
  if (validation?.rollbackTrafficPercent !== 100) {
    errors.push("rollbackTrafficPercent must be exactly 100");
  }
  if (validation?.databaseRollbackAttempted !== false) {
    errors.push("databaseRollbackAttempted must be false");
  }
  if (validation?.storageRollbackAttempted !== false) {
    errors.push("storageRollbackAttempted must be false");
  }

  if (!artifactDigests) {
    errors.push("artifactDigests must be an object");
  } else {
    for (const key of REQUIRED_ARTIFACT_DIGESTS) {
      if (!exactSha256(artifactDigests[key])) {
        errors.push(`artifactDigests.${key} must be a SHA-256 digest`);
      }
    }
    const unexpected = Object.keys(artifactDigests).filter(
      (key) =>
        !REQUIRED_ARTIFACT_DIGESTS.includes(
          key as (typeof REQUIRED_ARTIFACT_DIGESTS)[number],
        ),
    );
    if (unexpected.length > 0) {
      errors.push("artifactDigests contains an unexpected artifact");
    }
  }

  if (!issuesFound) errors.push("issuesFound must be a string array");
  if (
    !followUpActions ||
    followUpActions.length === 0 ||
    followUpActions.some((item) => !item)
  ) {
    errors.push("followUpActions must retain full-service/provider follow-up work");
  }
  if (record.certificationClaim !== false) {
    errors.push("deployment rollback component must not claim release certification");
  }
  if (record.fullServiceRecoveryClaim !== false) {
    errors.push("deployment rollback component must not claim full-service recovery");
  }
  if (record.qaReviewRequired !== true) {
    errors.push("deployment rollback evidence must require QA review");
  }

  return {
    schemaVersion: 1,
    status: errors.length === 0 ? "ready_for_qa_review" : "invalid",
    expectedCommitSha,
    evidenceCommitSha,
    rehearsalId,
    workerName,
    baselineVersionId,
    defectiveVersionId,
    rollbackDeploymentId,
    isolatedProviderRollbackMs,
    errors,
    certificationClaim: false,
    fullServiceRecoveryClaim: false,
    qaReviewRequired: true,
  };
}
