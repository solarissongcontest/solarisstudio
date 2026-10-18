import { syncConfirmationSubmissionToSolarisInternal } from "./sync.functions";

export const V3_CONFIRMATION_RECONCILIATION_DEFAULT_BATCH = 25;
export const V3_CONFIRMATION_RECONCILIATION_MAX_BATCH = 50;
export const V3_CONFIRMATION_RECONCILIATION_VERIFY_MAX_ROWS = 500;

type ReconcileOptions = {
  offset?: number;
  limit?: number;
};

type ReconcileOutcome = {
  submissionId: string;
  ok: boolean;
  status: string;
  message?: string;
};

export type ConfirmationEditionReconciliationResult = {
  editionId: string;
  offset: number;
  limit: number;
  totalSubmissions: number;
  processed: number;
  succeeded: number;
  failed: number;
  nextOffset: number | null;
  complete: boolean;
  outcomes: ReconcileOutcome[];
};

export type ConfirmationProjectionVerificationIssue = {
  code:
    | "unmatched_country"
    | "missing_entry"
    | "entry_submission_provenance"
    | "entry_status"
    | "entry_artist"
    | "entry_song"
    | "entry_song_url"
    | "missing_participant"
    | "participant_status"
    | "participant_artist"
    | "participant_song"
    | "orphan_confirmation_entry";
  submissionId?: string;
  country?: string;
  entryId?: string;
};

export type ConfirmationProjectionVerificationResult = {
  editionId: string;
  state: "consistent" | "drift" | "unknown";
  reason: "verified" | "verification_bound_exceeded";
  totalSubmissions: number;
  latestCountrySubmissions: number;
  canonicalOwnedOutsideConfirmations: number;
  canonicalNewer: number;
  issueCount: number;
  issues: ConfirmationProjectionVerificationIssue[];
  verifiedAt: string;
};

export type ConfirmationReconciliationDependencies = {
  db: any;
  syncSubmission: typeof syncConfirmationSubmissionToSolarisInternal;
};

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Expected integer between ${min} and ${max}.`);
  }
  return value;
}

function normalizeCountry(value: unknown) {
  return typeof value === "string" ? value.trim().toLocaleLowerCase() : "";
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function safeError(caught: unknown) {
  const message = caught instanceof Error ? caught.message : String(caught ?? "Unknown error");
  return message.slice(0, 240);
}

function latestSubmissionWins(
  candidate: { id: string; updated_at?: string | null },
  current: { id: string; updated_at?: string | null } | undefined,
) {
  if (!current) return true;
  const candidateTime = Date.parse(candidate.updated_at ?? "");
  const currentTime = Date.parse(current.updated_at ?? "");
  if (Number.isFinite(candidateTime) && Number.isFinite(currentTime) && candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }
  return candidate.id.localeCompare(current.id) > 0;
}

async function loadEdition(db: any, editionId: string) {
  const lookup = await db
    .from("editions")
    .select("id")
    .eq("id", editionId)
    .maybeSingle();
  if (lookup.error) throw new Error(lookup.error.message);
  if (!lookup.data) throw new Error("Unknown edition.");
}

/**
 * Dependency-injected recovery core used by the production wrapper and by S11
 * deterministic failure-injection evidence. The injected sync function must be
 * the canonical Confirmation sync in production; tests may inject a controlled
 * failure without changing production authority or touching hosted Supabase.
 */
export async function reconcileConfirmationEditionToSolarisWithDependencies(
  editionId: string,
  options: ReconcileOptions,
  dependencies: ConfirmationReconciliationDependencies,
): Promise<ConfirmationEditionReconciliationResult> {
  const offset = boundedInteger(options.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = boundedInteger(
    options.limit,
    V3_CONFIRMATION_RECONCILIATION_DEFAULT_BATCH,
    1,
    V3_CONFIRMATION_RECONCILIATION_MAX_BATCH,
  );
  const { db, syncSubmission } = dependencies;
  await loadEdition(db, editionId);

  const page = await db
    .from("submissions")
    .select("id,updated_at", { count: "exact" })
    .eq("edition_id", editionId)
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (page.error) throw new Error(page.error.message);

  const rows = page.data ?? [];
  const totalSubmissions = page.count ?? rows.length;
  const outcomes: ReconcileOutcome[] = [];

  // Deliberately sequential. A repair wave must not create an uncontrolled
  // service-role burst against the database or dependent projection hooks.
  for (const row of rows) {
    try {
      const result = await syncSubmission(row.id);
      outcomes.push({
        submissionId: row.id,
        ok: result.ok,
        status: result.status,
        ...(result.message ? { message: result.message.slice(0, 240) } : {}),
      });
    } catch (caught) {
      outcomes.push({
        submissionId: row.id,
        ok: false,
        status: "failed",
        message: safeError(caught),
      });
    }
  }

  const processed = outcomes.length;
  const nextOffset = offset + processed < totalSubmissions ? offset + processed : null;

  return {
    editionId,
    offset,
    limit,
    totalSubmissions,
    processed,
    succeeded: outcomes.filter((outcome) => outcome.ok).length,
    failed: outcomes.filter((outcome) => !outcome.ok).length,
    nextOffset,
    // `complete` means the bounded page traversal reached the end. Recovery is
    // successful only when `failed === 0` and an independent verifier agrees.
    complete: nextOffset === null,
    outcomes,
  };
}

/**
 * Bounded S6 repair path for the Confirmation -> Solaris Entry projection.
 *
 * It intentionally delegates each row to the existing canonical sync function,
 * so reconciliation does not invent a second write authority. Calls are
 * edition-scoped, ordered deterministically, and capped per invocation. Exact
 * submission replay remains safe because the canonical sync already protects
 * external ownership and newer final lifecycle state.
 */
export async function reconcileConfirmationEditionToSolarisInternal(
  editionId: string,
  options: ReconcileOptions = {},
): Promise<ConfirmationEditionReconciliationResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return reconcileConfirmationEditionToSolarisWithDependencies(editionId, options, {
    db: supabaseAdmin as any,
    syncSubmission: syncConfirmationSubmissionToSolarisInternal,
  });
}

/**
 * Dependency-injected, read-only verification core. Keeping the verifier
 * independently injectable lets S11 prove stale-projection detection and
 * post-repair consistency without giving the verifier any mutation primitive.
 */
export async function verifyConfirmationEditionProjectionWithDatabase(
  editionId: string,
  db: any,
): Promise<ConfirmationProjectionVerificationResult> {
  await loadEdition(db, editionId);

  const submissionsResult = await db
    .from("submissions")
    .select("id,country,participating,selection_method,updated_at", { count: "exact" })
    .eq("edition_id", editionId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(0, V3_CONFIRMATION_RECONCILIATION_VERIFY_MAX_ROWS - 1);
  if (submissionsResult.error) throw new Error(submissionsResult.error.message);

  const totalSubmissions = submissionsResult.count ?? (submissionsResult.data ?? []).length;
  if (totalSubmissions > V3_CONFIRMATION_RECONCILIATION_VERIFY_MAX_ROWS) {
    return {
      editionId,
      state: "unknown",
      reason: "verification_bound_exceeded",
      totalSubmissions,
      latestCountrySubmissions: 0,
      canonicalOwnedOutsideConfirmations: 0,
      canonicalNewer: 0,
      issueCount: 0,
      issues: [],
      verifiedAt: new Date().toISOString(),
    };
  }

  const latestByCountry = new Map<string, any>();
  for (const submission of submissionsResult.data ?? []) {
    const key = normalizeCountry(submission.country);
    if (!key) continue;
    const current = latestByCountry.get(key);
    if (latestSubmissionWins(submission, current)) latestByCountry.set(key, submission);
  }
  const latestSubmissions = [...latestByCountry.values()];
  const submissionIds = latestSubmissions.map((submission) => submission.id);

  const [countriesResult, entriesResult, participantsResult] = await Promise.all([
    db.from("countries").select("id,name"),
    db
      .from("entries")
      .select("id,country_id,source,source_ref,status,artist,song_title,song_url,metadata,updated_at")
      .eq("edition_id", editionId),
    db
      .from("participants")
      .select("id,country_id,participation_status,artist,song")
      .eq("edition_id", editionId)
      .is("show_id", null),
  ]);
  if (countriesResult.error) throw new Error(countriesResult.error.message);
  if (entriesResult.error) throw new Error(entriesResult.error.message);
  if (participantsResult.error) throw new Error(participantsResult.error.message);

  let internalEntries: any[] = [];
  let nationalFinals: any[] = [];
  if (submissionIds.length) {
    const [internalResult, nationalFinalResult] = await Promise.all([
      db
        .from("internal_entries")
        .select("id,submission_id,artist,song_title,song_url,review_status")
        .in("submission_id", submissionIds),
      db
        .from("national_finals")
        .select("id,submission_id,winning_entry_id")
        .in("submission_id", submissionIds),
    ]);
    if (internalResult.error) throw new Error(internalResult.error.message);
    if (nationalFinalResult.error) throw new Error(nationalFinalResult.error.message);
    internalEntries = internalResult.data ?? [];
    nationalFinals = nationalFinalResult.data ?? [];
  }

  const winnerIds = nationalFinals
    .map((nationalFinal) => nationalFinal.winning_entry_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  let nationalFinalEntries: any[] = [];
  if (winnerIds.length) {
    const winnerResult = await db
      .from("national_final_entries")
      .select("id,artist,song_title,song_url,review_status,removed")
      .in("id", winnerIds);
    if (winnerResult.error) throw new Error(winnerResult.error.message);
    nationalFinalEntries = winnerResult.data ?? [];
  }

  const countryByName = new Map<string, any>(
    (countriesResult.data ?? []).map(
      (country: any) => [normalizeCountry(country.name), country] as const,
    ),
  );
  const entryByCountry = new Map<string, any>(
    (entriesResult.data ?? []).map((entry: any) => [entry.country_id, entry] as const),
  );
  const participantByCountry = new Map<string, any>(
    (participantsResult.data ?? []).map(
      (participant: any) => [participant.country_id, participant] as const,
    ),
  );
  const internalBySubmission = new Map<string, any>(
    internalEntries.map((entry) => [entry.submission_id, entry] as const),
  );
  const nationalFinalBySubmission = new Map<string, any>(
    nationalFinals.map(
      (nationalFinal) => [nationalFinal.submission_id, nationalFinal] as const,
    ),
  );
  const nationalFinalEntryById = new Map<string, any>(
    nationalFinalEntries.map((entry) => [entry.id, entry] as const),
  );

  const issues: ConfirmationProjectionVerificationIssue[] = [];
  const expectedCountryIds = new Set<string>();
  let canonicalOwnedOutsideConfirmations = 0;
  let canonicalNewer = 0;

  for (const submission of latestSubmissions) {
    const country = countryByName.get(normalizeCountry(submission.country));
    if (!country) {
      issues.push({
        code: "unmatched_country",
        submissionId: submission.id,
        country: submission.country,
      });
      continue;
    }
    expectedCountryIds.add(country.id);

    const entry = entryByCountry.get(country.id);
    if (!entry) {
      issues.push({
        code: "missing_entry",
        submissionId: submission.id,
        country: submission.country,
      });
      continue;
    }

    if (entry.source !== "confirmations") {
      canonicalOwnedOutsideConfirmations += 1;
      continue;
    }

    let officialEntry: any = null;
    if (submission.selection_method === "internal") {
      const candidate = internalBySubmission.get(submission.id);
      if (
        candidate?.review_status === "accepted" &&
        cleanText(candidate.artist) &&
        cleanText(candidate.song_title)
      ) {
        officialEntry = candidate;
      }
    } else if (submission.selection_method === "national_final") {
      const nationalFinal = nationalFinalBySubmission.get(submission.id);
      const winner = nationalFinal?.winning_entry_id
        ? nationalFinalEntryById.get(nationalFinal.winning_entry_id)
        : null;
      if (
        winner?.review_status === "accepted" &&
        !winner.removed &&
        cleanText(winner.artist) &&
        cleanText(winner.song_title)
      ) {
        officialEntry = winner;
      }
    }

    const expectedEntryStatus = submission.participating
      ? officialEntry
        ? "confirmed"
        : "pending"
      : "withdrawn";
    const expectedParticipantStatus = submission.participating ? "confirmed" : "withdrawn";
    const canonicalUpdatedAt = Date.parse(entry.updated_at ?? "");
    const submissionUpdatedAt = Date.parse(submission.updated_at ?? "");
    const hasNewerFinalLifecycle =
      ["confirmed", "withdrawn"].includes(entry.status) &&
      entry.status !== expectedEntryStatus &&
      Number.isFinite(canonicalUpdatedAt) &&
      Number.isFinite(submissionUpdatedAt) &&
      canonicalUpdatedAt > submissionUpdatedAt;

    if (hasNewerFinalLifecycle) {
      canonicalNewer += 1;
      continue;
    }

    if (entry.metadata?.confirmation_submission_id !== submission.id) {
      issues.push({
        code: "entry_submission_provenance",
        submissionId: submission.id,
        country: submission.country,
        entryId: entry.id,
      });
    }
    if (entry.status !== expectedEntryStatus) {
      issues.push({
        code: "entry_status",
        submissionId: submission.id,
        country: submission.country,
        entryId: entry.id,
      });
    }

    const expectedArtist = cleanText(officialEntry?.artist);
    const expectedSong = cleanText(officialEntry?.song_title);
    const expectedSongUrl = cleanText(officialEntry?.song_url);
    if (cleanText(entry.artist) !== expectedArtist) {
      issues.push({
        code: "entry_artist",
        submissionId: submission.id,
        country: submission.country,
        entryId: entry.id,
      });
    }
    if (cleanText(entry.song_title) !== expectedSong) {
      issues.push({
        code: "entry_song",
        submissionId: submission.id,
        country: submission.country,
        entryId: entry.id,
      });
    }
    if (cleanText(entry.song_url) !== expectedSongUrl) {
      issues.push({
        code: "entry_song_url",
        submissionId: submission.id,
        country: submission.country,
        entryId: entry.id,
      });
    }

    const participant = participantByCountry.get(country.id);
    if (!participant) {
      issues.push({
        code: "missing_participant",
        submissionId: submission.id,
        country: submission.country,
        entryId: entry.id,
      });
      continue;
    }
    if (participant.participation_status !== expectedParticipantStatus) {
      issues.push({
        code: "participant_status",
        submissionId: submission.id,
        country: submission.country,
        entryId: entry.id,
      });
    }
    if (cleanText(participant.artist) !== expectedArtist) {
      issues.push({
        code: "participant_artist",
        submissionId: submission.id,
        country: submission.country,
        entryId: entry.id,
      });
    }
    if (cleanText(participant.song) !== expectedSong) {
      issues.push({
        code: "participant_song",
        submissionId: submission.id,
        country: submission.country,
        entryId: entry.id,
      });
    }
  }

  for (const entry of entriesResult.data ?? []) {
    if (entry.source === "confirmations" && !expectedCountryIds.has(entry.country_id)) {
      issues.push({ code: "orphan_confirmation_entry", entryId: entry.id });
    }
  }

  return {
    editionId,
    state: issues.length ? "drift" : "consistent",
    reason: "verified",
    totalSubmissions,
    latestCountrySubmissions: latestSubmissions.length,
    canonicalOwnedOutsideConfirmations,
    canonicalNewer,
    issueCount: issues.length,
    issues,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Independent, read-only S6 verification for the same edition-scoped
 * projection. It compares the latest Confirmation response for each country to
 * canonical Entry + participant compatibility rows. It never repairs while
 * verifying and fails closed to `unknown` if the bounded diagnostic ceiling is
 * exceeded.
 */
export async function verifyConfirmationEditionProjectionInternal(
  editionId: string,
): Promise<ConfirmationProjectionVerificationResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return verifyConfirmationEditionProjectionWithDatabase(editionId, supabaseAdmin as any);
}
