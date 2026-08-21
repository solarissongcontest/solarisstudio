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

export type ConfirmationSolarisSyncResult = {
  ok: boolean;
  status: "synced" | "unmatched_country" | "unmatched_edition";
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

  // For a National Final, an exact published result date is also a safe reveal
  // boundary for the winning song when no stronger explicit song-reveal rule exists.
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

  // Approximate/unknown dates are intentionally not guessed. The HOD can
  // publish manually when the announcement actually happens.
  return { status: "draft", scheduledAt: null, publishedAt: null };
}

function assertSnapshot(value: unknown): ConfirmationSnapshot {
  if (!value || typeof value !== "object") throw new Error("Missing confirmation snapshot");
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id) throw new Error("Confirmation snapshot is missing an id");
  if (typeof row.country !== "string" || !row.country.trim()) throw new Error("Confirmation snapshot is missing a country");
  return value as ConfirmationSnapshot;
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

export const syncConfirmationSnapshotToSolaris = createServerFn({ method: "POST" })
  .inputValidator((data: { snapshot: unknown }) => ({ snapshot: assertSnapshot(data?.snapshot) }))
  .handler(async ({ data }) => {
    await requireSolarisOrganizerServer();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const snapshot = data.snapshot;
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
    const publicationWasPublic = participant?.publication_status === "published";

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

    let officialEntry: ConfirmationReviewEntry | null = null;
    if (
      snapshot.selection_method === "internal" &&
      snapshot.internal_entry?.review_status === "accepted" &&
      cleanText(snapshot.internal_entry.artist) &&
      cleanText(snapshot.internal_entry.song_title)
    ) {
      officialEntry = snapshot.internal_entry;
    }

    if (snapshot.selection_method === "national_final" && snapshot.national_final?.winning_entry_id) {
      const winner = (snapshot.national_final.entries ?? []).find(
        (entry) => entry.id === snapshot.national_final?.winning_entry_id,
      );
      if (
        winner &&
        winner.review_status === "accepted" &&
        !winner.removed &&
        cleanText(winner.artist) &&
        cleanText(winner.song_title)
      ) {
        officialEntry = winner;
      }
    }

    const { data: existingEntry, error: existingEntryError } = await db
      .from("entries")
      .select("id,source,source_ref,artist,song_title,status")
      .eq("edition_id", edition.id)
      .eq("country_id", country.id)
      .maybeSingle();
    if (existingEntryError) throw new Error(existingEntryError.message);

    let canonicalEntry = existingEntry;
    if (officialEntry) {
      const entryPayload = {
        edition_id: edition.id,
        country_id: country.id,
        contest_entity_id: entity.id,
        artist: cleanText(officialEntry.artist),
        song_title: cleanText(officialEntry.song_title),
        song_url: cleanText(officialEntry.song_url),
        status: snapshot.participating ? "confirmed" : "withdrawn",
        selection_method: cleanText(snapshot.selection_method),
        source: "confirmations",
        source_ref: officialEntry.id ?? snapshot.id,
        metadata: {
          confirmation_submission_id: snapshot.id,
          confirmation_edition_id: snapshot.edition?.id ?? null,
          national_final_id: snapshot.national_final?.id ?? null,
          national_final_name: snapshot.national_final?.nf_name ?? null,
          reveal_date_type: snapshot.reveal_date_type ?? null,
          reveal_exact_date: snapshot.reveal_exact_date ?? null,
          nf_result_date_type: snapshot.nf_result_date_type ?? null,
          nf_result_exact_date: snapshot.nf_result_exact_date ?? null,
        },
        updated_at: new Date().toISOString(),
      };

      const upserted = await db
        .from("entries")
        .upsert(entryPayload, { onConflict: "edition_id,country_id" })
        .select("id")
        .single();
      if (upserted.error) throw new Error(upserted.error.message);
      canonicalEntry = upserted.data;

      const { error: compatibilityError } = await db
        .from("participants")
        .update({
          artist: entryPayload.artist,
          song: entryPayload.song_title,
        })
        .eq("edition_id", edition.id)
        .eq("country_id", country.id);
      if (compatibilityError) throw new Error(compatibilityError.message);

      if (
        !participant.publication_overridden &&
        confirmationPublication.status === "published" &&
        !publicationWasPublic
      ) {
        await db.rpc("emit_entry_published_event", {
          _edition_id: edition.id,
          _country_id: country.id,
        });
      }
    } else if (!existingEntry || existingEntry.source === "confirmations") {
      const pendingPayload = {
        edition_id: edition.id,
        country_id: country.id,
        contest_entity_id: entity.id,
        artist: null,
        song_title: null,
        song_url: null,
        status: snapshot.participating ? "pending" : "withdrawn",
        selection_method: cleanText(snapshot.selection_method),
        source: "confirmations",
        source_ref: snapshot.id,
        metadata: {
          confirmation_submission_id: snapshot.id,
          confirmation_edition_id: snapshot.edition?.id ?? null,
          awaiting_official_entry: true,
          reveal_date_type: snapshot.reveal_date_type ?? null,
          reveal_exact_date: snapshot.reveal_exact_date ?? null,
          nf_result_date_type: snapshot.nf_result_date_type ?? null,
          nf_result_exact_date: snapshot.nf_result_exact_date ?? null,
        },
        updated_at: new Date().toISOString(),
      };
      const upserted = await db
        .from("entries")
        .upsert(pendingPayload, { onConflict: "edition_id,country_id" })
        .select("id")
        .single();
      if (upserted.error) throw new Error(upserted.error.message);
      canonicalEntry = upserted.data;

      if (existingEntry?.source === "confirmations") {
        const { error: compatibilityError } = await db
          .from("participants")
          .update({ artist: null, song: null })
          .eq("edition_id", edition.id)
          .eq("country_id", country.id);
        if (compatibilityError) throw new Error(compatibilityError.message);
      }
    }

    if (!canonicalEntry) throw new Error("Could not resolve canonical entry");

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
    if (officialEntry?.id) {
      await upsertLink(db, {
        entityType: "entry",
        solarisId: canonicalEntry.id,
        remoteId: officialEntry.id,
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
      entryId: canonicalEntry.id,
      officialEntryKnown: Boolean(officialEntry),
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
  });