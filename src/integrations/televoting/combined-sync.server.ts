import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type CombinedCanonicalSyncOutcome = {
  aggregationId: string;
  status:
    | "synced"
    | "up_to_date"
    | "immutable"
    | "custom"
    | "ambiguous_source";
  editionId?: string;
  showId?: string;
  participantCount?: number;
  message?: string;
};

type RoundBinding = {
  remote_round_id: string;
  edition_id: string;
  show_id: string | null;
};

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

async function recordCombinedSyncEvent(
  db: any,
  outcome: CombinedCanonicalSyncOutcome,
  previous: string[],
  next: string[],
) {
  if (outcome.status !== "synced") return;
  const now = new Date().toISOString();
  const { error } = await db.from("integration_events").insert({
    service: "televoting",
    event_type: "combined.participants.autosynced",
    entity_type: "show",
    entity_id: outcome.showId ?? null,
    remote_id: outcome.aggregationId,
    payload: {
      edition_id: outcome.editionId ?? null,
      previous,
      participants: next,
    },
    status: "completed",
    attempts: 1,
    last_error: null,
    completed_at: now,
    updated_at: now,
  });
  if (error) console.error("[Combined canonical sync] Could not record integration event", error);
}

/**
 * A Combined Televote made entirely from Solaris-bound voting rounds is a
 * projection of that Solaris show, not an independent participant list.
 *
 * Draft/calculated aggregations are kept aligned automatically. Locked and
 * published aggregations remain immutable, and genuinely custom aggregations
 * (manual/external sources or source rounds that do not resolve to one show)
 * keep their existing manual participant workflow.
 */
export async function syncEditableCombinedParticipantsFromSolarisServer(
  aggregationId: string,
): Promise<CombinedCanonicalSyncOutcome> {
  await requireMergedTelevotingAdminServer();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: aggregation, error: aggregationError } = await televotingAdmin
    .from("televote_aggregations")
    .select("id,status,calculation_version")
    .eq("id", aggregationId)
    .maybeSingle();
  if (aggregationError) throw new Error(aggregationError.message);
  if (!aggregation) throw new Error("Combined Televote not found");

  if (aggregation.status === "locked" || aggregation.status === "published") {
    return {
      aggregationId,
      status: "immutable",
      message: `Combined result is ${aggregation.status}; its participant snapshot is frozen.`,
    };
  }

  const { data: sources, error: sourceError } = await televotingAdmin
    .from("televote_aggregation_sources")
    .select("source_round_id,enabled")
    .eq("aggregation_id", aggregationId)
    .eq("enabled", true);
  if (sourceError) throw new Error(sourceError.message);

  const enabledSources = sources ?? [];
  const sourceRoundIds: string[] = [...new Set(
    enabledSources
      .map((source) => source.source_round_id)
      .filter((id): id is string => Boolean(id))
      .map(String),
  )];

  // If any enabled source is external/manual, the aggregation is intentionally
  // custom and Solaris must not seize ownership of its participant list.
  if (!enabledSources.length || sourceRoundIds.length !== enabledSources.length) {
    return {
      aggregationId,
      status: "custom",
      message: "Combined Televote includes manual/external sources; participant management stays local.",
    };
  }

  const { data: bindings, error: bindingError } = await db
    .from("televoting_round_bindings")
    .select("remote_round_id,edition_id,show_id")
    .in("remote_round_id", sourceRoundIds);
  if (bindingError) throw new Error(bindingError.message);

  const bindingByRound = new Map<string, RoundBinding>(
    (bindings ?? []).map((binding: any) => [
      String(binding.remote_round_id),
      {
        remote_round_id: String(binding.remote_round_id),
        edition_id: String(binding.edition_id),
        show_id: binding.show_id == null ? null : String(binding.show_id),
      },
    ]),
  );
  if (sourceRoundIds.some((roundId) => !bindingByRound.get(roundId)?.show_id)) {
    return {
      aggregationId,
      status: "ambiguous_source",
      message: "Every enabled source round must be bound to a Solaris show before Combined participants can sync automatically.",
    };
  }

  const targets = [...new Set(sourceRoundIds.map((roundId) => {
    const binding = bindingByRound.get(roundId)!;
    return `${binding.edition_id}:${binding.show_id}`;
  }))];
  if (targets.length !== 1) {
    return {
      aggregationId,
      status: "ambiguous_source",
      message: "Enabled source rounds point to different Solaris shows, so Combined participants cannot be inferred safely.",
    };
  }

  const target = bindingByRound.get(sourceRoundIds[0])!;
  const editionId = target.edition_id;
  const showId = target.show_id!;

  const { data: participants, error: participantError } = await db
    .from("participants")
    .select("country_id,running_order,participation_status")
    .eq("show_id", showId)
    .order("running_order", { ascending: true, nullsFirst: false });
  if (participantError) throw new Error(participantError.message);

  const active = (participants ?? []).filter(
    (participant: any) =>
      participant.country_id &&
      (!participant.participation_status || participant.participation_status === "confirmed"),
  );
  const countryIds = [...new Set(active.map((participant: any) => participant.country_id))];
  const { data: countries, error: countryError } = countryIds.length
    ? await db.from("countries").select("id,short_code").in("id", countryIds)
    : { data: [], error: null };
  if (countryError) throw new Error(countryError.message);
  const codeByCountry = new Map<string, string>(
    (countries ?? []).map((country: any) => [
      String(country.id),
      String(country.short_code ?? "").trim().toUpperCase(),
    ]),
  );
  const canonicalCodes: string[] = active
    .map((participant: any) => codeByCountry.get(String(participant.country_id)) ?? "")
    .filter((code: string) => Boolean(code));

  if (canonicalCodes.length !== active.length) {
    return {
      aggregationId,
      status: "ambiguous_source",
      editionId,
      showId,
      message: "One or more Solaris show participants have no canonical country code.",
    };
  }

  const { data: currentRows, error: currentError } = await televotingAdmin
    .from("televote_aggregation_participants")
    .select("country_code,display_order")
    .eq("aggregation_id", aggregationId)
    .order("display_order");
  if (currentError) throw new Error(currentError.message);
  const currentCodes: string[] = (currentRows ?? []).map((row) => String(row.country_code));

  if (sameList(currentCodes, canonicalCodes)) {
    return {
      aggregationId,
      status: "up_to_date",
      editionId,
      showId,
      participantCount: canonicalCodes.length,
    };
  }

  const { error: deleteError } = await televotingAdmin
    .from("televote_aggregation_participants")
    .delete()
    .eq("aggregation_id", aggregationId);
  if (deleteError) throw new Error(deleteError.message);

  if (canonicalCodes.length) {
    const { error: insertError } = await televotingAdmin
      .from("televote_aggregation_participants")
      .insert(
        canonicalCodes.map((countryCode: string, displayOrder: number) => ({
          aggregation_id: aggregationId,
          country_code: countryCode,
          display_order: displayOrder,
        })),
      );
    if (insertError) throw new Error(insertError.message);
  }

  const { error: aggregationUpdateError } = await televotingAdmin
    .from("televote_aggregations")
    .update({ results_outdated: Number(aggregation.calculation_version ?? 0) > 0 })
    .eq("id", aggregationId);
  if (aggregationUpdateError) throw new Error(aggregationUpdateError.message);

  const outcome: CombinedCanonicalSyncOutcome = {
    aggregationId,
    status: "synced",
    editionId,
    showId,
    participantCount: canonicalCodes.length,
    message: `${canonicalCodes.length} Combined participants refreshed from the Solaris show.`,
  };
  await recordCombinedSyncEvent(db, outcome, currentCodes, canonicalCodes);
  return outcome;
}