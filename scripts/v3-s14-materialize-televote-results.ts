import { createClient } from "@supabase/supabase-js";

import { assertS14TelevoteReadback } from "./lib/s14-televote-readback";

import { analyseRobustInfluence } from "../src/integrations/televoting/influence-math";
import {
  DEFAULT_ROBUST_TELEVOTE_CONFIG,
  ROBUST_TELEVOTE_ENGINE_VERSION,
  convertRobustRound,
  type RobustTelevoteConfig,
} from "../src/integrations/televoting/robust-televote-math";
import {
  CALC_ENGINE_VERSION,
  convertRound,
  type ConversionInput,
} from "../src/integrations/televoting/televote-math";

function fail(message: string): never {
  throw new Error(`[v3-s14-results-adapter] ${message}`);
}

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) fail(`missing ${name}`);
  return value;
}

function assertLocalUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    fail(`refusing non-local Supabase URL ${parsed.origin}`);
  }
  if (process.env.V3_VERIFICATION_TARGET !== "local") {
    fail("V3_VERIFICATION_TARGET must be local");
  }
  if (process.env.V3_DESTRUCTIVE_VERIFICATION !== "1") {
    fail("V3_DESTRUCTIVE_VERIFICATION=1 is required");
  }
}

type MaterializedResultRow = {
  country_code: string;
  final_points: number;
  [key: string]: unknown;
};

async function main() {
  const [roundId, showId, editionId] = process.argv.slice(2);
  if (!roundId || !showId || !editionId) {
    fail("usage: bun run scripts/v3-s14-materialize-televote-results.ts <round-id> <show-id> <edition-id>");
  }

  const url = process.env.API_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  if (!url) fail("missing API_URL/SUPABASE_URL");
  assertLocalUrl(url);
  const serviceRoleKey = required("SERVICE_ROLE_KEY");

  const common = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  } as const;
  const tv = createClient(url, serviceRoleKey, { ...common, db: { schema: "televoting" } });
  const db = createClient(url, serviceRoleKey, { ...common, db: { schema: "public" } });

  const { data: round, error: roundError } = await tv
    .from("rounds")
    .select("id,status,total_points_to_distribute,rank_exponent,televote_engine_version,calculation_version,results_status,ballot_exponent,breadth_floor,breadth_exponent,support_exponent,rank_boost_strength,rank_boost_shape")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) fail(roundError.message);
  if (!round) fail(`round ${roundId} not found`);
  if (round.status !== "closed") fail(`round ${roundId} must be closed before calculation`);

  const engineVersion = String(round.televote_engine_version ?? CALC_ENGINE_VERSION);
  if (engineVersion !== CALC_ENGINE_VERSION && engineVersion !== ROBUST_TELEVOTE_ENGINE_VERSION) {
    fail(`unsupported Televote engine ${engineVersion}`);
  }

  const { data: entries, error: entryError } = await tv
    .from("round_entries")
    .select("country_code,entry_key,display_order")
    .eq("round_id", roundId)
    .order("display_order", { ascending: true });
  if (entryError) fail(entryError.message);
  const participants = (entries ?? []).map((row) => String(row.country_code ?? row.entry_key ?? "").trim().toUpperCase());
  if (!participants.length || participants.some((code) => !code)) fail(`round ${roundId} has invalid participant codes`);
  if (new Set(participants).size !== participants.length) fail(`round ${roundId} has duplicate participant codes`);

  const { data: submissions, error: submissionError } = await tv
    .from("vote_submissions")
    .select("id,username_normalized,status")
    .eq("round_id", roundId);
  if (submissionError) fail(submissionError.message);
  const accepted = (submissions ?? []).filter((row) => row.status !== "deleted");
  if (!accepted.length) fail(`round ${roundId} has no accepted ballots`);

  const { data: voteEntries, error: voteEntryError } = await tv
    .from("vote_entries")
    .select("submission_id,target_country_code,points")
    .in("submission_id", accepted.map((row) => row.id));
  if (voteEntryError) fail(voteEntryError.message);

  const acceptedById = new Map(accepted.map((row) => [String(row.id), String(row.username_normalized)]));
  const tally = new Map<string, { points: number; voters: Set<string> }>(
    participants.map((code) => [code, { points: 0, voters: new Set<string>() }]),
  );
  const allocations = new Map<string, Record<string, number>>(
    accepted.map((row) => [String(row.id), {}]),
  );
  for (const row of voteEntries ?? []) {
    const code = String(row.target_country_code ?? "").trim().toUpperCase();
    const bucket = tally.get(code);
    if (!bucket) fail(`ballot targeted non-participant ${code}`);
    const points = Number(row.points ?? 0);
    if (!Number.isInteger(points) || points < 0) fail(`invalid vote points for ${code}`);
    bucket.points += points;
    const submissionId = String(row.submission_id);
    const voter = acceptedById.get(submissionId);
    if (voter) bucket.voters.add(voter);
    const allocation = allocations.get(submissionId);
    if (!allocation) fail(`vote entry references unknown submission ${submissionId}`);
    allocation[code] = points;
  }

  const { data: show, error: showError } = await db
    .from("shows")
    .select("id,edition_id")
    .eq("id", showId)
    .maybeSingle();
  if (showError) fail(showError.message);
  if (!show || show.edition_id !== editionId) fail(`show ${showId} is not in edition ${editionId}`);

  const { data: showParticipants, error: showParticipantError } = await db
    .from("participants")
    .select("country_id,participation_status")
    .eq("show_id", showId);
  if (showParticipantError) fail(showParticipantError.message);
  const active = (showParticipants ?? []).filter((row) => !row.participation_status || row.participation_status === "confirmed");
  const countryIds = active.map((row) => String(row.country_id));
  const { data: countries, error: countryError } = await db
    .from("countries")
    .select("id,short_code")
    .in("id", countryIds);
  if (countryError) fail(countryError.message);
  const countryByCode = new Map((countries ?? []).map((row) => [String(row.short_code).toUpperCase(), String(row.id)]));
  const expectedCodes = [...countryByCode.keys()].sort();
  const resultCodes = [...participants].sort();
  if (JSON.stringify(expectedCodes) !== JSON.stringify(resultCodes)) {
    fail(`Televote lineup does not exactly match confirmed show ${showId}`);
  }


  const version = Number(round.calculation_version ?? 0) + 1;
  const calculatedAt = new Date().toISOString();
  const totalPoints = Number(round.total_points_to_distribute ?? 0);
  let rows: MaterializedResultRow[];
  let distributedTotal: number;
  let zeroWeight: boolean;

  const { error: clearResultError } = await tv.from("round_results").delete().eq("round_id", roundId);
  if (clearResultError) fail(clearResultError.message);
  const { error: clearInfluenceError } = await tv.from("round_influence_results").delete().eq("round_id", roundId);
  if (clearInfluenceError) fail(clearInfluenceError.message);

  if (engineVersion === ROBUST_TELEVOTE_ENGINE_VERSION) {
    const config: RobustTelevoteConfig = {
      ballotTotal: DEFAULT_ROBUST_TELEVOTE_CONFIG.ballotTotal,
      ballotExponent: Number(round.ballot_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.ballotExponent),
      breadthFloor: Number(round.breadth_floor ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.breadthFloor),
      breadthExponent: Number(round.breadth_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.breadthExponent),
      supportExponent: Number(round.support_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.supportExponent),
      rankBoostStrength: Number(round.rank_boost_strength ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.rankBoostStrength),
      rankBoostShape: Number(round.rank_boost_shape ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.rankBoostShape),
    };
    const ballots = accepted.map((submission) => ({
      voterId: String(submission.id),
      allocations: allocations.get(String(submission.id)) ?? {},
    }));
    const converted = convertRobustRound({ participants, ballots, totalPoints, config });
    if (!converted.zeroWeight && converted.distributedTotal !== converted.totalPoints) {
      fail(`robust converted total ${converted.distributedTotal} does not equal configured ${converted.totalPoints}`);
    }
    rows = converted.rows.map((row) => ({
      round_id: roundId,
      country_code: row.code,
      original_votes: Math.round(row.rawPoints),
      original_voters: row.supporterCount,
      original_rank: null,
      participant_count: converted.participantCount,
      rank_base: null,
      rank_exponent: null,
      rank_factor: null,
      weighted_score: row.weightedScore,
      exact_points: row.exactPoints,
      floored_points: row.flooredPoints,
      decimal_remainder: row.decimalRemainder,
      remainder_bonus: row.remainderBonus,
      final_points: row.finalPoints,
      total_points_to_distribute: converted.totalPoints,
      calculation_version: version,
      calculated_at: calculatedAt,
      calculated_by_username: "s14-local-verifier",
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
      calculation_config: converted.config,
    }));
    distributedTotal = converted.distributedTotal;
    zeroWeight = converted.zeroWeight;

    const influence = analyseRobustInfluence({ participants, ballots, totalPoints, config });
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
    if (influenceRows.length) {
      const { error: influenceError } = await tv.from("round_influence_results").insert(influenceRows);
      if (influenceError) fail(influenceError.message);
    }
  } else {
    const input: ConversionInput[] = participants.map((code) => ({
      code,
      originalVotes: tally.get(code)?.points ?? 0,
      originalVoters: tally.get(code)?.voters.size ?? 0,
    }));
    const converted = convertRound(input, totalPoints, Number(round.rank_exponent ?? 1.33));
    if (!converted.zeroWeight && converted.distributedTotal !== converted.totalPoints) {
      fail(`converted total ${converted.distributedTotal} does not equal configured ${converted.totalPoints}`);
    }
    rows = converted.rows.map((row) => ({
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
      total_points_to_distribute: converted.totalPoints,
      calculation_version: version,
      calculated_at: calculatedAt,
      calculated_by_username: "s14-local-verifier",
      engine_version: CALC_ENGINE_VERSION,
      calculation_config: { rankExponent: converted.rankExponent },
    }));
    distributedTotal = converted.distributedTotal;
    zeroWeight = converted.zeroWeight;
  }

  const { error: resultInsertError } = await tv.from("round_results").insert(rows);
  if (resultInsertError) fail(resultInsertError.message);

  const { error: calculateUpdateError } = await tv
    .from("rounds")
    .update({
      results_status: "calculated",
      calculation_version: version,
      calculated_at: calculatedAt,
      calculated_by_username: "s14-local-verifier",
      calc_participant_codes: participants,
      results_outdated: false,
    })
    .eq("id", roundId);
  if (calculateUpdateError) fail(calculateUpdateError.message);

  const storedTotal = rows.reduce((sum, row) => sum + row.final_points, 0);
  if (!zeroWeight && storedTotal !== totalPoints) {
    fail(`stored converted total ${storedTotal} does not equal ${totalPoints}`);
  }
  if (storedTotal !== distributedTotal) {
    fail(`stored converted total ${storedTotal} does not equal engine output ${distributedTotal}`);
  }

  const { error: publishUpdateError } = await tv
    .from("rounds")
    .update({ results_status: "published" })
    .eq("id", roundId);
  if (publishUpdateError) fail(publishUpdateError.message);

  // Publication's canonical database trigger owns the projection. Read back
  // exact identities and points; never create a second browser/fixture writer.
  const { data: canonicalVotes, error: canonicalReadError } = await db
    .from("televote_votes")
    .select("country_id,points")
    .eq("show_id", showId);
  if (canonicalReadError) fail(canonicalReadError.message);
  const expectedVotes = rows.map((row) => ({
    country_id: countryByCode.get(row.country_code)!,
    points: row.final_points,
  }));
  const canonicalCount = assertS14TelevoteReadback(expectedVotes, canonicalVotes ?? []);

  process.stdout.write(`${JSON.stringify({
    roundId,
    showId,
    engineVersion,
    calculationVersion: version,
    ballotCount: accepted.length,
    participantCount: participants.length,
    distributedTotal: storedTotal,
    canonicalVoteRows: canonicalCount,
  })}\n`);
}

await main();
