import { createHash } from "node:crypto";

import { createServerFn } from "@tanstack/react-start";

import { requireSolarisOrganizerServer } from "@/integrations/supabase/organizer.server";

type ConfirmationReviewEntry = {
  id?: string | null;
  artist?: string | null;
  song_title?: string | null;
  song_url?: string | null;
  review_status?: string | null;
  removed?: boolean | null;
};

type ConfirmationSnapshot = {
  id: string;
  country: string;
  participating: boolean;
  updated_at?: string | null;
  selection_method?: string | null;
  reveal_date_type?: string | null;
  reveal_exact_date?: string | null;
  reveal_approximate_text?: string | null;
  nf_result_date_type?: string | null;
  nf_result_exact_date?: string | null;
  nf_result_approximate_text?: string | null;
  edition?: {
    id?: string | null;
    name?: string | null;
    edition_number?: number | null;
  } | null;
  internal_entry?: ConfirmationReviewEntry | null;
  national_final?: {
    id?: string | null;
    nf_name?: string | null;
    winning_entry_id?: string | null;
    entries?: ConfirmationReviewEntry[] | null;
  } | null;
};

type PublicationDecision = {
  status: "draft" | "scheduled" | "published";
  scheduledAt: string | null;
  publishedAt: string | null;
};

type CanonicalEntrySyncResult = {
  ok?: boolean;
  status?: string;
  editionId?: string;
  countryId?: string;
  entryId?: string;
  officialEntryKnown?: boolean;
  sourceRef?: string | null;
  artist?: string | null;
  songTitle?: string | null;
};

export type ConfirmationSolarisSyncResult = {
  ok: boolean;
  status:
    | "synced"
    | "unmatched_country"
    | "unmatched_edition"
    | "canonical_newer"
    | "canonical_owned"
    | "publication_event_failed";
  editionId?: string;
  countryId?: string;
  participantId?: string;
  entryId?: string;
  officialEntryKnown?: boolean;
  message?: string;
};

function cleanText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function dateOnlyAtUtcMidnight(value: unknown) {
  const text = cleanText(value);
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const timestamp = `${text}T00:00:00.000Z`;
  return Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}

export function deriveConfirmationEntryPublication(
  snapshot: Pick<
    ConfirmationSnapshot,
    | "selection_method"
    | "reveal_date_type"
    | "reveal_exact_date"
    | "nf_result_date_type"
    | "nf_result_exact_date"
  >,
  nowMs = Date.now(),
): PublicationDecision {
  const revealType = cleanText(snapshot.reveal_date_type)?.toLowerCase();

  if (revealType === "immediately" || revealType === "immediate") {
    return {
      status: "published",
      scheduledAt: null,
      publishedAt: new Date(nowMs).toISOString(),
    };
  }

  if (revealType === "exact") {
    const revealAt = dateOnlyAtUtcMidnight(snapshot.reveal_exact_date);
    if (revealAt) {
      if (Date.parse(revealAt) <= nowMs) {
        return {
          status: "published",
          scheduledAt: null,
          publishedAt: new Date(nowMs).toISOString(),
        };
      }
      return { status: "scheduled", scheduledAt: revealAt, publishedAt: null };
    }
  }

  if (
    snapshot.selection_method === "national_final" &&
    cleanText(snapshot.nf_result_date_type)?.toLowerCase() === "exact"
  ) {
    const resultAt = dateOnlyAtUtcMidnight(snapshot.nf_result_exact_date);
    if (resultAt) {
      if (Date.parse(resultAt) <= nowMs) {
        return {
          status: "published",
          scheduledAt: null,
          publishedAt: new Date(nowMs).toISOString(),
        };
      }
      return { status: "scheduled", scheduledAt: resultAt, publishedAt: null };
    }
  }

  return { status: "draft", scheduledAt: null, publishedAt: null };
}

function assertSnapshot(value: unknown): ConfirmationSnapshot {
  if (!value || typeof value !== "object") throw new Error("Missing confirmation snapshot");
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) throw new Error("Confirmation snapshot is missing an id");
  if (typeof row.country !== "string" || !row.country.trim()) throw new Error("Confirmation snapshot is missing a country");
  return value as ConfirmationSnapshot;
}

function parseCanonicalEntrySyncResult(value: unknown): CanonicalEntrySyncResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Canonical Entry sync returned an invalid response.");
  }
  return value as CanonicalEntrySyncResult;
}

async function recordSyncEvent(
  db: any,
  payload: ConfirmationSnapshot,
  result: ConfirmationSolarisSyncResult,
  error?: string,
) {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");

  const row = {
    service: "confirmations",
    event_type: "confirmation.snapshot.synced",
    entity_type: "participant",
    entity_id: result.participantId ?? null,
    remote_id: payload.id,
    payload,
    payload_hash: payloadHash,
    status: error ? "failed" : "completed",
    attempts: 1,
    last_error: error ?? null,
    updated_at: new Date().toISOString(),
    completed_at: error ? null : new Date().toISOString(),
  };

  const { error: eventError } = await db
    .from("integration_events")
    .upsert(row, { onConflict: "service,event_type,payload_hash" });

  if (eventError) console.error("[Confirmations sync] Could not record event", eventError);
}

async function upsertLink(
  db: any,
  data: {
    entityType: string;
    solarisId: string;
    remoteId: string;
    editionId: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db
    .from("integration_links")
    .delete()
    .eq("service", "confirmations")
    .eq("entity_type", data.entityType)
    .eq("solaris_id", data.solarisId)
    .neq("remote_id", data.remoteId);

  const { error } = await db.from("integration_links").upsert(
    {
      service: "confirmations",
      entity_type: data.entityType,
      solaris_id: data.solarisId,
      remote_id: data.remoteId,
      edition_id: data.editionId,
      sync_status: "linked",
      metadata: data.metadata ?? {},
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "service,entity_type,remote_id" },
  );

  if (error) throw new Error(error.message);
}

async function loadConfirmationSnapshotForSolarisSync(
  db: any,
  submissionId: string,
): Promise<ConfirmationSnapshot> {
  const submissionResult = await db
    .from("submissions")
    .select(
      "id,edition_id,country,participating,updated_at,selection_method,reveal_date_type,reveal_exact_date,reveal_approximate_text,nf_result_date_type,nf_result_exact_date,nf_result_approximate_text",
    )
    .eq("id", submissionId)
    .maybeSingle();
  if (submissionResult.error) throw new Error(submissionResult.error.message);
  if (!submissionResult.data) throw new Error("Confirmation submission not found.");

  const submission = submissionResult.data;
  const [editionResult, internalResult, nationalFinalResult] = await Promise.all([
    db
      .from("editions")
      .select("id,name,edition_number")
      .eq("id", submission.edition_id)
      .maybeSingle(),
    db
      .from("internal_entries")
      .select("id,artist,song_title,song_url,review_status")
      .eq("submission_id", submissionId)
      .maybeSingle(),
    db
      .from("national_finals")
      .select("id,nf_name,winning_entry_id")
      .eq("submission_id", submissionId)
      .maybeSingle(),
  ]);

  if (editionResult.error) throw new Error(editionResult.error.message);
  if (internalResult.error) throw new Error(internalResult.error.message);
  if (nationalFinalResult.error) throw new Error(nationalFinalResult.error.message);

  let nationalFinal: ConfirmationSnapshot["national_final"] = null;
  if (nationalFinalResult.data) {
    const entriesResult = await db
      .from("national_final_entries")
      .select("id,artist,song_title,song_url,review_status,removed")
      .eq("national_final_id", nationalFinalResult.data.id)
      .order("position", { ascending: true });
    if (entriesResult.error) throw new Error(entriesResult.error.message);
    nationalFinal = {
      id: nationalFinalResult.data.id,
      nf_name: nationalFinalResult.data.nf_name,
      winning_entry_id: nationalFinalResult.data.winning_entry_id,
      entries: entriesResult.data ?? [],
    };
  }

  return assertSnapshot({
    id: submission.id,
    country: submission.country,
    participating: submission.participating,
    updated_at: submission.updated_at,
    selection_method: submission.selection_method,
    reveal_date_type: submission.reveal_date_type,
    reveal_exact_date: submission.reveal_exact_date,
    reveal_approximate_text: submission.reveal_approximate_text,
    nf_result_date_type: submission.nf_result_date_type,
    nf_result_exact_date: submission.nf_result_exact_date,
    nf_result_approximate_text: submission.nf_result_approximate_text,
    edition: editionResult.data,
    internal_entry: internalResult.data,
    national_final: nationalFinal,
  });
}

async function syncConfirmationSnapshotToSolarisInternal(
  snapshot: ConfirmationSnapshot,
): Promise<ConfirmationSolarisSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const confirmationPublication = deriveConfirmationEntryPublication(snapshot);

  const editionNumber = Number(snapshot.edition?.edition_number);
  if (!Number.isInteger(editionNumber)) {
    const result: ConfirmationSolarisSyncResult = {
      ok: false,
      status: "unmatched_edition",
      message: "The confirmation is not attached to a numbered Solaris edition.",
    };
    await recordSyncEvent(db, snapshot, result, result.message);
    return result;
  }

  const { data: edition, error: editionError } = await db
    .from("editions")
    .select("id,name,edition_number")
    .eq("edition_number", editionNumber)
    .maybeSingle();
  if (editionError) throw new Error(editionError.message);
  if (!edition) {
    const result: ConfirmationSolarisSyncResult = {
      ok: false,
      status: "unmatched_edition",
      message: `SSC${editionNumber} does not exist in Solaris Studio.`,
    };
    await recordSyncEvent(db, snapshot, result, result.message);
    return result;
  }

  const { data: countries, error: countriesError } = await db
    .from("countries")
    .select("id,name,short_code,flag_image,region")
    .order("name");
  if (countriesError) throw new Error(countriesError.message);

  const wantedCountry = normalizeName(snapshot.country);
  const country = (countries ?? []).find(
    (candidate: any) => normalizeName(String(candidate.name ?? "")) === wantedCountry,
  );

  if (!country) {
    const result: ConfirmationSolarisSyncResult = {
      ok: false,
      status: "unmatched_country",
      editionId: edition.id,
      message: `No Solaris country matches “${snapshot.country}”.`,
    };
    await recordSyncEvent(db, snapshot, result, result.message);
    return result;
  }

  const entityLookup = await db
    .from("contest_entities")
    .select("id")
    .eq("edition_id", edition.id)
    .eq("country_id", country.id)
    .maybeSingle();
  if (entityLookup.error) throw new Error(entityLookup.error.message);
  let entity = entityLookup.data;

  if (!entity) {
    const inserted = await db
      .from("contest_entities")
      .insert({
        edition_id: edition.id,
        entity_type: "global",
        country_id: country.id,
        display_name: country.name,
        abbreviation: country.short_code,
        flag_image: country.flag_image,
        region: country.region,
      })
      .select("id")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    entity = inserted.data;
  }

  // Entry owns canonical artist/song/lifecycle truth. Resolve that authority
  // before mutating participant compatibility state so a stale Confirmation
  // cannot partially change Solaris and only then discover a canonical conflict.
  const entrySyncRpc = await db.rpc("v3_sync_confirmation_entry", {
    p_submission_id: snapshot.id,
  });
  if (entrySyncRpc.error) throw new Error(entrySyncRpc.error.message);
  const entrySync = parseCanonicalEntrySyncResult(entrySyncRpc.data);

  if (entrySync.ok !== true) {
    const status = entrySync.status;
    if (status === "canonical_owned" || status === "canonical_newer" || status === "unmatched_country") {
      const result: ConfirmationSolarisSyncResult = {
        ok: false,
        status,
        editionId: entrySync.editionId ?? edition.id,
        countryId: entrySync.countryId ?? country.id,
        entryId: entrySync.entryId,
        message:
          status === "canonical_owned"
            ? "Solaris already owns this canonical entry outside Confirmations. Automatic reconciliation was stopped instead of overwriting it."
            : status === "canonical_newer"
              ? "Solaris has a newer final participation state than this Confirmation response. Automatic reconciliation was stopped to avoid reversing a later organizer decision."
              : `No Solaris country matches “${snapshot.country}”.`,
      };
      await recordSyncEvent(db, snapshot, result, result.message);
      return result;
    }
    throw new Error(`Canonical Entry sync failed with status ${String(status ?? "unknown")}.`);
  }

  if (!entrySync.entryId) throw new Error("Canonical Entry sync did not return an Entry id.");

  const participationStatus = snapshot.participating ? "confirmed" : "withdrawn";
  const participantLookup = await db
    .from("participants")
    .select("id,publication_status,scheduled_publish_at,published_at,publication_source,publication_overridden")
    .eq("edition_id", edition.id)
    .eq("country_id", country.id)
    .is("show_id", null)
    .maybeSingle();
  if (participantLookup.error) throw new Error(participantLookup.error.message);
  let participant = participantLookup.data;

  const confirmationPublicationFields = {
    publication_status: confirmationPublication.status,
    scheduled_publish_at: confirmationPublication.scheduledAt,
    published_at:
      confirmationPublication.status === "published"
        ? participant?.published_at ?? confirmationPublication.publishedAt
        : null,
    publication_source: "confirmation",
    publication_overridden: false,
  };

  if (!participant) {
    const inserted = await db
      .from("participants")
      .insert({
        edition_id: edition.id,
        country_id: country.id,
        contest_entity_id: entity.id,
        show_id: null,
        semi_final: "final",
        participation_status: participationStatus,
        notes: "Synced from Confirmations",
        ...confirmationPublicationFields,
      })
      .select("id,publication_status,scheduled_publish_at,published_at,publication_source,publication_overridden")
      .single();
    if (inserted.error) throw new Error(inserted.error.message);
    participant = inserted.data;
  } else {
    const payload: Record<string, unknown> = {
      contest_entity_id: entity.id,
      participation_status: participationStatus,
    };
    if (!participant.publication_overridden) Object.assign(payload, confirmationPublicationFields);

    const { error } = await db
      .from("participants")
      .update(payload)
      .eq("id", participant.id);
    if (error) throw new Error(error.message);
  }

  const statusPayload: Record<string, unknown> = { participation_status: participationStatus };
  if (!participant.publication_overridden) Object.assign(statusPayload, confirmationPublicationFields);

  let statusQuery = db
    .from("participants")
    .update(statusPayload)
    .eq("edition_id", edition.id)
    .eq("country_id", country.id);
  if (!participant.publication_overridden) statusQuery = statusQuery.eq("publication_overridden", false);
  const { error: statusError } = await statusQuery;
  if (statusError) throw new Error(statusError.message);

  const { error: compatibilityError } = await db
    .from("participants")
    .update({
      artist: entrySync.officialEntryKnown ? cleanText(entrySync.artist) : null,
      song: entrySync.officialEntryKnown ? cleanText(entrySync.songTitle) : null,
    })
    .eq("edition_id", edition.id)
    .eq("country_id", country.id);
  if (compatibilityError) throw new Error(compatibilityError.message);

  if (
    entrySync.officialEntryKnown === true &&
    !participant.publication_overridden &&
    confirmationPublication.status === "published"
  ) {
    const { error: publicationEventError } = await db.rpc("emit_entry_published_event", {
      _edition_id: edition.id,
      _country_id: country.id,
    });
    if (publicationEventError) {
      const message = `Confirmation sync could not emit the canonical entry publication event: ${publicationEventError.message ?? "unknown database error"}`;
      const failedResult: ConfirmationSolarisSyncResult = {
        ok: false,
        status: "publication_event_failed",
        editionId: edition.id,
        countryId: country.id,
        participantId: participant.id,
        entryId: entrySync.entryId,
        officialEntryKnown: true,
        message,
      };
      await recordSyncEvent(db, snapshot, failedResult, message);
      return failedResult;
    }
  }

  await upsertLink(db, {
    entityType: "edition",
    solarisId: edition.id,
    remoteId: String(snapshot.edition?.id ?? `ssc-${editionNumber}`),
    editionId: edition.id,
    metadata: { edition_number: editionNumber },
  });
  await upsertLink(db, {
    entityType: "submission",
    solarisId: participant.id,
    remoteId: snapshot.id,
    editionId: edition.id,
    metadata: { country_id: country.id, country: country.name },
  });
  if (entrySync.officialEntryKnown === true && entrySync.sourceRef) {
    await upsertLink(db, {
      entityType: "entry",
      solarisId: entrySync.entryId,
      remoteId: entrySync.sourceRef,
      editionId: edition.id,
      metadata: { country_id: country.id, country: country.name },
    });
  }

  const result: ConfirmationSolarisSyncResult = {
    ok: true,
    status: "synced",
    editionId: edition.id,
    countryId: country.id,
    participantId: participant.id,
    entryId: entrySync.entryId,
    officialEntryKnown: entrySync.officialEntryKnown === true,
  };
  await recordSyncEvent(db, snapshot, result);

  try {
    const { autoSyncDraftTelevotingRoundsForEditionServer } = await import(
      "@/integrations/televoting/auto-sync.server"
    );
    const autoSync = await autoSyncDraftTelevotingRoundsForEditionServer(edition.id);
    if (autoSync.failed.length) {
      console.error("[Confirmations sync] Some Televoting draft rounds could not refresh", autoSync.failed);
    }
  } catch (caught) {
    console.error("[Confirmations sync] Televoting auto-sync unavailable", caught);
  }

  return result;
}

export async function syncConfirmationSubmissionToSolarisInternal(
  submissionId: string,
): Promise<ConfirmationSolarisSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const snapshot = await loadConfirmationSnapshotForSolarisSync(db, submissionId);
  return syncConfirmationSnapshotToSolarisInternal(snapshot);
}

export const syncConfirmationSnapshotToSolaris = createServerFn({ method: "POST" })
  .inputValidator((data: { snapshot: unknown }) => ({
    snapshot: assertSnapshot(data?.snapshot),
  }))
  .handler(async ({ data }) => {
    await requireSolarisOrganizerServer();
    return syncConfirmationSnapshotToSolarisInternal(data.snapshot);
  });
