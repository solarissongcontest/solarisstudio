import { useQuery } from "@tanstack/react-query";

import {
  usePredictionLeagueStandings,
  type PredictionLeagueStanding,
} from "./prediction-league-data";
import { isStudio2FeatureEnabled } from "./studio2-feature-flags";

export type V3PredictionStanding = PredictionLeagueStanding;

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
  return usePredictionLeagueStandings(enabled, editionId);
}
