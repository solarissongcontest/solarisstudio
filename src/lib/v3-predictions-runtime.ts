import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { isStudio2FeatureEnabled } from "./studio2-feature-flags";

export type V3PredictionStanding = {
  profileId: string;
  displayName: string;
  score: number;
  rounds: number;
  position: number;
  lastScoredAt: string | null;
};

export function useV3PredictionLeagueEnabled(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["studio2-feature", "prediction_league", "v3"],
    queryFn: () => isStudio2FeatureEnabled("prediction_league"),
    staleTime: 30_000,
    retry: false,
  });
}

export function useV3PredictionLeagueStandings(
  enabled: boolean,
  editionId: string | null = null,
) {
  return useQuery({
    enabled,
    queryKey: ["v3-prediction-league", editionId ?? "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("prediction_league_leaderboard", {
        _edition_id: editionId,
      });
      if (error) throw error;
      return ((data ?? []) as V3PredictionStanding[]).map((row) => ({
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
