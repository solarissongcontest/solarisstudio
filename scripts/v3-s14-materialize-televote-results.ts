import { createClient } from "@supabase/supabase-js";

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
    .select("id,status,total_points_to_distribute,rank_exponent,televote_engine_version,calculation_version,results_status")
    .eq("id", roundId)
    .maybeSingle();
  if (roundError) fail(roundError.message);
  if (!round) fail(`round ${roundId} not found`);
  if (round.status !== "closed") fail(`round ${roundId} must be closed before calculation`);
  if ((round.televote_engine_version ?? CALC_ENGINE_VERSION) !== CALC_ENGINE_VERSION) {
    fail(`Stage 8 adapter supports only the canonical ${CALC_ENGINE_VERSION} engine; got ${round.televote_engine_version}`);
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
  for (const row of voteEntries ?? []) {
    const code = String(row.target_country_code ?? "").trim().toUpperCase();
    const bucket = tally.get(code);
    if (!bucket) fail(`ballot targeted non-participant ${code}`);
    const points = Number(row.points ?? 0);
    if (!Number.isInteger(points) || points < 0) fail(`invalid vote points for ${code}`);
    bucket.points += points;
    const voter = acceptedById.get(String(row.submission_id));
    if (voter) bucket.voters.add(voter);
  }

  const input: ConversionInput[] = participants.map((code) => ({
    code,
    originalVotes: tally.get(code)?.points ?? 0,
    originalVoters: tally.get(code)?.voters.size ?? 0,
  }));
  const converted = convertRound(
    input,
    Number(round.total_points_to_distribute ?? 0),
    Number(round.rank_exponent ?? 1.33),
  );
  if (!converted.zeroWeight && converted.distributedTotal !== converted.totalPoints) {
    fail(`converted total ${converted.distributedTotal} does not equal configured ${converted.totalPoints}`);
  }

  const version = Number(round.calculation_version ?? 0) + 1;
  const calculatedAt = new Date().toISOString();
  const { error: clearResultError } = await tv.from("round_results").delete().eq("round_id", roundId);
  if (clearResultError) fail(clearResultError.message);

  const rows = converted.rows.map((row) => ({
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
  if (!converted.zeroWeight && storedTotal !== converted.totalPoints) {
    fail(`stored converted total ${storedTotal} does not equal ${converted.totalPoints}`);
  }

  const { error: publishUpdateError } = await tv
    .from("rounds")
    .update({ results_status: "published" })
    .eq("id", roundId);
  if (publishUpdateError) fail(publishUpdateError.message);

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
  const resultCodes = rows.map((row) => row.country_code).sort();
  if (JSON.stringify(expectedCodes) !== JSON.stringify(resultCodes)) {
    fail(`published Televote result does not exactly match show ${showId}`);
  }

  const { count: existingVotes, error: existingVoteError } = await db
    .from("televote_votes")
    .select("id", { count: "exact", head: true })
    .eq("show_id", showId);
  if (existingVoteError) fail(existingVoteError.message);
  if ((existingVotes ?? 0) !== 0) fail(`show ${showId} already has canonical Televote vote rows`);

  const canonicalVotes = rows.map((row) => ({
    edition_id: editionId,
    show_id: showId,
    country_id: countryByCode.get(row.country_code),
    points: row.final_points,
  }));
  if (canonicalVotes.some((row) => !row.country_id)) fail(`could not resolve every Televote result country`);
  const { error: canonicalInsertError } = await db.from("televote_votes").insert(canonicalVotes);
  if (canonicalInsertError) fail(canonicalInsertError.message);

  const { count: canonicalCount, error: canonicalCountError } = await db
    .from("televote_votes")
    .select("id", { count: "exact", head: true })
    .eq("show_id", showId);
  if (canonicalCountError) fail(canonicalCountError.message);
  if (canonicalCount !== rows.length) fail(`canonical Televote projection is incomplete for show ${showId}`);

  process.stdout.write(`${JSON.stringify({
    roundId,
    showId,
    calculationVersion: version,
    ballotCount: accepted.length,
    participantCount: participants.length,
    distributedTotal: storedTotal,
    canonicalVoteRows: canonicalCount,
  })}\n`);
}

await main();
