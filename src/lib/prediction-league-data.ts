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

export function normalizePredictionLeagueStandings(
  rows: readonly PredictionLeagueStandingRow[],
): PredictionLeagueStanding[] {
  return rows.map((row) => {
    const result = {
      ...row,
      score: Number(row.score),
      rounds: Number(row.rounds),
      position: Number(row.position),
    };
    if (
      !row.profileId ||
      !row.displayName?.trim() ||
      [row.score, row.rounds, row.position].some(
        (value) => typeof value !== "number" && (typeof value !== "string" || !value.trim()),
      ) ||
      !Number.isFinite(result.score) ||
      result.score < 0 ||
      !Number.isSafeInteger(result.rounds) ||
      result.rounds < 1 ||
      !Number.isSafeInteger(result.position) ||
      result.position < 1
    ) {
      throw Error("Invalid canonical Prediction League standing.");
    }
    return result;
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
