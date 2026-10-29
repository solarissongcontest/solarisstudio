import { createHash } from "node:crypto";
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
    .select("id,status,calculation_version,updated_at")
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

  // Bind retry identity to the reviewed input, including the prior canonical
  // revision. A fresh state creates a new operation; a lost response can safely
  // retry the exact same request without duplicating participant/event writes.
  const fingerprint = createHash("sha256").update(JSON.stringify([
    aggregationId, aggregation.updated_at, currentCodes,
  ])).digest("hex");
  const operationId = `${fingerprint.slice(0, 8)}-${fingerprint.slice(8, 12)}-4${fingerprint.slice(13, 16)}-8${fingerprint.slice(17, 20)}-${fingerprint.slice(20, 32)}`;
  const { data: result, error } = await (televotingAdmin as any).rpc("v3_reconcile_combined_lineup", {
    p_aggregation_id: aggregationId,
    p_expected_updated_at: aggregation.updated_at,
    p_expected_participants: currentCodes,
    p_operation_id: operationId,
    p_idempotency_key: `combined-lineup:${fingerprint}`,
  });
  if (error) throw new Error(error.message);
  return result as CombinedCanonicalSyncOutcome;
}
