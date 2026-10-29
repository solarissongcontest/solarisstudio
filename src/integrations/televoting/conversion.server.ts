import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import { analyseRobustInfluence } from "@/integrations/televoting/influence-math";
import {
  DEFAULT_ROBUST_TELEVOTE_CONFIG,
  ROBUST_TELEVOTE_ENGINE_VERSION,
  convertRobustRound,
  type RobustBallotInput,
  type RobustTelevoteConfig,
} from "@/integrations/televoting/robust-televote-math";
import {
  CALC_ENGINE_VERSION,
  convertRound,
  type ConversionInput,
} from "@/integrations/televoting/televote-math";

export type TelevoteEngineVersion = typeof CALC_ENGINE_VERSION | typeof ROBUST_TELEVOTE_ENGINE_VERSION;

export type MergedRoundConfig = {
  id: string;
  round_version: number;
  input_hash: string;
  name: string;
  status: "draft" | "open" | "closed";
  total_points_to_distribute: number;
  rank_exponent: number;
  televote_engine_version: TelevoteEngineVersion;
  ballot_exponent: number;
  breadth_floor: number;
  breadth_exponent: number;
  support_exponent: number;
  rank_boost_strength: number;
  rank_boost_shape: number;
  results_status: "draft" | "calculated" | "locked" | "published";
  calculation_version: number;
  calculated_at: string | null;
  calculated_by_username: string | null;
  calc_participant_codes: string[] | null;
  results_outdated: boolean;
  public_advanced_transparency: boolean;
  broadcast_display_mode: "original" | "converted" | "combined";
};

export type ConversionOperation = { expectedVersion: number; operationId: string };

async function conversionCommand(roundId: string, action: string, payload: unknown, operation: ConversionOperation) {
  await requireMergedTelevotingAdminServer();
  const { data, error } = await (televotingAdmin as any).rpc("v3_configure_round", {
    p_round_id: roundId, p_action: action, p_payload: payload,
    p_expected_round_version: operation.expectedVersion, p_operation_id: operation.operationId,
    p_idempotency_key: `conversion:${operation.operationId}`,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error("Ambiguous conversion receipt; retry this operation");
  return data as { ok: true; version: number; calculatedAt: string; roundVersion: number };
}

function robustConfigForRound(round: MergedRoundConfig): RobustTelevoteConfig {
  return {
    ballotTotal: DEFAULT_ROBUST_TELEVOTE_CONFIG.ballotTotal,
    ballotExponent: Number(round.ballot_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.ballotExponent),
    breadthFloor: Number(round.breadth_floor ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.breadthFloor),
    breadthExponent: Number(round.breadth_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.breadthExponent),
    supportExponent: Number(round.support_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.supportExponent),
    rankBoostStrength: Number(round.rank_boost_strength ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.rankBoostStrength),
    rankBoostShape: Number(round.rank_boost_shape ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.rankBoostShape),
  };
}

export async function loadMergedConversionRound(roundId: string): Promise<MergedRoundConfig> {
  const { data, error } = await (televotingAdmin as any).rpc("v3_conversion_context", { p_round_id: roundId });
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

export async function loadMergedRobustBallots(
  roundId: string,
  participants: string[],
): Promise<RobustBallotInput[]> {
  const { data: submissions, error: submissionError } = await televotingAdmin
    .from("vote_submissions")
    .select("id,status")
    .eq("round_id", roundId);
  if (submissionError) throw new Error(submissionError.message);
  const valid = (submissions ?? []).filter((submission) => submission.status !== "deleted");
  if (!valid.length) return [];

  const { data: entries, error: entryError } = await televotingAdmin
    .from("vote_entries")
    .select("submission_id,target_country_code,points")
    .in("submission_id", valid.map((submission) => submission.id));
  if (entryError) throw new Error(entryError.message);

  const eligible = new Set(participants);
  const allocations = new Map<string, Record<string, number>>(
    valid.map((submission) => [String(submission.id), {}]),
  );
  for (const entry of entries ?? []) {
    if (!eligible.has(String(entry.target_country_code))) continue;
    const bucket = allocations.get(String(entry.submission_id));
    if (!bucket) continue;
    bucket[String(entry.target_country_code)] = Number(entry.points ?? 0);
  }

  return valid.map((submission) => ({
    voterId: String(submission.id),
    allocations: allocations.get(String(submission.id)) ?? {},
  }));
}

export async function getMergedTelevoteConversionServer(roundId: string) {
  await requireMergedTelevotingAdminServer();
  const round = await loadMergedConversionRound(roundId);
  const participants = await loadMergedConversionParticipants(roundId);
  const originals = await loadMergedOriginalTotals(roundId, participants);
  const ballots = round.televote_engine_version === ROBUST_TELEVOTE_ENGINE_VERSION
    ? await loadMergedRobustBallots(roundId, participants)
    : [];
  const robustPreview = round.televote_engine_version === ROBUST_TELEVOTE_ENGINE_VERSION
    ? convertRobustRound({
        participants,
        ballots,
        totalPoints: round.total_points_to_distribute,
        config: robustConfigForRound(round),
      })
    : null;
  const { data: stored, error } = await televotingAdmin
    .from("round_results")
    .select("*")
    .eq("round_id", roundId);
  if (error) throw new Error(error.message);
  return { round, participants, originals, robustPreview, stored: stored ?? [] };
}

export async function updateMergedConversionConfigServer(data: ConversionOperation & {
  roundId: string;
  totalPoints?: number;
  rankExponent?: number;
  engineVersion?: TelevoteEngineVersion;
  ballotExponent?: number;
  breadthFloor?: number;
  breadthExponent?: number;
  supportExponent?: number;
  rankBoostStrength?: number;
  rankBoostShape?: number;
  advancedTransparency?: boolean;
  broadcastMode?: "original" | "converted" | "combined";
}) {
  await requireMergedTelevotingAdminServer();

  const patch: Record<string, unknown> = {};
  if (data.totalPoints !== undefined) patch.total_points_to_distribute = Math.max(0, Math.trunc(data.totalPoints));
  if (data.rankExponent !== undefined) patch.rank_exponent = data.rankExponent;
  if (data.engineVersion !== undefined) {
    if (![CALC_ENGINE_VERSION, ROBUST_TELEVOTE_ENGINE_VERSION].includes(data.engineVersion)) {
      throw new Error("Unknown televote calculation engine");
    }
    patch.televote_engine_version = data.engineVersion;
  }
  if (data.ballotExponent !== undefined) patch.ballot_exponent = data.ballotExponent;
  if (data.breadthFloor !== undefined) patch.breadth_floor = data.breadthFloor;
  if (data.breadthExponent !== undefined) patch.breadth_exponent = data.breadthExponent;
  if (data.supportExponent !== undefined) patch.support_exponent = data.supportExponent;
  if (data.rankBoostStrength !== undefined) patch.rank_boost_strength = data.rankBoostStrength;
  if (data.rankBoostShape !== undefined) patch.rank_boost_shape = data.rankBoostShape;
  if (data.advancedTransparency !== undefined) patch.public_advanced_transparency = data.advancedTransparency;
  if (data.broadcastMode !== undefined) patch.broadcast_display_mode = data.broadcastMode;

  return conversionCommand(data.roundId, "conversion_config", patch, data);
}

async function persistV1Calculation(
  roundId: string,
  version: number,
  calculatedAt: string,
  actor: { id: string; username: string },
  round: MergedRoundConfig,
  participants: string[],
) {
  const totals = await loadMergedOriginalTotals(roundId, participants);
  const result = convertRound(totals, round.total_points_to_distribute, Number(round.rank_exponent));
  if (!result.zeroWeight && result.distributedTotal !== result.totalPoints) {
    throw new Error(`Conversion integrity check failed: distributed ${result.distributedTotal} ≠ T ${result.totalPoints}`);
  }

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
    engine_version: CALC_ENGINE_VERSION,
    calculation_config: { rankExponent: result.rankExponent },
  }));

  return {
    rows, influenceRows: [],
    engineVersion: CALC_ENGINE_VERSION,
    participantCount: result.participantCount,
    rankBase: result.rankBase,
    distributedTotal: result.distributedTotal,
    totalPoints: result.totalPoints,
    zeroWeight: result.zeroWeight,
    config: { rankExponent: result.rankExponent },
    influence: null,
  };
}

async function persistV2Calculation(
  roundId: string,
  version: number,
  calculatedAt: string,
  actor: { id: string; username: string },
  round: MergedRoundConfig,
  participants: string[],
) {
  const ballots = await loadMergedRobustBallots(roundId, participants);
  const config = robustConfigForRound(round);
  const result = convertRobustRound({
    participants,
    ballots,
    totalPoints: round.total_points_to_distribute,
    config,
  });
  if (!result.zeroWeight && result.distributedTotal !== result.totalPoints) {
    throw new Error(`Robust conversion integrity check failed: distributed ${result.distributedTotal} ≠ T ${result.totalPoints}`);
  }

  const rows = result.rows.map((row) => ({
    round_id: roundId,
    country_code: row.code,
    original_votes: Math.round(row.rawPoints),
    original_voters: row.supporterCount,
    original_rank: null,
    participant_count: result.participantCount,
    rank_base: null,
    rank_exponent: null,
    rank_factor: null,
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
    engine_version: ROBUST_TELEVOTE_ENGINE_VERSION,
    effective_points: row.effectivePoints,
    supporter_count: row.supporterCount,
    effective_supporters: row.effectiveSupporters,
    breadth_ratio: row.breadthRatio,
    breadth_factor: row.breadthFactor,
    robust_support: row.robustSupport,
    robust_rank: row.robustRank,
    rank_percentile: row.rankPercentile,
    rank_boost: row.rankBoost,
    calculation_config: result.config,
  }));

  const influence = analyseRobustInfluence({
    participants,
    ballots,
    totalPoints: round.total_points_to_distribute,
    config,
  });
  const influenceRows = influence.voters.map((row) => ({
    round_id: roundId,
    calculation_version: version,
    subject_type: "voter",
    subject_key: row.voterId,
    members: [row.voterId],
    winner_changed: row.winnerChanged,
    top_three_changed: row.topThreeChanged,
    qualifier_changed: row.qualifierChanged,
    max_rank_movement: row.maxRankMovement,
    max_point_movement: row.maxPointMovement,
    most_affected_entry: row.mostAffectedEntry,
  }));
  return {
    rows, influenceRows,
    engineVersion: ROBUST_TELEVOTE_ENGINE_VERSION,
    participantCount: result.participantCount,
    rankBase: null,
    distributedTotal: result.distributedTotal,
    totalPoints: result.totalPoints,
    zeroWeight: result.zeroWeight,
    config: result.config,
    influence: {
      votersAnalysed: influence.voters.length,
      winnerSensitiveVoters: influence.voters.filter((row) => row.winnerChanged).length,
      topThreeSensitiveVoters: influence.voters.filter((row) => row.topThreeChanged).length,
    },
  };
}

export async function runMergedOfficialCalculationServer(data: ConversionOperation & { roundId: string }) {
  const actor = await requireMergedTelevotingAdminServer();
  // Recover before reading new inputs or calculating. An acknowledged calculation
  // may have changed the round revision after its response was lost.
  const client = (televotingAdmin as any).schema("public");
  const { data: recovered, error: recoveryError } = await client.rpc("studio2_reconcile_operation", { p_operation_id: data.operationId });
  if (recovered?.status === "succeeded") {
    // Re-enter the command to recheck live capability and the exact request hash.
    // Its original deterministic request is retained in the receipt request data.
    const { data: receipt, error } = await (televotingAdmin as any).rpc("v3_recover_conversion_calculation", {
      p_round_id: data.roundId, p_expected_round_version: data.expectedVersion, p_operation_id: data.operationId,
    });
    if (error) throw new Error(error.message);
    return receipt as { ok: true; version: number; calculatedAt: string };
  }
  if (recoveryError && !["UNKNOWN", "P0002"].includes(recoveryError.message) && recoveryError.code !== "P0002") throw new Error(recoveryError.message);
  const round = await loadMergedConversionRound(data.roundId);
  if (round.round_version !== data.expectedVersion) throw new Error("VERSION_CONFLICT");
  const participants = await loadMergedConversionParticipants(data.roundId);
  if (!participants.length) throw new Error("This round has no eligible participants");
  const calculation = round.televote_engine_version === ROBUST_TELEVOTE_ENGINE_VERSION
    ? await persistV2Calculation(data.roundId, 0, "", actor, round, participants)
    : await persistV1Calculation(data.roundId, 0, "", actor, round, participants);
  return conversionCommand(data.roundId, "conversion_calculation", {
    inputHash: round.input_hash, rows: calculation.rows, influenceRows: calculation.influenceRows,
  }, data);
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
    .select("country_code,final_points,total_points_to_distribute,calculation_version,engine_version")
    .eq("round_id", roundId);
  if (error) throw new Error(error.message);

  const rows = results ?? [];
  const codes = new Set(rows.map((row) => row.country_code));
  for (const participant of participants) {
    if (!codes.has(participant)) problems.push(`Missing result row for ${participant}`);
  }
  for (const row of rows) {
    if (!participants.includes(row.country_code)) problems.push(`Ineligible participant in results: ${row.country_code}`);
  }
  if (rows.some((row) => row.calculation_version !== round.calculation_version)) {
    problems.push("Result rows are from an older calculation — recalculate");
  }
  if (rows.some((row) => row.engine_version !== round.televote_engine_version)) {
    problems.push("Result rows were calculated with a different engine — recalculate");
  }

  const sum = rows.reduce((total, row) => total + (row.final_points ?? 0), 0);
  const allZero = rows.every((row) => (row.final_points ?? 0) === 0);
  if (!allZero && sum !== round.total_points_to_distribute) {
    problems.push(`Converted total ${sum} does not equal T ${round.total_points_to_distribute}`);
  }

  return { problems, round, participants, rows };
}

export async function setMergedResultsStatusServer(data: ConversionOperation & {
  roundId: string;
  status: "calculated" | "locked" | "published";
  reason?: string;
}) {
  return conversionCommand(data.roundId, "conversion_status", { status: data.status, reason: data.reason ?? null }, data);
}
