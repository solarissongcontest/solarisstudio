import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import {
  CALC_ENGINE_VERSION,
  convertRound,
  type ConversionInput,
} from "@/integrations/televoting/televote-math";

export type MergedRoundConfig = {
  id: string;
  name: string;
  status: "draft" | "open" | "closed";
  total_points_to_distribute: number;
  rank_exponent: number;
  results_status: "draft" | "calculated" | "locked" | "published";
  calculation_version: number;
  calculated_at: string | null;
  calculated_by_username: string | null;
  calc_participant_codes: string[] | null;
  results_outdated: boolean;
  public_advanced_transparency: boolean;
  broadcast_display_mode: "original" | "converted" | "combined";
};

async function audit(
  actor: { id: string; username: string },
  action: string,
  opts: {
    target_type?: string;
    target_id?: string;
    old_values?: unknown;
    new_values?: unknown;
    reason?: string;
  } = {},
) {
  await televotingAdmin.from("admin_audit_log").insert({
    actor_admin_id: actor.id,
    actor_username: actor.username,
    action,
    target_type: opts.target_type ?? null,
    target_id: opts.target_id ?? null,
    old_values: opts.old_values ?? null,
    new_values: opts.new_values ?? null,
    reason: opts.reason ?? null,
  });
}

export async function loadMergedConversionRound(roundId: string): Promise<MergedRoundConfig> {
  const { data, error } = await televotingAdmin
    .from("rounds")
    .select("id,name,status,total_points_to_distribute,rank_exponent,results_status,calculation_version,calculated_at,calculated_by_username,calc_participant_codes,results_outdated,public_advanced_transparency,broadcast_display_mode")
    .eq("id", roundId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Round not found");
  return data as unknown as MergedRoundConfig;
}

export async function loadMergedConversionParticipants(roundId: string) {
  const { data, error } = await televotingAdmin
    .from("round_entries")
    .select("entry_key,display_order")
    .eq("round_id", roundId)
    .order("display_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.entry_key as string);
}

export async function loadMergedOriginalTotals(
  roundId: string,
  participants: string[],
): Promise<ConversionInput[]> {
  const { data: submissions, error: submissionError } = await televotingAdmin
    .from("vote_submissions")
    .select("id,username_normalized,status")
    .eq("round_id", roundId);
  if (submissionError) throw new Error(submissionError.message);

  const valid = (submissions ?? []).filter((submission) => submission.status !== "deleted");
  const submissionMap = new Map(valid.map((submission) => [submission.id as string, submission]));

  if (!valid.length) {
    return participants.map((code) => ({ code, originalVotes: 0, originalVoters: 0 }));
  }

  const { data: entries, error: entryError } = await televotingAdmin
    .from("vote_entries")
    .select("submission_id,target_country_code,points")
    .in("submission_id", valid.map((submission) => submission.id));
  if (entryError) throw new Error(entryError.message);

  const tally = new Map<string, { votes: number; voters: Set<string> }>();
  for (const code of participants) tally.set(code, { votes: 0, voters: new Set() });

  for (const entry of entries ?? []) {
    const bucket = tally.get(entry.target_country_code);
    if (!bucket) continue;
    bucket.votes += entry.points ?? 0;
    const submission = submissionMap.get(entry.submission_id);
    if (submission) bucket.voters.add(submission.username_normalized);
  }

  return participants.map((code) => ({
    code,
    originalVotes: tally.get(code)!.votes,
    originalVoters: tally.get(code)!.voters.size,
  }));
}

export async function getMergedTelevoteConversionServer(roundId: string) {
  await requireMergedTelevotingAdminServer();
  const round = await loadMergedConversionRound(roundId);
  const participants = await loadMergedConversionParticipants(roundId);
  const originals = await loadMergedOriginalTotals(roundId, participants);
  const { data: stored, error } = await televotingAdmin
    .from("round_results")
    .select("*")
    .eq("round_id", roundId);
  if (error) throw new Error(error.message);
  return { round, participants, originals, stored: stored ?? [] };
}

export async function updateMergedConversionConfigServer(data: {
  roundId: string;
  totalPoints?: number;
  rankExponent?: number;
  advancedTransparency?: boolean;
  broadcastMode?: "original" | "converted" | "combined";
}) {
  const actor = await requireMergedTelevotingAdminServer();
  const before = await loadMergedConversionRound(data.roundId);

  const patch: Record<string, unknown> = {};
  if (data.totalPoints !== undefined) patch.total_points_to_distribute = data.totalPoints;
  if (data.rankExponent !== undefined) patch.rank_exponent = data.rankExponent;
  if (data.advancedTransparency !== undefined) patch.public_advanced_transparency = data.advancedTransparency;
  if (data.broadcastMode !== undefined) patch.broadcast_display_mode = data.broadcastMode;

  const affectsMath =
    (data.totalPoints !== undefined && data.totalPoints !== before.total_points_to_distribute) ||
    (data.rankExponent !== undefined && Number(data.rankExponent) !== Number(before.rank_exponent));
  if (affectsMath && before.calculation_version > 0) patch.results_outdated = true;

  const { error } = await televotingAdmin.from("rounds").update(patch).eq("id", data.roundId);
  if (error) throw new Error(error.message);

  await audit(actor, "update_televote_config", {
    target_type: "round",
    target_id: data.roundId,
    old_values: {
      total_points_to_distribute: before.total_points_to_distribute,
      rank_exponent: before.rank_exponent,
      public_advanced_transparency: before.public_advanced_transparency,
      broadcast_display_mode: before.broadcast_display_mode,
    },
    new_values: patch,
  });

  return { ok: true, outdated: Boolean(patch.results_outdated) };
}

export async function runMergedOfficialCalculationServer(roundId: string) {
  const actor = await requireMergedTelevotingAdminServer();
  const round = await loadMergedConversionRound(roundId);
  const participants = await loadMergedConversionParticipants(roundId);
  if (!participants.length) throw new Error("This round has no eligible participants");

  const totals = await loadMergedOriginalTotals(roundId, participants);
  const result = convertRound(
    totals,
    round.total_points_to_distribute,
    Number(round.rank_exponent),
  );

  if (!result.zeroWeight && result.distributedTotal !== result.totalPoints) {
    throw new Error(
      `Conversion integrity check failed: distributed ${result.distributedTotal} ≠ T ${result.totalPoints}`,
    );
  }

  const version = round.calculation_version + 1;
  const calculatedAt = new Date().toISOString();

  const { error: deleteError } = await televotingAdmin
    .from("round_results")
    .delete()
    .eq("round_id", roundId);
  if (deleteError) throw new Error(deleteError.message);

  const rows = result.rows.map((row) => ({
    round_id: roundId,
    country_code: row.code,
    original_votes: row.originalVotes,
    original_voters: row.originalVoters,
    original_rank: row.originalRank,
    participant_count: row.participantCount,
    rank_base: row.rankBase,
    rank_exponent: row.rankExponent,
    rank_factor: row.rankFactor,
    weighted_score: row.weightedScore,
    exact_points: row.exactPoints,
    floored_points: row.flooredPoints,
    decimal_remainder: row.decimalRemainder,
    remainder_bonus: row.remainderBonus,
    final_points: row.finalPoints,
    total_points_to_distribute: result.totalPoints,
    calculation_version: version,
    calculated_at: calculatedAt,
    calculated_by_username: actor.username,
  }));

  const { error: insertError } = await televotingAdmin.from("round_results").insert(rows);
  if (insertError) throw new Error(insertError.message);

  const { error: updateError } = await televotingAdmin
    .from("rounds")
    .update({
      results_status: "calculated",
      calculation_version: version,
      calculated_at: calculatedAt,
      calculated_by: actor.id,
      calculated_by_username: actor.username,
      calc_participant_codes: participants,
      results_outdated: false,
    })
    .eq("id", roundId);
  if (updateError) throw new Error(updateError.message);

  await audit(actor, "calculate_televote_conversion", {
    target_type: "round",
    target_id: roundId,
    new_values: {
      engine: CALC_ENGINE_VERSION,
      calculation_version: version,
      total_points: result.totalPoints,
      rank_exponent: result.rankExponent,
      participant_count: result.participantCount,
      rank_base: result.rankBase,
      distributed_total: result.distributedTotal,
      zero_weight: result.zeroWeight,
    },
  });

  return {
    version,
    calculatedAt,
    participantCount: result.participantCount,
    rankBase: result.rankBase,
    distributedTotal: result.distributedTotal,
    totalPoints: result.totalPoints,
    zeroWeight: result.zeroWeight,
  };
}

export async function validateMergedPublicationServer(roundId: string) {
  const round = await loadMergedConversionRound(roundId);
  const participants = await loadMergedConversionParticipants(roundId);
  const problems: string[] = [];

  if (!Number.isInteger(round.total_points_to_distribute) || round.total_points_to_distribute < 0) {
    problems.push("Total points T must be a non-negative whole number");
  }
  if (round.status !== "closed") problems.push("Voting must be closed first");
  if (!participants.length) problems.push("There must be at least one eligible participant");
  if (round.calculation_version === 0) problems.push("Results have not been calculated yet");
  if (round.results_outdated) problems.push("The lineup or settings changed — recalculate first");

  const { data: results, error } = await televotingAdmin
    .from("round_results")
    .select("country_code,final_points,total_points_to_distribute,calculation_version")
    .eq("round_id", roundId);
  if (error) throw new Error(error.message);

  const rows = results ?? [];
  const codes = new Set(rows.map((row) => row.country_code));
  for (const participant of participants) {
    if (!codes.has(participant)) problems.push(`Missing result row for ${participant}`);
  }
  for (const row of rows) {
    if (!participants.includes(row.country_code)) {
      problems.push(`Ineligible participant in results: ${row.country_code}`);
    }
  }
  if (rows.some((row) => row.calculation_version !== round.calculation_version)) {
    problems.push("Result rows are from an older calculation — recalculate");
  }

  const sum = rows.reduce((total, row) => total + (row.final_points ?? 0), 0);
  const allZero = rows.every((row) => (row.final_points ?? 0) === 0);
  if (!allZero && sum !== round.total_points_to_distribute) {
    problems.push(`Converted total ${sum} does not equal T ${round.total_points_to_distribute}`);
  }

  return { problems, round, participants, rows };
}

export async function setMergedResultsStatusServer(data: {
  roundId: string;
  status: "calculated" | "locked" | "published";
  reason?: string;
}) {
  const actor = await requireMergedTelevotingAdminServer();
  const before = await loadMergedConversionRound(data.roundId);

  if ((data.status === "locked" || data.status === "published") && before.calculation_version === 0) {
    throw new Error("Calculate the conversion before locking or publishing");
  }

  if (data.status === "published") {
    const { problems } = await validateMergedPublicationServer(data.roundId);
    if (problems.length) throw new Error(`Cannot publish:\n• ${problems.join("\n• ")}`);
  }

  const { error } = await televotingAdmin
    .from("rounds")
    .update({ results_status: data.status })
    .eq("id", data.roundId);
  if (error) throw new Error(error.message);

  await audit(actor, `televote_results_${data.status}`, {
    target_type: "round",
    target_id: data.roundId,
    old_values: { results_status: before.results_status },
    new_values: { results_status: data.status },
    reason: data.reason,
  });

  return { ok: true };
}
