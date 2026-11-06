import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export type PredictionLeagueStanding = {
  profileId: string;
  displayName: string;
  score: number;
  rounds: number;
  position: number;
  lastScoredAt: string | null;
};

type PredictionLeagueStandingRow = Omit<
  PredictionLeagueStanding,
  "score" | "rounds" | "position"
> & {
  score: number | string;
  rounds: number | string;
  position: number | string;
};

/**
 * The leaderboard RPC owns scoring, publication and ordering. This adapter
 * refuses malformed read projections instead of rendering invented positions
 * or NaN points as if they were authoritative contest data.
 */
export function normalizePredictionLeagueStandings(
  rows: readonly PredictionLeagueStandingRow[],
): PredictionLeagueStanding[] {
  return rows.map((row) => {
    const score = Number(row.score);
    const rounds = Number(row.rounds);
    const position = Number(row.position);
    if (
      !row.profileId ||
      typeof row.displayName !== "string" ||
      !row.displayName.trim() ||
      (typeof row.score === "string" && !row.score.trim()) ||
      !Number.isFinite(score) ||
      score < 0 ||
      !Number.isSafeInteger(rounds) ||
      rounds < 1 ||
      !Number.isSafeInteger(position) ||
      position < 1
    ) {
      throw new Error("Public Prediction League standings contain an invalid canonical row.");
    }
    return {
      profileId: row.profileId,
      displayName: row.displayName,
      score,
      rounds,
      position,
      lastScoredAt: row.lastScoredAt,
    };
  });
}

export function usePredictionLeagueStandings(
  enabled: boolean,
  editionId: string | null = null,
) {
  return useQuery({
    enabled,
    queryKey: ["prediction-league", editionId ?? "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("prediction_league_leaderboard", {
        _edition_id: editionId,
      });
      if (error) throw error;

      return normalizePredictionLeagueStandings((data ?? []) as PredictionLeagueStandingRow[]);
    },
    staleTime: 30_000,
    retry: false,
  });
}
