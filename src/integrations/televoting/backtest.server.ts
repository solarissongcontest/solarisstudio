import { requireMergedTelevotingAdminServer } from "@/integrations/televoting/admin-session.server";
import { backtestRound } from "@/integrations/televoting/backtest-math";
import { televotingAdmin } from "@/integrations/televoting/client.server";
import {
  loadMergedConversionParticipants,
  loadMergedConversionRound,
  loadMergedRobustBallots,
} from "@/integrations/televoting/conversion.server";
import { DEFAULT_ROBUST_TELEVOTE_CONFIG } from "@/integrations/televoting/robust-televote-math";

export async function runHistoricalTelevoteBacktestServer(input: {
  roundId?: string | null;
  limit?: number;
}) {
  await requireMergedTelevotingAdminServer();
  let query = televotingAdmin
    .from("rounds")
    .select("id,name,edition_id,status,created_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, Math.trunc(input.limit ?? 30))));
  if (input.roundId) query = query.eq("id", input.roundId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = [];
  for (const source of data ?? []) {
    const roundId = String(source.id);
    const round = await loadMergedConversionRound(roundId);
    const participants = await loadMergedConversionParticipants(roundId);
    if (participants.length < 5) continue;
    const ballots = await loadMergedRobustBallots(roundId, participants);
    if (!ballots.length) continue;
    const totalPoints = Math.max(0, Number(round.total_points_to_distribute || participants.length * 58));
    if (!totalPoints) continue;

    const robustConfig = {
      ballotTotal: DEFAULT_ROBUST_TELEVOTE_CONFIG.ballotTotal,
      ballotExponent: Number(round.ballot_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.ballotExponent),
      breadthFloor: Number(round.breadth_floor ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.breadthFloor),
      breadthExponent: Number(round.breadth_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.breadthExponent),
      supportExponent: Number(round.support_exponent ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.supportExponent),
      rankBoostStrength: Number(round.rank_boost_strength ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.rankBoostStrength),
      rankBoostShape: Number(round.rank_boost_shape ?? DEFAULT_ROBUST_TELEVOTE_CONFIG.rankBoostShape),
    };
    const result = backtestRound({
      participants,
      ballots,
      totalPoints,
      legacyRankExponent: Number(round.rank_exponent ?? 1.33),
      robustConfig,
    });
    rows.push({
      roundId,
      roundName: String(source.name),
      participants: participants.length,
      voters: ballots.length,
      totalPoints,
      storedEngine: round.televote_engine_version,
      ...result,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    rounds: rows,
    summary: {
      roundsAnalysed: rows.length,
      winnerChanges: rows.filter((row) => row.winnerChangedBetweenEngines).length,
      topThreeChanges: rows.filter((row) => row.topThreeChangedBetweenEngines).length,
      averageLegacyTopShare: rows.length ? rows.reduce((sum, row) => sum + row.legacy.topShare, 0) / rows.length : 0,
      averageRobustTopShare: rows.length ? rows.reduce((sum, row) => sum + row.robust.topShare, 0) / rows.length : 0,
      averageLegacyMaxVoterMovement: rows.length ? rows.reduce((sum, row) => sum + row.legacy.maxSingleVoterPointMovement, 0) / rows.length : 0,
      averageRobustMaxVoterMovement: rows.length ? rows.reduce((sum, row) => sum + row.robust.maxSingleVoterPointMovement, 0) / rows.length : 0,
    },
  };
}
