import { createHash } from "node:crypto";

import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";

export type SolarisResultSyncOutcome = {
  ok: boolean;
  status:
    | "synced"
    | "waiting_for_combined"
    | "unbound_show"
    | "source_not_published"
    | "lineup_mismatch";
  sourceType: "round" | "combined";
  sourceId: string;
  editionId?: string;
  showId?: string;
  imported?: number;
  message?: string;
};

type ImportRow = {
  countryCode: string;
  points: number;
};

type ResultState = {
  id?: string;
  countryId: string;
  contestEntityId: string | null;
  runningOrder: number | null;
  juryPoints: number;
  televotePoints: number;
  totalPoints: number;
  oldRank: number | null;
};

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : String(value ?? "Unknown error");
}

function normaliseCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

async function recordResultSyncEvent(
  db: any,
  outcome: SolarisResultSyncOutcome,
  payload: Record<string, unknown>,
  error?: string,
) {
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ outcome, payload }))
    .digest("hex");
  const now = new Date().toISOString();
  const { error: eventError } = await db.from("integration_events").upsert(
    {
      service: "televoting",
      event_type: outcome.sourceType === "combined" ? "combined.results.imported" : "round.results.imported",
      entity_type: "show",
      entity_id: outcome.showId ?? null,
      remote_id: outcome.sourceId,
      payload: { ...payload, outcome },
      payload_hash: payloadHash,
      status: error ? "failed" : outcome.ok ? "completed" : "skipped",
      attempts: 1,
      last_error: error ?? null,
      completed_at: outcome.ok ? now : null,
      updated_at: now,
    },
    { onConflict: "service,event_type,payload_hash" },
  );
  if (eventError) console.error("[Televoting result sync] Could not record integration event", eventError);
}

function compareResultStates(
  a: ResultState,
  b: ResultState,
  tieBreak: string[],
  juryPointCounts: Map<string, Map<number, number>>,
  juryScale: number[],
) {
  if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;

  for (const rawRule of tieBreak) {
    const rule = String(rawRule).toLowerCase();
    if (rule === "jury" && b.juryPoints !== a.juryPoints) return b.juryPoints - a.juryPoints;
    if (rule === "televote" && b.televotePoints !== a.televotePoints) return b.televotePoints - a.televotePoints;
    if (rule === "twelves") {
      const maxScore = juryScale[0] ?? 12;
      const aCount = juryPointCounts.get(a.countryId)?.get(maxScore) ?? 0;
      const bCount = juryPointCounts.get(b.countryId)?.get(maxScore) ?? 0;
      if (bCount !== aCount) return bCount - aCount;
    }
    if (rule === "countback") {
      for (const score of juryScale) {
        const aCount = juryPointCounts.get(a.countryId)?.get(score) ?? 0;
        const bCount = juryPointCounts.get(b.countryId)?.get(score) ?? 0;
        if (bCount !== aCount) return bCount - aCount;
      }
    }
    if (rule === "runningorder") {
      const aOrder = a.runningOrder ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.runningOrder ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }
  }

  // Preserve an already-established official order when the configured rules
  // still cannot split the tie. This keeps historical/manual tie decisions
  // stable while new shows fall back to running order and then identity.
  const aOld = a.oldRank ?? Number.MAX_SAFE_INTEGER;
  const bOld = b.oldRank ?? Number.MAX_SAFE_INTEGER;
  if (aOld !== bOld) return aOld - bOld;
  const aOrder = a.runningOrder ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.runningOrder ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.countryId.localeCompare(b.countryId);
}

async function writeCanonicalShowTelevote(data: {
  editionId: string;
  showId: string;
  sourceType: "round" | "combined";
  sourceId: string;
  rows: ImportRow[];
  freezeRoundIds?: string[];
}): Promise<SolarisResultSyncOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: show, error: showError } = await db
    .from("shows")
    .select("id,edition_id,name,voting_config")
    .eq("id", data.showId)
    .maybeSingle();
  if (showError) throw new Error(showError.message);
  if (!show || show.edition_id !== data.editionId) {
    const outcome: SolarisResultSyncOutcome = {
      ok: false,
      status: "unbound_show",
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      editionId: data.editionId,
      showId: data.showId,
      message: "The linked Solaris show no longer belongs to this edition.",
    };
    await recordResultSyncEvent(db, outcome, { row_count: data.rows.length }, outcome.message);
    return outcome;
  }

  const { data: participants, error: participantError } = await db
    .from("participants")
    .select("country_id,contest_entity_id,running_order,participation_status")
    .eq("show_id", data.showId);
  if (participantError) throw new Error(participantError.message);

  const activeParticipants = (participants ?? []).filter(
    (row: any) => !row.participation_status || row.participation_status === "confirmed",
  );
  const countryIds = [...new Set(activeParticipants.map((row: any) => row.country_id).filter(Boolean))];
  const { data: countries, error: countryError } = countryIds.length
    ? await db.from("countries").select("id,short_code,name").in("id", countryIds)
    : { data: [], error: null };
  if (countryError) throw new Error(countryError.message);

  const countryByCode = new Map<string, any>(
    (countries ?? []).map((country: any) => [normaliseCode(country.short_code), country]),
  );
  const participantByCountry = new Map<string, any>(
    activeParticipants.map((participant: any) => [participant.country_id, participant]),
  );

  const remoteCodes = data.rows.map((row) => normaliseCode(row.countryCode));
  const duplicateCodes = remoteCodes.filter((code, index) => remoteCodes.indexOf(code) !== index);
  const unmatchedRemote = remoteCodes.filter((code) => !countryByCode.has(code));
  const expectedCodes = (countries ?? []).map((country: any) => normaliseCode(country.short_code));
  const missingRemote = expectedCodes.filter((code: string) => !remoteCodes.includes(code));

  if (duplicateCodes.length || unmatchedRemote.length || missingRemote.length || data.rows.length !== activeParticipants.length) {
    const pieces = [
      duplicateCodes.length ? `duplicate codes: ${[...new Set(duplicateCodes)].join(", ")}` : null,
      unmatchedRemote.length ? `not in Solaris show: ${[...new Set(unmatchedRemote)].join(", ")}` : null,
      missingRemote.length ? `missing from Televoting result: ${missingRemote.join(", ")}` : null,
    ].filter(Boolean);
    const outcome: SolarisResultSyncOutcome = {
      ok: false,
      status: "lineup_mismatch",
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      editionId: data.editionId,
      showId: data.showId,
      message: `Published Televoting result does not exactly match the Solaris show${pieces.length ? ` (${pieces.join("; ")})` : ""}.`,
    };
    await recordResultSyncEvent(db, outcome, { remote_codes: remoteCodes, expected_codes: expectedCodes }, outcome.message);
    return outcome;
  }

  const { data: existing, error: existingError } = await db
    .from("results")
    .select("id,country_id,contest_entity_id,jury_points,televote_points,total_points,final_rank")
    .eq("show_id", data.showId);
  if (existingError) throw new Error(existingError.message);
  const existingByCountry = new Map((existing ?? []).map((row: any) => [row.country_id, row]));

  const incomingByCountry = new Map<string, number>();
  for (const row of data.rows) {
    const country = countryByCode.get(normaliseCode(row.countryCode));
    if (!country) continue;
    incomingByCountry.set(country.id, Math.trunc(Number(row.points) || 0));
  }

  const states: ResultState[] = activeParticipants.map((participant: any) => {
    const previous = existingByCountry.get(participant.country_id) as any;
    const juryPoints = Math.trunc(Number(previous?.jury_points ?? 0));
    const televotePoints = incomingByCountry.get(participant.country_id) ?? 0;
    return {
      id: previous?.id,
      countryId: participant.country_id,
      contestEntityId: participant.contest_entity_id ?? previous?.contest_entity_id ?? null,
      runningOrder: participant.running_order == null ? null : Number(participant.running_order),
      juryPoints,
      televotePoints,
      totalPoints: juryPoints + televotePoints,
      oldRank: previous?.final_rank == null ? null : Number(previous.final_rank),
    };
  });

  // Tie-break metadata already lives on the canonical show. Jury countback can
  // be reproduced locally; Televoting aggregate points remain the authority for
  // the televote component itself.
  const votingConfig = (show.voting_config ?? {}) as Record<string, unknown>;
  const tieBreak = Array.isArray(votingConfig.tieBreak)
    ? votingConfig.tieBreak.map(String)
    : ["televote", "jury", "runningOrder"];
  const juryScale = Array.isArray(votingConfig.juryPoints)
    ? [...new Set(votingConfig.juryPoints.map(Number).filter(Number.isFinite))].sort((a, b) => b - a)
    : [12, 10, 8, 7, 6, 5, 4, 3, 2, 1];

  const { data: juryVotes, error: juryError } = await db
    .from("jury_votes")
    .select("receiving_country_id,receiving_entity_id,points")
    .eq("show_id", data.showId);
  if (juryError) throw new Error(juryError.message);
  const juryPointCounts = new Map<string, Map<number, number>>();
  for (const vote of juryVotes ?? []) {
    const countryId = vote.receiving_country_id ?? vote.receiving_entity_id;
    if (!countryId) continue;
    const bucket = juryPointCounts.get(countryId) ?? new Map<number, number>();
    const score = Number(vote.points ?? 0);
    bucket.set(score, (bucket.get(score) ?? 0) + 1);
    juryPointCounts.set(countryId, bucket);
  }

  const ranked = [...states].sort((a, b) => compareResultStates(a, b, tieBreak, juryPointCounts, juryScale));
  const rankByCountry = new Map(ranked.map((state, index) => [state.countryId, index + 1]));

  for (const state of states) {
    const values = {
      edition_id: data.editionId,
      show_id: data.showId,
      country_id: state.countryId,
      contest_entity_id: state.contestEntityId,
      jury_points: state.juryPoints,
      televote_points: state.televotePoints,
      total_points: state.totalPoints,
      final_rank: rankByCountry.get(state.countryId) ?? null,
      updated_at: new Date().toISOString(),
    };
    if (state.id) {
      const { error } = await db.from("results").update(values).eq("id", state.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("results").insert(values);
      if (error) throw new Error(error.message);
    }
  }

  const freezeIds = [...new Set(data.freezeRoundIds ?? [])];
  if (freezeIds.length) {
    const { error: freezeError } = await db
      .from("televoting_round_bindings")
      .update({ frozen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in("remote_round_id", freezeIds);
    if (freezeError) throw new Error(freezeError.message);
  }

  const outcome: SolarisResultSyncOutcome = {
    ok: true,
    status: "synced",
    sourceType: data.sourceType,
    sourceId: data.sourceId,
    editionId: data.editionId,
    showId: data.showId,
    imported: states.length,
    message: `${states.length} Televoting results synced to ${show.name}.`,
  };
  await recordResultSyncEvent(db, outcome, {
    row_count: states.length,
    tie_break: tieBreak,
    source_points_total: data.rows.reduce((sum, row) => sum + (Number(row.points) || 0), 0),
  });
  return outcome;
}

export async function syncPublishedRoundResultsToSolarisServer(
  roundId: string,
): Promise<SolarisResultSyncOutcome> {
  await requireMergedTelevotingAdminServer();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: round, error: roundError } = await televotingAdmin
    .from("rounds")
    .select("id,name,results_status,broadcast_display_mode,calculation_version")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) throw new Error(roundError.message);
  if (!round || round.results_status !== "published") {
    return {
      ok: false,
      status: "source_not_published",
      sourceType: "round",
      sourceId: roundId,
      message: "The Televoting result is not published yet.",
    };
  }

  if (round.broadcast_display_mode === "combined") {
    return {
      ok: false,
      status: "waiting_for_combined",
      sourceType: "round",
      sourceId: roundId,
      message: "This round is part of a Combined Televote. Solaris will wait for the published Combined result.",
    };
  }

  const { data: binding, error: bindingError } = await db
    .from("televoting_round_bindings")
    .select("edition_id,show_id")
    .eq("remote_round_id", roundId)
    .maybeSingle();
  if (bindingError) throw new Error(bindingError.message);
  if (!binding?.show_id) {
    return {
      ok: false,
      status: "unbound_show",
      sourceType: "round",
      sourceId: roundId,
      editionId: binding?.edition_id,
      message: "Bind this Televoting round to a Solaris show before publishing it into the official scoreboard.",
    };
  }

  const { data: rows, error: resultError } = await televotingAdmin
    .from("round_results")
    .select("country_code,final_points,calculation_version")
    .eq("round_id", roundId)
    .eq("calculation_version", Number(round.calculation_version ?? 0));
  if (resultError) throw new Error(resultError.message);

  return writeCanonicalShowTelevote({
    editionId: binding.edition_id,
    showId: binding.show_id,
    sourceType: "round",
    sourceId: roundId,
    rows: (rows ?? []).map((row) => ({ countryCode: String(row.country_code ?? ""), points: Number(row.final_points ?? 0) })),
    freezeRoundIds: [roundId],
  });
}

export async function syncPublishedCombinedResultsToSolarisServer(
  aggregationId: string,
): Promise<SolarisResultSyncOutcome> {
  await requireMergedTelevotingAdminServer();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: aggregation, error: aggregationError } = await televotingAdmin
    .from("televote_aggregations")
    .select("id,name,status,calculation_version,results_outdated")
    .eq("id", aggregationId)
    .maybeSingle();
  if (aggregationError) throw new Error(aggregationError.message);
  if (!aggregation || aggregation.status !== "published" || aggregation.results_outdated) {
    return {
      ok: false,
      status: "source_not_published",
      sourceType: "combined",
      sourceId: aggregationId,
      message: "The Combined Televote is not published and current yet.",
    };
  }

  const { data: sources, error: sourceError } = await televotingAdmin
    .from("televote_aggregation_sources")
    .select("source_round_id,enabled")
    .eq("aggregation_id", aggregationId);
  if (sourceError) throw new Error(sourceError.message);
  const sourceRoundIds = [...new Set((sources ?? [])
    .filter((source) => source.enabled && source.source_round_id)
    .map((source) => String(source.source_round_id)))];

  if (!sourceRoundIds.length) {
    return {
      ok: false,
      status: "unbound_show",
      sourceType: "combined",
      sourceId: aggregationId,
      message: "The Combined Televote has no linked voting round from which Solaris can resolve its show.",
    };
  }

  const { data: bindings, error: bindingError } = await db
    .from("televoting_round_bindings")
    .select("remote_round_id,edition_id,show_id")
    .in("remote_round_id", sourceRoundIds);
  if (bindingError) throw new Error(bindingError.message);
  const bound = (bindings ?? []).filter((binding: any) => binding.show_id);
  const targetKeys = [...new Set(bound.map((binding: any) => `${binding.edition_id}:${binding.show_id}`))];
  if (targetKeys.length !== 1 || bound.length !== sourceRoundIds.length) {
    return {
      ok: false,
      status: "unbound_show",
      sourceType: "combined",
      sourceId: aggregationId,
      message: "Every enabled Combined source round must be bound to the same Solaris show.",
    };
  }
  const target = bound[0];

  const { data: rows, error: resultError } = await televotingAdmin
    .from("combined_televote_results")
    .select("country_code,final_combined_points,calculation_version")
    .eq("aggregation_id", aggregationId)
    .eq("calculation_version", Number(aggregation.calculation_version ?? 0));
  if (resultError) throw new Error(resultError.message);

  return writeCanonicalShowTelevote({
    editionId: target.edition_id,
    showId: target.show_id,
    sourceType: "combined",
    sourceId: aggregationId,
    rows: (rows ?? []).map((row) => ({ countryCode: String(row.country_code ?? ""), points: Number(row.final_combined_points ?? 0) })),
    freezeRoundIds: sourceRoundIds,
  });
}

export async function trySyncPublishedRoundResultsToSolarisServer(roundId: string) {
  try {
    return await syncPublishedRoundResultsToSolarisServer(roundId);
  } catch (caught) {
    return {
      ok: false,
      status: "lineup_mismatch" as const,
      sourceType: "round" as const,
      sourceId: roundId,
      message: errorMessage(caught),
    };
  }
}

export async function trySyncPublishedCombinedResultsToSolarisServer(aggregationId: string) {
  try {
    return await syncPublishedCombinedResultsToSolarisServer(aggregationId);
  } catch (caught) {
    return {
      ok: false,
      status: "lineup_mismatch" as const,
      sourceType: "combined" as const,
      sourceId: aggregationId,
      message: errorMessage(caught),
    };
  }
}
