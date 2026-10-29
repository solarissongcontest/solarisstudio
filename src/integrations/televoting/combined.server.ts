import { recoverCombinedDeletion, type CombinedDeletionReceiptClient } from "@/integrations/televoting/combined-deletion";
import { createHash } from "node:crypto";
import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import {
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
  updated_at: string;
  command_version: number;
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

export async function createMergedCombinedAggregationServer(data: { name: string; editionId?: string | null; totalPoints: number; rankExponent: number; operationId: string }) {
  await requireMergedTelevotingAdminServer();
  const { data: inserted, error } = await (televotingAdmin as any).rpc("v3_create_combined_aggregation", {
    p_remote_edition_id: data.editionId ?? null,
    p_name: data.name,
    p_total_points: data.totalPoints,
    p_rank_exponent: data.rankExponent,
    p_operation_id: data.operationId,
    p_idempotency_key: `combined-create:${data.operationId}`,
  });
  if (error) throw new Error(error.message);
  if (!inserted || typeof inserted.id !== "string") throw new Error("Combined creation returned an ambiguous receipt");
  return inserted as { id: string };
}

export async function updateMergedCombinedAggregationServer(data: { id: string; name: string; totalPoints: number; rankExponent: number; expectedVersion: number; operationId: string }) {
  await requireMergedTelevotingAdminServer();
  const { error } = await (televotingAdmin as any).rpc("v3_update_combined_metadata", {
    p_aggregation_id: data.id,
    p_expected_version: data.expectedVersion,
    p_name: data.name,
    p_total_points: data.totalPoints,
    p_rank_exponent: data.rankExponent,
    p_operation_id: data.operationId,
    p_idempotency_key: `combined-metadata:${data.operationId}`,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export type CombinedSourceOperation = { expectedVersion: number; operationId: string };

async function mutateCombinedSource(id: string, action: string, payload: unknown, operation: CombinedSourceOperation) {
  await requireMergedTelevotingAdminServer();
  const { data, error } = await (televotingAdmin as any).rpc("v3_manage_combined_sources", {
    p_aggregation_id: id, p_action: action, p_payload: payload,
    p_expected_version: operation.expectedVersion, p_operation_id: operation.operationId,
    p_idempotency_key: `combined-source:${operation.operationId}`,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function setMergedCombinedParticipantsServer(data: CombinedSourceOperation & { id: string; participants: string[] }) {
  return mutateCombinedSource(data.id, "participants", { participants: data.participants }, data);
}

export async function upsertMergedCombinedSourceServer(data: CombinedSourceOperation & {
  id?: string | null; aggregationId: string; sourceType: string; inputMode: SourceInputMode;
  roundId?: string | null; name: string; weight: number; enabled: boolean; displayOrder: number;
  correctionScope?: CorrectionScope; correctionTargetSourceId?: string | null;
}) {
  const { expectedVersion: _version, operationId: _operation, ...payload } = data;
  return mutateCombinedSource(data.aggregationId, "source", payload, data);
}

export async function deleteMergedCombinedSourceServer(data: CombinedSourceOperation & { aggregationId: string; sourceId: string }) {
  return mutateCombinedSource(data.aggregationId, "delete_source", { sourceId: data.sourceId }, data);
}

export async function saveMergedCombinedSourceValuesServer(data: CombinedSourceOperation & { aggregationId: string; sourceId: string; values: Record<string, number> }) {
  return mutateCombinedSource(data.aggregationId, "values", { sourceId: data.sourceId, values: data.values }, data);
}

export async function recalculateMergedCombinedServer(data: CombinedSourceOperation & { id: string }) {
  await requireMergedTelevotingAdminServer();
  const { data: receipt, error } = await (televotingAdmin as any).rpc("v3_calculate_combined", {
    p_aggregation_id: data.id,
    p_expected_version: data.expectedVersion,
    p_operation_id: data.operationId,
    p_idempotency_key: `combined-calculate:${data.operationId}`,
  });
  if (error) throw new Error(error.message);
  if (!receipt || !Number.isSafeInteger(receipt.version)) throw new Error("Combined calculation returned an ambiguous receipt; retry this operation");
  return receipt as { version: number; calculatedAt: string; operationId: string };
}

export async function setMergedCombinedStatusServer(data: { id: string; status: "draft" | "calculated" | "locked" | "published" }) {
  const actor = await requireMergedTelevotingAdminServer();
  const aggregation = await loadAggregation(data.id);
  if ((data.status === "locked" || data.status === "published") && (aggregation.results_outdated || !aggregation.calculation_version)) {
    throw new Error("Recalculate the combined result before locking or publishing it");
  }
  if (aggregation.status === data.status) return { ok: true };
  const fingerprint = createHash("sha256").update(JSON.stringify([
    actor.id, data.id, aggregation.command_version, data.status,
  ])).digest("hex");
  const operationId = `${fingerprint.slice(0, 8)}-${fingerprint.slice(8, 12)}-4${fingerprint.slice(13, 16)}-8${fingerprint.slice(17, 20)}-${fingerprint.slice(20, 32)}`;
  const { error } = await (televotingAdmin as any).rpc("v3_transition_combined_status", {
    p_aggregation_id: data.id,
    p_status: data.status,
    p_expected_version: aggregation.command_version,
    p_operation_id: operationId,
    p_idempotency_key: `combined-status:${fingerprint}`,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteMergedCombinedAggregationServer(id: string) {
  const actor = await requireMergedTelevotingAdminServer();
  // An aggregate ID is never recycled. Keep its actor-bound delete identity
  // stable even when a committed deletion makes the original row unreadable.
  const fingerprint = createHash("sha256").update(JSON.stringify(["combined.delete", actor.id, id])).digest("hex");
  const operationId = `${fingerprint.slice(0, 8)}-${fingerprint.slice(8, 12)}-4${fingerprint.slice(13, 16)}-8${fingerprint.slice(17, 20)}-${fingerprint.slice(20, 32)}`;
  const { createSolarisAuthenticatedClientServer } = await import("@/integrations/supabase/organizer.server");
  const client = createSolarisAuthenticatedClientServer() as unknown as CombinedDeletionReceiptClient;
  if (await recoverCombinedDeletion(id, async () => client.rpc("studio2_reconcile_operation", { p_operation_id: operationId }))) {
    return { ok: true };
  }
  const aggregation = await loadAggregation(id);
  if (aggregation.status === "published") throw new Error("Published combined results cannot be deleted");
  const { error } = await (televotingAdmin as any).rpc("v3_delete_combined_aggregation", {
    p_aggregation_id: id,
    p_remote_edition_id: aggregation.edition_id,
    p_expected_version: aggregation.command_version,
    p_operation_id: operationId,
    p_idempotency_key: `combined-delete:${fingerprint}`,
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}
