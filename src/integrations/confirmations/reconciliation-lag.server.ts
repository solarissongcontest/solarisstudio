import {
  verifyConfirmationEditionProjectionInternal,
  type ConfirmationProjectionVerificationResult,
} from "./reconcile.server";

export const V3_ENTRY_PROJECTION_LAG_MAX_ISSUES = 500;

export type ConfirmationEntryProjectionLagResult = {
  editionId: string;
  state: "consistent" | "drift" | "unknown";
  reason: "verified" | "verification_unknown" | "issue_bound_exceeded" | "drift_age_unavailable";
  issueCount: number;
  oldestDriftAgeSeconds: number | null;
  measuredAt: string;
};

export type ConfirmationEntryProjectionLagDependencies = {
  db: any;
  verify: (editionId: string) => Promise<ConfirmationProjectionVerificationResult>;
  now?: () => Date;
};

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function loadTimestamps(
  db: any,
  table: "submissions" | "entries",
  ids: readonly string[],
) {
  if (!ids.length) return [] as string[];
  const result = await db.from(table).select("id,updated_at").in("id", ids);
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? [])
    .map((row: { updated_at?: string | null }) => row.updated_at)
    .filter((value: unknown): value is string => typeof value === "string" && value.length > 0);
}

function oldestAgeSeconds(now: Date, timestamps: readonly string[]) {
  const nowMs = now.getTime();
  const valid = timestamps
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value));
  if (!valid.length || !Number.isFinite(nowMs)) return null;
  const oldest = Math.min(...valid);
  return Math.max(0, Math.floor((nowMs - oldest) / 1000));
}

/**
 * Read-only S6 lag metric for the Confirmation-owned Entry/Participant projection.
 *
 * Truth still comes from the independent verifier. We only resolve timestamps
 * for the bounded source rows named by its issues, so measuring lag cannot
 * mutate, repair, or broaden the verifier's authority.
 */
export async function measureConfirmationEntryProjectionLagWithDependencies(
  editionId: string,
  dependencies: ConfirmationEntryProjectionLagDependencies,
): Promise<ConfirmationEntryProjectionLagResult> {
  const now = dependencies.now?.() ?? new Date();
  const verification = await dependencies.verify(editionId);

  if (verification.state === "unknown") {
    return {
      editionId,
      state: "unknown",
      reason: "verification_unknown",
      issueCount: verification.issueCount,
      oldestDriftAgeSeconds: null,
      measuredAt: now.toISOString(),
    };
  }

  if (verification.state === "consistent") {
    return {
      editionId,
      state: "consistent",
      reason: "verified",
      issueCount: 0,
      oldestDriftAgeSeconds: 0,
      measuredAt: now.toISOString(),
    };
  }

  if (verification.issues.length > V3_ENTRY_PROJECTION_LAG_MAX_ISSUES) {
    return {
      editionId,
      state: "unknown",
      reason: "issue_bound_exceeded",
      issueCount: verification.issueCount,
      oldestDriftAgeSeconds: null,
      measuredAt: now.toISOString(),
    };
  }

  const submissionIds = unique(verification.issues.map((issue) => issue.submissionId));
  const orphanEntryIds = unique(
    verification.issues
      .filter((issue) => issue.code === "orphan_confirmation_entry")
      .map((issue) => issue.entryId),
  );
  const timestamps = [
    ...(await loadTimestamps(dependencies.db, "submissions", submissionIds)),
    ...(await loadTimestamps(dependencies.db, "entries", orphanEntryIds)),
  ];
  const oldestDriftAgeSeconds = oldestAgeSeconds(now, timestamps);

  return {
    editionId,
    state: "drift",
    reason: oldestDriftAgeSeconds === null ? "drift_age_unavailable" : "verified",
    issueCount: verification.issueCount,
    oldestDriftAgeSeconds,
    measuredAt: now.toISOString(),
  };
}

export async function measureConfirmationEntryProjectionLagInternal(editionId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return measureConfirmationEntryProjectionLagWithDependencies(editionId, {
    db: supabaseAdmin as any,
    verify: verifyConfirmationEditionProjectionInternal,
  });
}
