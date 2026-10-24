import { createHash } from "node:crypto";

export type V3StorageRecoveryEvidenceStatus = "invalid" | "ready_for_qa_review";

type UnknownRecord = Record<string, unknown>;

type NormalizedObject = {
  key: string;
  sha256: string;
  bytes: number;
  mimeType: string;
};

export type V3StorageRecoveryEvidenceAssessment = {
  schemaVersion: 1;
  status: V3StorageRecoveryEvidenceStatus;
  expectedCommitSha: string | null;
  evidenceCommitSha: string | null;
  rehearsalId: string | null;
  objectCount: number;
  rehearsalDurationMs: number | null;
  exerciseRpoSeconds: number | null;
  manifestSha256: string | null;
  errors: readonly string[];
  certificationClaim: false;
  qaReviewRequired: true;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIMING_TOLERANCE_MS = 5_000;
const EXPECTED_KEYS = [
  "binary/payload.bin",
  "json/state.json",
  "text/notice.txt",
] as const;
const EXPECTED_MIME = new Map<string, string>([
  ["binary/payload.bin", "application/octet-stream"],
  ["json/state.json", "application/json"],
  ["text/notice.txt", "text/plain"],
]);

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

function manifestDigest(objects: readonly NormalizedObject[]) {
  const canonicalTsv = objects
    .map((object) => `${object.key}\t${object.sha256}\t${object.bytes}\t${object.mimeType}\n`)
    .join("");
  return createHash("sha256").update(canonicalTsv, "utf8").digest("hex");
}

/**
 * Validate retained S11 Storage byte-recovery rehearsal evidence.
 *
 * This proves only the isolated local Storage API exercise. Hosted Supabase
 * backup/export availability, provider recovery latency and final S11 release
 * certification remain separate evidence responsibilities.
 */
export function assessV3StorageRecoveryEvidence(
  value: unknown,
  expectedCommitShaValue: unknown,
): V3StorageRecoveryEvidenceAssessment {
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
      objectCount: 0,
      rehearsalDurationMs: null,
      exerciseRpoSeconds: null,
      manifestSha256: null,
      errors: [...errors, "Storage recovery evidence must be an object"],
      certificationClaim: false,
      qaReviewRequired: true,
    };
  }

  const evidenceCommitSha = exactSha(record.commitSha);
  const rehearsalId =
    typeof record.rehearsalId === "string" && UUID_RE.test(record.rehearsalId)
      ? record.rehearsalId.toLowerCase()
      : null;
  const environment = boundedLabel(record.environment);
  const operatorIdentity = boundedLabel(record.operatorIdentity);
  const startedAt = isoInstant(record.startedAt);
  const completedAt = isoInstant(record.completedAt);
  const snapshot = asRecord(record.snapshot);
  const achieved = asRecord(record.achieved);
  const validation = asRecord(record.validation);
  const manifestSha256 = exactSha256(snapshot?.manifestSha256);
  const objectCount = finiteNonNegative(snapshot?.objectCount);
  const objects = Array.isArray(snapshot?.objects) ? snapshot.objects : null;
  const rehearsalDurationMs = finiteNonNegative(achieved?.exerciseRtoMs);
  const exerciseRpoSeconds = finiteNonNegative(achieved?.exerciseRpoSeconds);
  const issuesFound = stringArray(record.issuesFound);
  const followUpActions = stringArray(record.followUpActions);

  if (record.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (record.kind !== "storage_byte_recovery_rehearsal") {
    errors.push("kind must be storage_byte_recovery_rehearsal");
  }
  if (record.scope !== "isolated_local_supabase_storage") {
    errors.push("scope must be isolated_local_supabase_storage");
  }
  if (record.status !== "passed") errors.push("status must be passed");
  if (!evidenceCommitSha) {
    errors.push("commitSha must be an exact 40-character SHA");
  } else if (expectedCommitSha && evidenceCommitSha !== expectedCommitSha) {
    errors.push("Storage recovery evidence does not belong to the expected commit SHA");
  }
  if (!environment) errors.push("environment must be a 1..120 character label");
  if (!operatorIdentity) errors.push("operatorIdentity must be a 1..120 character label");
  if (!rehearsalId) errors.push("rehearsalId must be a UUID");
  if (startedAt === null || completedAt === null || completedAt < startedAt) {
    errors.push("startedAt/completedAt must be ordered ISO timestamps");
  }

  if (!manifestSha256) errors.push("manifestSha256 must be a 64-character digest");
  if (objectCount !== EXPECTED_KEYS.length) {
    errors.push(`snapshot objectCount must be ${EXPECTED_KEYS.length}`);
  }
  if (snapshot?.bucketPublic !== false) {
    errors.push("snapshot bucket must be private");
  }

  const normalizedObjects: NormalizedObject[] = [];
  if (!objects || objects.length !== EXPECTED_KEYS.length) {
    errors.push(`snapshot objects must contain exactly ${EXPECTED_KEYS.length} objects`);
  } else {
    const seen = new Set<string>();
    for (const [index, objectValue] of objects.entries()) {
      const object = asRecord(objectValue);
      if (!object) {
        errors.push(`snapshot objects[${index}] must be an object`);
        continue;
      }
      const key = typeof object.key === "string" ? object.key : "";
      const sha256 = exactSha256(object.sha256);
      const bytes = finiteNonNegative(object.bytes);
      const mimeType = typeof object.mimeType === "string" ? object.mimeType : "";
      if (!EXPECTED_MIME.has(key)) {
        errors.push(`snapshot contains unexpected object key ${key || "<missing>"}`);
      } else if (seen.has(key)) {
        errors.push(`snapshot contains duplicate object key ${key}`);
      } else {
        seen.add(key);
        if (mimeType !== EXPECTED_MIME.get(key)) {
          errors.push(`snapshot MIME type mismatch for ${key}`);
        }
      }
      if (!sha256) errors.push(`snapshot sha256 missing for ${key || `objects[${index}]`}`);
      if (bytes === null || bytes <= 0) {
        errors.push(`snapshot bytes must be positive for ${key || `objects[${index}]`}`);
      }
      if (key && sha256 && bytes !== null && bytes > 0 && mimeType) {
        normalizedObjects.push({ key, sha256, bytes, mimeType });
      }
    }
    for (const key of EXPECTED_KEYS) {
      if (!seen.has(key)) errors.push(`snapshot is missing canonical rehearsal object ${key}`);
    }
  }
  if (
    manifestSha256
    && normalizedObjects.length === EXPECTED_KEYS.length
    && manifestDigest(normalizedObjects) !== manifestSha256
  ) {
    errors.push("manifestSha256 does not match the retained object manifest");
  }

  if (rehearsalDurationMs === null) {
    errors.push("exerciseRtoMs must be non-negative");
  } else if (
    startedAt !== null
    && completedAt !== null
    && completedAt >= startedAt
    && Math.abs((completedAt - startedAt) - rehearsalDurationMs) > TIMING_TOLERANCE_MS
  ) {
    errors.push(
      `exerciseRtoMs must agree with startedAt/completedAt within ${TIMING_TOLERANCE_MS} ms`,
    );
  }
  if (exerciseRpoSeconds !== 0) {
    errors.push("isolated Storage snapshot recovery must report exerciseRpoSeconds = 0");
  }
  if (achieved?.providerRpoClaim !== false || achieved?.providerRtoClaim !== false) {
    errors.push("local Storage rehearsal must not claim provider RPO/RTO");
  }

  for (const key of [
    "sameBucketIdRestored",
    "sameObjectKeysRestored",
    "byteHashesVerified",
    "byteSizesVerified",
    "mimeTypesVerified",
    "privatePolicyVerified",
  ] as const) {
    if (validation?.[key] !== true) errors.push(`${key} must be true`);
  }
  if (validation?.restoredCount !== EXPECTED_KEYS.length) {
    errors.push(`restoredCount must be ${EXPECTED_KEYS.length}`);
  }
  if (validation?.missingCount !== 0) errors.push("missingCount must be 0");
  if (validation?.extraCount !== 0) errors.push("extraCount must be 0");

  if (!issuesFound) {
    errors.push("issuesFound must be a string array");
  } else if (issuesFound.some((item) => !item)) {
    errors.push("issuesFound must not contain empty entries");
  } else if (record.status === "passed" && issuesFound.length > 0) {
    errors.push("passed Storage recovery evidence must not contain issuesFound");
  }
  if (!followUpActions || followUpActions.length === 0 || followUpActions.some((item) => !item)) {
    errors.push("followUpActions must retain remaining hosted-provider recovery work");
  }
  if (record.certificationClaim !== false) {
    errors.push("Storage recovery rehearsal must not claim release certification");
  }
  if (record.qaReviewRequired !== true) {
    errors.push("Storage recovery evidence must require QA review");
  }

  return {
    schemaVersion: 1,
    status: errors.length === 0 ? "ready_for_qa_review" : "invalid",
    expectedCommitSha,
    evidenceCommitSha,
    rehearsalId,
    objectCount: objectCount ?? 0,
    rehearsalDurationMs,
    exerciseRpoSeconds,
    manifestSha256,
    errors,
    certificationClaim: false,
    qaReviewRequired: true,
  };
}
