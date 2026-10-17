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

      return ((data ?? []) as PredictionLeagueStandingRow[]).map((row) => ({
        ...row,
        score: Number(row.score),
        rounds: Number(row.rounds),
        position: Number(row.position),
      }));
    },
    staleTime: 30_000,
    retry: false,
  });
}
