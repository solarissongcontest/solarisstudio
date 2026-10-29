import { createConfirmationPublicRuntimeClient } from "@/integrations/confirmations/public-runtime.server";
import {
  createSolarisAuthenticatedClientServer,
  getSolarisAccessTokenServer,
} from "@/integrations/supabase/organizer.server";
import { resolveCurrentPublicEdition } from "@/lib/current-contest-state";
import type { Edition } from "@/lib/data";
import {
  buildStudio2HodWorkspaceSnapshot,
  mapStudio2HodContext,
} from "@/lib/studio2-hod-workspace";
import type { EntryCredit, EntryCreditRole } from "@/lib/ssc";
import {
  deriveV3EntryLifecycle,
  reviewMatchesCurrentVersion,
  type V3EntryCandidate,
  type V3EntryConfirmationProjection,
  type V3EntryProjection,
  type V3EntryReviewStatus,
  type V3EntrySubmissionReceipt,
  type V3EntryVersionEvidence,
} from "@/lib/v3-entry";

const EDITION_COLUMNS =
  "id,edition_number,name,year,slug,description,host_country_id,host_city,logo,theme_id,status,published";

const ENTRY_CREDIT_ROLES = new Set<EntryCreditRole>([
  "composer",
  "lyricist",
  "songwriter",
  "producer",
  "arranger",
  "other",
]);

type RpcResult = { data: unknown; error: unknown };
type AnyClient = {
  auth: {
    getUser(token?: string): Promise<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
  from(table: string): any;
};

type ConfirmationEntryRow = {
  id?: unknown;
  artist?: unknown;
  song_title?: unknown;
  credits?: unknown;
  review_status?: unknown;
  review_reason?: unknown;
  content_revision?: unknown;
  current_version_id?: unknown;
  reviewed_version_id?: unknown;
  removed?: unknown;
};

type ConfirmationResponse = {
  submission_id?: unknown;
  round_id?: unknown;
  round_name?: unknown;
  edition_id?: unknown;
  submitted_at?: unknown;
  updated_at?: unknown;
  selection_method?: unknown;
  can_edit?: unknown;
  reason?: unknown;
  internal_entry?: unknown;
  national_final?: unknown;
};

type CountryAccessPayload = {
  authenticated?: unknown;
  country?: unknown;
  responses?: unknown;
};

type EntryReceiptPayload = {
  found?: unknown;
  receipt?: unknown;
};

export type V3EntryServerBundle = {
  projection: V3EntryProjection;
  shell: {
    editionLabel: string;
    phaseLabel: string;
  };
  generatedAt: string;
};

function throwIfError(error: unknown, label: string) {
  if (!error) return;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? label)
        : label;
  throw new Error(`${label}: ${message}`);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapCredits(value: unknown): EntryCredit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const row = objectOrNull(item);
    const role = stringOrNull(row?.role)?.toLowerCase() ?? "";
    const name = stringOrNull(row?.name);
    if (!name || !ENTRY_CREDIT_ROLES.has(role as EntryCreditRole)) return [];
    return [{ role: role as EntryCreditRole, name }];
  });
}

function reviewStatus(value: unknown): V3EntryReviewStatus {
  return value === "pending" || value === "accepted" || value === "declined" || value === "removed"
    ? value
    : "unknown";
}

function mapCandidate(value: unknown): V3EntryCandidate | null {
  const row = objectOrNull(value) as ConfirmationEntryRow | null;
  const id = stringOrNull(row?.id);
  if (!row || !id) return null;
  const status = reviewStatus(row.review_status);
  const currentVersionId = stringOrNull(row.current_version_id);
  const reviewedVersionId = stringOrNull(row.reviewed_version_id);
  return {
    id,
    artist: stringOrNull(row.artist),
    songTitle: stringOrNull(row.song_title),
    credits: mapCredits(row.credits),
    reviewStatus: status,
    reviewReason: stringOrNull(row.review_reason),
    contentRevision: integerOrNull(row.content_revision),
    currentVersionId,
    reviewedVersionId,
    reviewMatchesCurrentVersion: reviewMatchesCurrentVersion({
      currentVersionId,
      reviewedVersionId,
      reviewStatus: status,
    }),
    removed: row.removed === true,
  };
}

function mapVersionHistory(value: unknown): V3EntryVersionEvidence[] {
  const payload = objectOrNull(value);
  const versions = Array.isArray(payload?.versions) ? payload.versions : [];
  return versions.flatMap((item) => {
    const row = objectOrNull(item);
    const id = stringOrNull(row?.id);
    const revision = integerOrNull(row?.revision);
    if (!row || !id || revision == null) return [];
    const content = objectOrNull(row.content) ?? {};
    const reviews = Array.isArray(row.reviews)
      ? row.reviews.flatMap((review) => {
          const reviewRow = objectOrNull(review);
          const decision = stringOrNull(reviewRow?.decision);
          if (!reviewRow || !decision) return [];
          return [{
            decision,
            reason: stringOrNull(reviewRow.reason),
            reviewedAt: stringOrNull(reviewRow.reviewed_at),
          }];
        })
      : [];
    return [{
      id,
      revision,
      parentVersionId: stringOrNull(row.parent_version_id),
      source: stringOrNull(row.source) ?? "canonical_write",
      restoredFromSubmissionVersionId: stringOrNull(row.restored_from_submission_version_id),
      artist: stringOrNull(content.artist),
      songTitle: stringOrNull(content.song_title),
      credits: mapCredits(content.credits),
      recordedAt: stringOrNull(row.recorded_at),
      reviews,
    }];
  });
}

function mapSubmissionReceipt(value: unknown): V3EntrySubmissionReceipt | null {
  const payload = objectOrNull(value) as EntryReceiptPayload | null;
  if (!payload || payload.found !== true) return null;
  const receipt = objectOrNull(payload.receipt);
  if (!receipt || receipt.authority !== "authoritative_server") return null;
  const receiptId = stringOrNull(receipt.receipt_id);
  const roundId = stringOrNull(receipt.round_id);
  const acceptedAt = stringOrNull(receipt.accepted_at);
  if (!receiptId || !roundId || !acceptedAt) return null;
  return {
    authority: "authoritative_server",
    receiptId,
    roundId,
    acceptedAt,
  };
}

function editionLabel(edition: Edition) {
  return edition.edition_number == null
    ? edition.name
    : `SSC ${edition.edition_number} · ${edition.name}`;
}

function emptyProjection(
  state: "no-delegation" | "no-edition",
  edition: Edition | null,
): V3EntryProjection {
  return {
    state,
    edition: edition ? { id: edition.id, label: editionLabel(edition) } : null,
    delegation: null,
    confirmation: null,
    readiness: {
      score: null,
      state: null,
      eligibilityStatus: null,
      checks: [],
      actions: [],
    },
    versionHistory: [],
  };
}

/**
 * Authenticated participant Entry read model. Identity is derived from the
 * bearer token, delegation ownership from the canonical country-account RPC,
 * readiness from studio2_hod_context, immutable review evidence from the
 * exact-version history RPC, and receipt evidence from an authenticated
 * country-account projection over the existing Confirmation operation ledger.
 * It does not read the public participant archive and owns no submission writer.
 */
export async function loadCurrentV3EntryBundle(): Promise<V3EntryServerBundle> {
  const token = getSolarisAccessTokenServer();
  const client = createSolarisAuthenticatedClientServer() as unknown as AnyClient;
  const publicClient = createConfirmationPublicRuntimeClient() as unknown as AnyClient;
  const user = await client.auth.getUser(token);
  if (user.error || !user.data.user) throw new Error("Solaris session is not authenticated.");

  const editionResult = await publicClient
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("published", true)
    .order("edition_number", { ascending: false });
  throwIfError(editionResult.error, "Could not load the current Solaris edition");
  const edition = resolveCurrentPublicEdition((editionResult.data ?? []) as Edition[]);
  if (!edition) {
    return {
      projection: emptyProjection("no-edition", null),
      shell: { editionLabel: "Solaris Studio", phaseLabel: "Entry" },
      generatedAt: new Date().toISOString(),
    };
  }

  const [accessResult, hodFeatureResult] = await Promise.all([
    client.rpc("public_country_account_confirmation_access"),
    client.rpc("studio2_feature_enabled", {
      p_key: "hod_workspace_v2",
      p_edition_id: edition.id,
    }),
  ]);
  throwIfError(accessResult.error, "Could not resolve your delegation Entry access");
  throwIfError(hodFeatureResult.error, "Could not resolve the HOD workspace capability");
  if (hodFeatureResult.data !== true) {
    throw new Error("HOD workspace is not available for this edition.");
  }

  const access = (objectOrNull(accessResult.data) ?? {}) as CountryAccessPayload;
  const country = objectOrNull(access.country);
  const countryId = stringOrNull(country?.country_id);
  const countryName = stringOrNull(country?.name);
  const countryCode = stringOrNull(country?.short_code);
  if (access.authenticated !== true || !countryId || !countryName || !countryCode) {
    return {
      projection: emptyProjection("no-delegation", edition),
      shell: { editionLabel: editionLabel(edition), phaseLabel: "Entry" },
      generatedAt: new Date().toISOString(),
    };
  }

  const hodResult = await client.rpc("studio2_hod_context", {
    p_edition_id: edition.id,
    p_country_id: countryId,
  });
  throwIfError(hodResult.error, "Could not load your authoritative Entry workspace");
  const hodContext = mapStudio2HodContext(hodResult.data);
  if (hodContext.editionId !== edition.id || hodContext.countryId !== countryId) {
    throw new Error("Canonical Entry workspace returned data outside the authorized edition or delegation.");
  }
  const workspace = buildStudio2HodWorkspaceSnapshot(hodContext);

  const responses = Array.isArray(access.responses) ? access.responses : [];
  const response = responses
    .map((value) => objectOrNull(value) as ConfirmationResponse | null)
    .find((value) => value && stringOrNull(value.edition_id) === edition.id) ?? null;
  const submissionId = stringOrNull(response?.submission_id);

  let submissionReceipt: V3EntrySubmissionReceipt | null = null;
  if (submissionId) {
    const receiptResult = await client.rpc("v3_country_account_entry_receipt", {
      p_submission_id: submissionId,
    });
    throwIfError(receiptResult.error, "Could not load authoritative Entry receipt evidence");
    submissionReceipt = mapSubmissionReceipt(receiptResult.data);
  }

  const internalEntry = mapCandidate(response?.internal_entry);
  const nationalFinalRaw = objectOrNull(response?.national_final);
  const nationalFinalEntries = Array.isArray(nationalFinalRaw?.entries)
    ? nationalFinalRaw!.entries.flatMap((value) => {
        const candidate = mapCandidate(value);
        return candidate ? [candidate] : [];
      })
    : [];

  const confirmation: V3EntryConfirmationProjection | null = response && submissionId
    ? {
        submissionId,
        roundId: stringOrNull(response.round_id),
        roundName: stringOrNull(response.round_name),
        submittedAt: stringOrNull(response.submitted_at),
        updatedAt: stringOrNull(response.updated_at),
        selectionMethod: stringOrNull(response.selection_method),
        canEdit: response.can_edit === true,
        editReason: stringOrNull(response.reason),
        receipt: submissionReceipt,
        internalEntry,
        nationalFinal: nationalFinalRaw && stringOrNull(nationalFinalRaw.id)
          ? {
              id: stringOrNull(nationalFinalRaw.id)!,
              name: stringOrNull(nationalFinalRaw.nf_name),
              winnerEntryId: stringOrNull(nationalFinalRaw.winning_entry_id),
              entries: nationalFinalEntries,
            }
          : null,
      }
    : null;
  const lifecycle = deriveV3EntryLifecycle(confirmation);

  let versionHistory: V3EntryVersionEvidence[] = [];
  let historyTarget: { targetType: "internal" | "national_final"; entryId: string } | null = null;
  if (internalEntry?.id) {
    historyTarget = { targetType: "internal", entryId: internalEntry.id };
  } else if (nationalFinalEntries.length) {
    const affectedId = lifecycle.affectedCandidateIds.find((id) =>
      nationalFinalEntries.some((entry) => entry.id === id),
    );
    const winnerId = stringOrNull(nationalFinalRaw?.winning_entry_id);
    const entryId = affectedId ?? winnerId ?? nationalFinalEntries[0]?.id ?? null;
    if (entryId) historyTarget = { targetType: "national_final", entryId };
  }

  if (historyTarget) {
    const historyResult = await client.rpc("v3_confirmation_entry_versions", {
      p_target_type: historyTarget.targetType,
      p_entry_id: historyTarget.entryId,
      p_before_revision: null,
    });
    throwIfError(historyResult.error, "Could not load immutable Entry version history");
    versionHistory = mapVersionHistory(historyResult.data);
  }

  const readinessChecks = workspace.eligibility.checks.map((check) => ({
    id: check.id,
    label: check.label,
    level: check.level,
    message: check.message,
  }));

  const projection: V3EntryProjection = {
    state: "ready",
    edition: { id: edition.id, label: editionLabel(edition) },
    delegation: { id: countryId, name: countryName, code: countryCode.toUpperCase() },
    confirmation,
    lifecycle,
    readiness: {
      score: workspace.model.readiness,
      state: workspace.model.readinessState,
      eligibilityStatus: workspace.eligibility.status,
      checks: readinessChecks,
      actions: workspace.model.actions.map((action) => ({ ...action })),
    },
    versionHistory,
  };

  return {
    projection,
    shell: {
      editionLabel: editionLabel(edition),
      phaseLabel: "Entry",
    },
    generatedAt: new Date().toISOString(),
  };
}