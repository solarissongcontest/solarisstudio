import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import {
  COMBINED_ENGINE_VERSION,
  computeCombined,
  inputModeForSourceType,
  type ComponentSourceInput,
  type CorrectionScope,
  type SourceInputMode,
} from "@/integrations/televoting/combined-math";

export type CombinedAggregation = {
  id: string;
  edition_id: string | null;
  name: string;
  combination_method: string;
  total_points_to_distribute: number;
  rank_exponent: number;
  status: "draft" | "calculated" | "locked" | "published";
  calculation_version: number;
  calculated_at: string | null;
  calculated_by_username: string | null;
  locked_at: string | null;
  published_at: string | null;
  results_outdated: boolean;
  public_columns: Record<string, boolean> | null;
  broadcast_display_mode: string | null;
  created_at?: string;
};

export type CombinedSource = {
  id: string;
  aggregation_id: string;
  source_type: string;
  input_mode: SourceInputMode | null;
  source_round_id: string | null;
  source_name: string;
  calculation_stage: string;
  calculation_method: string;
  percentage_weight: number;
  weight: number;
  enabled: boolean;
  display_order: number;
  correction_target_source_id: string | null;
  correction_scope: CorrectionScope | null;
  exact_point_pool: number | null;
  floored_point_pool: number | null;
  pool_remainder: number | null;
  pool_remainder_bonus: number | null;
  final_point_pool: number | null;
};

type Actor = { id: string; username: string };

async function audit(actor: Actor, action: string, targetId: string, values?: unknown) {
  await televotingAdmin.from("admin_audit_log").insert({
    actor_admin_id: actor.id,
    actor_username: actor.username,
    action,
    target_type: "televote_aggregation",
    target_id: targetId,
    new_values: values ?? null,
  });
}

export async function listMergedCombinedAggregationsServer() {
  await requireMergedTelevotingAdminServer();
  const { data, error } = await televotingAdmin
    .from("televote_aggregations")
    .select("id,edition_id,name,combination_method,total_points_to_distribute,rank_exponent,status,calculation_version,calculated_at,calculated_by_username,locked_at,published_at,results_outdated,public_columns,broadcast_display_mode,created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CombinedAggregation[];
}

async function loadAggregation(id: string) {
  const { data, error } = await televotingAdmin.from("televote_aggregations").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Combined result not found");
  return data as CombinedAggregation;
}

async function loadParticipants(id: string) {
  const { data, error } = await televotingAdmin
    .from("televote_aggregation_participants")
    .select("country_code,display_order")
    .eq("aggregation_id", id)
    .order("display_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => String(row.country_code));
}

async function loadSources(id: string) {
  const { data, error } = await televotingAdmin
    .from("televote_aggregation_sources")
    .select("*")
    .eq("aggregation_id", id)
    .order("display_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as CombinedSource[];
}

async function manualValues(sourceIds: string[]) {
  const result = new Map<string, Record<string, number>>();
  if (!sourceIds.length) return result;
  const { data, error } = await televotingAdmin
    .from("external_score_entries")
    .select("source_id,country_code,value")
    .in("source_id", sourceIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const bucket = result.get(row.source_id) ?? {};
    bucket[row.country_code] = (bucket[row.country_code] ?? 0) + Number(row.value ?? 0);
    result.set(row.source_id, bucket);
  }
  return result;
}

async function rawRoundValues(roundId: string, participants: string[]) {
  const values: Record<string, number> = Object.fromEntries(participants.map((code) => [code, 0]));
  const distributions: Record<string, number[]> = Object.fromEntries(participants.map((code) => [code, []]));
  const { data: submissions, error: submissionError } = await televotingAdmin
    .from("vote_submissions")
    .select("id,status")
    .eq("round_id", roundId);
  if (submissionError) throw new Error(submissionError.message);
  const validIds = (submissions ?? []).filter((row) => row.status !== "deleted").map((row) => row.id);
  if (!validIds.length) return { values, distributions };
  const { data: entries, error } = await televotingAdmin
    .from("vote_entries")
    .select("submission_id,target_country_code,points")
    .in("submission_id", validIds);
  if (error) throw new Error(error.message);
  for (const row of entries ?? []) {
    if (!(row.target_country_code in values)) continue;
    const points = Number(row.points ?? 0);
    values[row.target_country_code] += points;
    distributions[row.target_country_code]!.push(points);
  }
  for (const scores of Object.values(distributions)) scores.sort((a, b) => b - a);
  return { values, distributions };
}

async function convertedRoundValues(roundId: string, participants: string[]) {
  const values: Record<string, number> = Object.fromEntries(participants.map((code) => [code, 0]));
  const { data, error } = await televotingAdmin
    .from("round_results")
    .select("country_code,final_points,calculation_version")
    .eq("round_id", roundId);
  if (error) throw new Error(error.message);
  const latest = (data ?? []).reduce((max, row) => Math.max(max, Number(row.calculation_version ?? 0)), 0);
  for (const row of data ?? []) {
    if (Number(row.calculation_version ?? 0) !== latest) continue;
    if (row.country_code in values) values[row.country_code] = Number(row.final_points ?? 0);
  }
  return values;
}

async function resolveSources(sources: CombinedSource[], participants: string[]): Promise<ComponentSourceInput[]> {
  const manualIds = sources.filter((source) => !source.source_round_id).map((source) => source.id);
  const manual = await manualValues(manualIds);
  const output: ComponentSourceInput[] = [];

  for (const source of sources) {
    const mode = source.input_mode ?? inputModeForSourceType(source.source_type);
    let values: Record<string, number> = {};
    let distributions: Record<string, number[]> | undefined;
    if (source.source_round_id && mode === "converted_points") {
      values = await convertedRoundValues(source.source_round_id, participants);
    } else if (source.source_round_id) {
      const raw = await rawRoundValues(source.source_round_id, participants);
      values = raw.values;
      distributions = raw.distributions;
    } else {
      values = manual.get(source.id) ?? {};
    }
    output.push({
      id: source.id,
      name: source.source_name,
      type: source.source_type,
      inputMode: mode,
      percentageWeight: Number(source.percentage_weight ?? 0),
      enabled: Boolean(source.enabled),
      displayOrder: Number(source.display_order ?? 0),
      values,
      distributions,
      correctionTargetSourceId: source.correction_target_source_id,
      correctionScope: source.correction_scope ?? "final",
    });
  }
  return output;
}

async function loadEntryCatalog(aggregationId: string, participants: string[]) {
  const sources = await loadSources(aggregationId);
  const roundIds = [...new Set(sources.map((source) => source.source_round_id).filter((id): id is string => Boolean(id)))];
  let rows: Array<{ entry_key: string; country_code: string | null; custom_name: string | null; short_name: string | null; entry_code: string | null; image_url: string | null }> = [];
  if (roundIds.length) {
    const result = await televotingAdmin
      .from("round_entries")
      .select("entry_key,country_code,custom_name,short_name,entry_code,image_url")
      .in("round_id", roundIds);
    if (result.error) throw new Error(result.error.message);
    rows = result.data ?? [];
  }
  const found = new Set(rows.map((row) => row.entry_key));
  const missing = participants.filter((key) => !found.has(key));
  if (missing.length) {
    const result = await televotingAdmin
      .from("round_entries")
      .select("entry_key,country_code,custom_name,short_name,entry_code,image_url")
      .in("entry_key", missing);
    if (!result.error) rows.push(...(result.data ?? []));
  }
  const countryCodes = [...new Set(rows.map((row) => row.country_code).filter((code): code is string => Boolean(code)))];
  const countryResult = countryCodes.length
    ? await televotingAdmin.from("countries").select("code,name,flag,flag_url").in("code", countryCodes)
    : { data: [], error: null };
  if (countryResult.error) throw new Error(countryResult.error.message);
  const countries = new Map((countryResult.data ?? []).map((row) => [row.code, row]));
  const catalog = new Map<string, { key: string; name: string; code: string; image: string | null }>();
  for (const row of rows) {
    if (catalog.has(row.entry_key)) continue;
    const country = row.country_code ? countries.get(row.country_code) : undefined;
    catalog.set(row.entry_key, {
      key: row.entry_key,
      name: row.custom_name || row.short_name || country?.name || row.entry_key,
      code: row.entry_code || row.country_code || row.entry_key,
      image: row.image_url || country?.flag_url || null,
    });
  }
  return participants.map((key) => catalog.get(key) ?? { key, name: key, code: key, image: null });
}

export async function getMergedCombinedAggregationServer(id: string) {
  await requireMergedTelevotingAdminServer();
  const [aggregation, participants, sources] = await Promise.all([loadAggregation(id), loadParticipants(id), loadSources(id)]);
  const resolved = await resolveSources(sources, participants);
  const preview = computeCombined({
    participants,
    sources: resolved,
    totalPoints: Number(aggregation.total_points_to_distribute ?? 0),
    rankExponent: Number(aggregation.rank_exponent ?? 1.33),
  });
  const catalog = await loadEntryCatalog(id, participants);
  const { data: stored, error } = await televotingAdmin
    .from("combined_televote_results")
    .select("country_code,calculation_version,total_voting_points,total_activity_points,final_correction,final_combined_points,final_rank,final_tie_break_data,calculated_at")
    .eq("aggregation_id", id)
    .eq("calculation_version", Number(aggregation.calculation_version ?? 0))
    .order("final_rank");
  if (error) throw new Error(error.message);
  return { aggregation, participants, sources, resolved, preview, catalog, stored: stored ?? [] };
}

export async function createMergedCombinedAggregationServer(data: { name: string; editionId?: string | null; totalPoints: number; rankExponent: number }) {
  const actor = await requireMergedTelevotingAdminServer();
  const { data: inserted, error } = await televotingAdmin
    .from("televote_aggregations")
    .insert({
      edition_id: data.editionId ?? null,
      name: data.name,
      combination_method: "component_pool",
      total_points_to_distribute: data.totalPoints,
      rank_exponent: data.rankExponent,
      status: "draft",
      calculation_version: 0,
      results_outdated: true,
      broadcast_display_mode: "combined",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await audit(actor, "create_combined_televote", inserted.id, data);
  return inserted;
}

export async function updateMergedCombinedAggregationServer(data: { id: string; name: string; totalPoints: number; rankExponent: number }) {
  const actor = await requireMergedTelevotingAdminServer();
  const { error } = await televotingAdmin
    .from("televote_aggregations")
    .update({ name: data.name, total_points_to_distribute: data.totalPoints, rank_exponent: data.rankExponent, results_outdated: true })
    .eq("id", data.id);
  if (error) throw new Error(error.message);
  await audit(actor, "update_combined_televote", data.id, data);
  return { ok: true };
}

export async function setMergedCombinedParticipantsServer(data: { id: string; participants: string[] }) {
  const actor = await requireMergedTelevotingAdminServer();
  await televotingAdmin.from("televote_aggregation_participants").delete().eq("aggregation_id", data.id);
  if (data.participants.length) {
    const { error } = await televotingAdmin.from("televote_aggregation_participants").insert(
      data.participants.map((country_code, display_order) => ({ aggregation_id: data.id, country_code, display_order })),
    );
    if (error) throw new Error(error.message);
  }
  await televotingAdmin.from("televote_aggregations").update({ results_outdated: true }).eq("id", data.id);
  await audit(actor, "set_combined_participants", data.id, { participants: data.participants });
  return { ok: true };
}

export async function upsertMergedCombinedSourceServer(data: {
  id?: string | null;
  aggregationId: string;
  sourceType: string;
  inputMode: SourceInputMode;
  roundId?: string | null;
  name: string;
  weight: number;
  enabled: boolean;
  displayOrder: number;
  correctionScope?: CorrectionScope;
  correctionTargetSourceId?: string | null;
}) {
  const actor = await requireMergedTelevotingAdminServer();
  const payload = {
    aggregation_id: data.aggregationId,
    source_type: data.sourceType,
    input_mode: data.inputMode,
    source_round_id: data.roundId ?? null,
    source_name: data.name,
    calculation_stage: data.inputMode === "correction" ? "post_conversion" : "pre_conversion",
    calculation_method: data.inputMode,
    percentage_weight: data.inputMode === "correction" ? 0 : data.weight,
    weight: data.inputMode === "correction" ? 0 : data.weight,
    enabled: data.enabled,
    display_order: data.displayOrder,
    correction_scope: data.correctionScope ?? "final",
    correction_target_source_id: data.correctionTargetSourceId ?? null,
  };
  let result;
  if (data.id) {
    result = await televotingAdmin.from("televote_aggregation_sources").update(payload).eq("id", data.id).select("id").single();
  } else {
    result = await televotingAdmin.from("televote_aggregation_sources").insert(payload).select("id").single();
  }
  if (result.error) throw new Error(result.error.message);
  await televotingAdmin.from("televote_aggregations").update({ results_outdated: true }).eq("id", data.aggregationId);
  await audit(actor, data.id ? "update_combined_source" : "create_combined_source", data.aggregationId, { source_id: result.data.id, ...payload });
  return result.data;
}

export async function deleteMergedCombinedSourceServer(data: { aggregationId: string; sourceId: string }) {
  const actor = await requireMergedTelevotingAdminServer();
  await televotingAdmin.from("external_score_entries").delete().eq("source_id", data.sourceId);
  const { error } = await televotingAdmin.from("televote_aggregation_sources").delete().eq("id", data.sourceId).eq("aggregation_id", data.aggregationId);
  if (error) throw new Error(error.message);
  await televotingAdmin.from("televote_aggregations").update({ results_outdated: true }).eq("id", data.aggregationId);
  await audit(actor, "delete_combined_source", data.aggregationId, { source_id: data.sourceId });
  return { ok: true };
}

export async function saveMergedCombinedSourceValuesServer(data: { aggregationId: string; sourceId: string; values: Record<string, number> }) {
  const actor = await requireMergedTelevotingAdminServer();
  await televotingAdmin.from("external_score_entries").delete().eq("source_id", data.sourceId);
  const rows = Object.entries(data.values)
    .filter(([, value]) => Number(value) !== 0)
    .map(([country_code, value]) => ({ source_id: data.sourceId, country_code, value: Number(value) }));
  if (rows.length) {
    const { error } = await televotingAdmin.from("external_score_entries").insert(rows);
    if (error) throw new Error(error.message);
  }
  await televotingAdmin.from("televote_aggregations").update({ results_outdated: true }).eq("id", data.aggregationId);
  await audit(actor, "save_combined_source_values", data.aggregationId, { source_id: data.sourceId, count: rows.length });
  return { ok: true };
}

export async function recalculateMergedCombinedServer(id: string) {
  const actor = await requireMergedTelevotingAdminServer();
  const aggregation = await loadAggregation(id);
  const participants = await loadParticipants(id);
  const sources = await loadSources(id);
  const resolved = await resolveSources(sources, participants);
  const result = computeCombined({
    participants,
    sources: resolved,
    totalPoints: Number(aggregation.total_points_to_distribute ?? 0),
    rankExponent: Number(aggregation.rank_exponent ?? 1.33),
  });
  if (result.errors.length) throw new Error(result.errors[0]);
  const version = Number(aggregation.calculation_version ?? 0) + 1;
  const calculatedAt = new Date().toISOString();
  const poolMap = new Map(result.pools.map((pool) => [pool.sourceId, pool]));

  for (const pool of result.pools) {
    await televotingAdmin.from("televote_aggregation_sources").update({
      calculation_method: pool.method,
      exact_point_pool: pool.exactPool,
      floored_point_pool: pool.flooredPool,
      pool_remainder: pool.poolRemainder,
      pool_remainder_bonus: pool.poolBonus,
      final_point_pool: pool.finalPool,
    }).eq("id", pool.sourceId);
  }

  await televotingAdmin.from("combined_televote_component_results").delete().eq("aggregation_id", id).eq("calculation_version", version);
  await televotingAdmin.from("combined_televote_results").delete().eq("aggregation_id", id).eq("calculation_version", version);

  const componentRows = result.rows.flatMap((row) => row.componentResults.map((component) => ({
    aggregation_id: id,
    component_id: component.sourceId,
    component_name: component.sourceName,
    component_type: component.sourceType,
    country_code: component.countryCode,
    calculation_version: version,
    method: component.method,
    percentage_weight: poolMap.get(component.sourceId)?.percentageWeight ?? 0,
    component_pool: poolMap.get(component.sourceId)?.finalPool ?? 0,
    raw_score: component.rawScore,
    raw_rank: component.rawRank,
    participant_count: component.participantCount,
    rank_base: component.rankBase,
    rank_exponent: component.rankExponent,
    rank_factor: component.rankFactor,
    weighted_score: component.weightedScore,
    source_weighted_total: component.sourceWeightedTotal,
    exact_allocation: component.exactAllocation,
    floored_allocation: component.flooredAllocation,
    decimal_remainder: component.decimalRemainder,
    remainder_bonus: component.remainderBonus,
    final_allocated_points: component.finalAllocatedPoints,
    tie_break_data: component.tieBreakData,
    calculated_at: calculatedAt,
  })));
  if (componentRows.length) {
    const { error } = await televotingAdmin.from("combined_televote_component_results").insert(componentRows);
    if (error) throw new Error(error.message);
  }

  const finalRows = result.rows.map((row) => ({
    aggregation_id: id,
    country_code: row.code,
    calculation_version: version,
    source_contributions: row.componentResults.map((component) => ({
      source_id: component.sourceId,
      source_name: component.sourceName,
      source_type: component.sourceType,
      method: component.method,
      raw_score: component.rawScore,
      allocated_points: component.finalAllocatedPoints,
    })),
    total_voting_points: row.totalVotingPoints,
    total_activity_points: row.totalActivityPoints,
    final_correction: row.finalCorrection,
    final_combined_points: row.finalCombinedPoints,
    final_rank: row.finalRank,
    final_tie_break_data: row.finalTieBreakData,
    converted_points: row.totalVotingPoints,
    post_conversion_bonus: row.totalActivityPoints,
    post_conversion_adjustment: row.finalCorrection,
    final_televote_score: row.finalCombinedPoints,
    combined_original_rank: row.finalRank,
    participant_count: participants.length,
    calculated_at: calculatedAt,
  }));
  if (finalRows.length) {
    const { error } = await televotingAdmin.from("combined_televote_results").insert(finalRows);
    if (error) throw new Error(error.message);
  }

  const { error: updateError } = await televotingAdmin.from("televote_aggregations").update({
    status: aggregation.status === "draft" ? "calculated" : aggregation.status,
    calculation_version: version,
    calculated_at: calculatedAt,
    calculated_by: actor.id,
    calculated_by_username: actor.username,
    results_outdated: false,
  }).eq("id", id);
  if (updateError) throw new Error(updateError.message);
  await audit(actor, "calculate_combined_televote", id, {
    engine: COMBINED_ENGINE_VERSION,
    calculation_version: version,
    total_points: result.totalPoints,
    pools: result.pools,
  });
  return { version, calculatedAt, result };
}

export async function setMergedCombinedStatusServer(data: { id: string; status: "draft" | "calculated" | "locked" | "published" }) {
  const actor = await requireMergedTelevotingAdminServer();
  const aggregation = await loadAggregation(data.id);
  if ((data.status === "locked" || data.status === "published") && (aggregation.results_outdated || !aggregation.calculation_version)) {
    throw new Error("Recalculate the combined result before locking or publishing it");
  }
  const patch: Record<string, unknown> = { status: data.status };
  if (data.status === "locked") patch.locked_at = new Date().toISOString();
  if (data.status === "published") patch.published_at = new Date().toISOString();
  const { error } = await televotingAdmin.from("televote_aggregations").update(patch).eq("id", data.id);
  if (error) throw new Error(error.message);
  await audit(actor, "set_combined_status", data.id, { status: data.status });
  return { ok: true };
}

export async function deleteMergedCombinedAggregationServer(id: string) {
  const actor = await requireMergedTelevotingAdminServer();
  const aggregation = await loadAggregation(id);
  if (aggregation.status === "published") throw new Error("Published combined results cannot be deleted");
  const sourceResult = await televotingAdmin.from("televote_aggregation_sources").select("id").eq("aggregation_id", id);
  const sourceIds = (sourceResult.data ?? []).map((row) => row.id);
  if (sourceIds.length) await televotingAdmin.from("external_score_entries").delete().in("source_id", sourceIds);
  await televotingAdmin.from("combined_televote_component_results").delete().eq("aggregation_id", id);
  await televotingAdmin.from("combined_televote_results").delete().eq("aggregation_id", id);
  await televotingAdmin.from("televote_aggregation_participants").delete().eq("aggregation_id", id);
  await televotingAdmin.from("televote_aggregation_sources").delete().eq("aggregation_id", id);
  const { error } = await televotingAdmin.from("televote_aggregations").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await audit(actor, "delete_combined_televote", id, { name: aggregation.name });
  return { ok: true };
}
