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

/** Invalid and empty RPC numerics must never become a real score or rank. */
const rpcNumber = (value: unknown): number =>
  typeof value === "number" || (typeof value === "string" && value.trim())
    ? Number(value)
    : NaN;

export function normalizePredictionLeagueStandings(
  rows: readonly PredictionLeagueStandingRow[],
): PredictionLeagueStanding[] {
  return rows.map((row) => {
    const score = rpcNumber(row.score);
    const rounds = rpcNumber(row.rounds);
    const position = rpcNumber(row.position);
    if (
      !row.profileId ||
      typeof row.displayName !== "string" ||
      !row.displayName.trim() ||
      !Number.isFinite(score) ||
      score < 0 ||
      !Number.isSafeInteger(rounds) ||
      rounds < 1 ||
      !Number.isSafeInteger(position) ||
      position < 1
    ) {
      throw new Error("Invalid canonical Prediction League standing.");
    }
    return { ...row, score, rounds, position };
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
