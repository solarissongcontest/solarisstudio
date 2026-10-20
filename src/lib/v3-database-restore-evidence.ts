export type V3DatabaseRestoreEvidenceStatus = "invalid" | "ready_for_qa_review";

export type V3DatabaseRestoreEvidenceAssessment = {
  schemaVersion: 1;
  status: V3DatabaseRestoreEvidenceStatus;
  expectedCommitSha: string | null;
  evidenceCommitSha: string | null;
  rehearsalDurationMs: number | null;
  exerciseRpoSeconds: number | null;
  snapshotSha256: string | null;
  criticalRelationCount: number;
  errors: readonly string[];
  certificationClaim: false;
  qaReviewRequired: true;
};

type UnknownRecord = Record<string, unknown>;

const REQUIRED_CRITICAL_RELATIONS = [
  "public.editions",
  "public.shows",
  "public.participants",
  "public.entries",
  "public.jury_votes",
  "public.televote_votes",
  "public.results",
  "public.studio2_operation_receipts",
  "public.admin_audit_log",
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

/**
 * Validate retained S11 database-restore rehearsal evidence.
 *
 * This deliberately proves only the isolated local exercise. It does not turn
 * a local pg_dump/pg_restore rehearsal into a hosted Supabase RPO/RTO claim or
 * into release certification.
 */
export function assessV3DatabaseRestoreEvidence(
  value: unknown,
  expectedCommitShaValue: unknown,
): V3DatabaseRestoreEvidenceAssessment {
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
      rehearsalDurationMs: null,
      exerciseRpoSeconds: null,
      snapshotSha256: null,
      criticalRelationCount: 0,
      errors: [...errors, "database restore evidence must be an object"],
      certificationClaim: false,
      qaReviewRequired: true,
    };
  }

  const evidenceCommitSha = exactSha(record.commitSha);
  const startedAt = isoInstant(record.startedAt);
  const completedAt = isoInstant(record.completedAt);
  const snapshot = asRecord(record.snapshot);
  const achieved = asRecord(record.achieved);
  const validation = asRecord(record.validation);
  const snapshotSha256 = exactSha256(snapshot?.sha256);
  const snapshotBytes = finiteNonNegative(snapshot?.bytes);
  const rehearsalDurationMs = finiteNonNegative(achieved?.exerciseRtoMs);
  const exerciseRpoSeconds = finiteNonNegative(achieved?.exerciseRpoSeconds);
  const fingerprints = asRecord(validation?.criticalRelationFingerprints);
  const issuesFound = stringArray(record.issuesFound);
  const followUpActions = stringArray(record.followUpActions);

  if (record.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (record.kind !== "database_restore_rehearsal") {
    errors.push("kind must be database_restore_rehearsal");
  }
  if (record.scope !== "isolated_local_supabase") {
    errors.push("scope must be isolated_local_supabase");
  }
  if (record.status !== "passed") errors.push("status must be passed");
  if (!evidenceCommitSha) {
    errors.push("commitSha must be an exact 40-character SHA");
  } else if (expectedCommitSha && evidenceCommitSha !== expectedCommitSha) {
    errors.push("database restore evidence does not belong to the expected commit SHA");
  }
  if (typeof record.environment !== "string" || record.environment.trim().length === 0) {
    errors.push("environment must be a non-empty label");
  } else if (record.environment.length > 120) {
    errors.push("environment must be at most 120 characters");
  }
  if (startedAt === null || completedAt === null || completedAt < startedAt) {
    errors.push("startedAt/completedAt must be ordered ISO timestamps");
  }
  if (snapshot?.format !== "pg_dump_custom") {
    errors.push("snapshot format must be pg_dump_custom");
  }
  if (!snapshotSha256) errors.push("snapshot sha256 must be a 64-character digest");
  if (snapshotBytes === null || snapshotBytes <= 0) {
    errors.push("snapshot bytes must be positive");
  }
  if (rehearsalDurationMs === null) errors.push("exerciseRtoMs must be non-negative");
  if (exerciseRpoSeconds !== 0) {
    errors.push("isolated snapshot restore evidence must report exerciseRpoSeconds = 0");
  }
  if (achieved?.providerRpoClaim !== false || achieved?.providerRtoClaim !== false) {
    errors.push("local rehearsal must not claim provider RPO/RTO");
  }

  if (!fingerprints) {
    errors.push("criticalRelationFingerprints must be an object");
  } else {
    for (const relation of REQUIRED_CRITICAL_RELATIONS) {
      const fingerprint = fingerprints[relation];
      if (typeof fingerprint !== "string" || !/^\d+:-?\d+$/.test(fingerprint)) {
        errors.push(`missing or invalid fingerprint for ${relation}`);
      }
    }
    const unexpected = Object.keys(fingerprints).filter(
      (relation) => !REQUIRED_CRITICAL_RELATIONS.includes(relation as (typeof REQUIRED_CRITICAL_RELATIONS)[number]),
    );
    if (unexpected.length > 0) {
      errors.push("criticalRelationFingerprints contains an unexpected relation");
    }
  }

  if (typeof validation?.foreignKeyValidationState !== "string" || !/^\d+:\d+$/.test(validation.foreignKeyValidationState)) {
    errors.push("foreignKeyValidationState must contain total:validated counts");
  }
  for (const key of [
    "sentinelVerified",
    "operationReceiptsPresent",
    "domainEventsPresent",
    "domainEventOutboxPresent",
  ] as const) {
    if (validation?.[key] !== true) errors.push(`${key} must be true`);
  }

  if (!issuesFound) errors.push("issuesFound must be a string array");
  if (!followUpActions || followUpActions.length === 0 || followUpActions.some((item) => !item)) {
    errors.push("followUpActions must contain the remaining provider/release work");
  }
  if (record.certificationClaim !== false) {
    errors.push("database restore rehearsal must not claim release certification");
  }
  if (record.qaReviewRequired !== true) {
    errors.push("database restore evidence must require QA review");
  }

  return {
    schemaVersion: 1,
    status: errors.length === 0 ? "ready_for_qa_review" : "invalid",
    expectedCommitSha,
    evidenceCommitSha,
    rehearsalDurationMs,
    exerciseRpoSeconds,
    snapshotSha256,
    criticalRelationCount: fingerprints ? Object.keys(fingerprints).length : 0,
    errors,
    certificationClaim: false,
    qaReviewRequired: true,
  };
}
