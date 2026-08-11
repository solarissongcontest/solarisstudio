import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

import type { PredictionItem, PredictionType } from "./predictions";

export type PredictionRound = {
  id: string;
  show_id: string;
  opens_at: string;
  locks_at: string;
  status: "draft" | "open" | "locked" | "scoring" | "scored" | "cancelled";
  prediction_types: PredictionType[];
  scoring_version: string;
  consensus_minimum: number;
};

export type SavedPredictionEntry = {
  id: string;
  round_id: string;
  profile_id: string;
  version: number;
  state: "draft" | "submitted" | "locked" | "scored";
  submitted_at: string | null;
  prediction_items: Array<{
    country_id: string;
    prediction_type: PredictionType;
    rank: number | null;
    confidence: number | null;
  }>;
};

export type PredictionConsensus = {
  ready: boolean;
  sampleSize: number;
  minimum: number;
  items: Record<
    string,
    {
      count: number;
      percentage: number;
    }
  >;
};

type PostgrestLikeError = {
  code?: string;
  message?: string;
};

function missingPredictionSchema(error: PostgrestLikeError | null) {
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    error?.message?.includes("prediction_rounds") === true
  );
}

// The migration and generated database types land together in this change.
// This narrow cast keeps the fallback usable during the short deployment gap
// where Lovable has synced the client bundle but has not applied the new table.
const predictionDatabase = supabase as any;

export function usePredictionRounds(showId?: string) {
  return useQuery({
    queryKey: ["prediction-rounds", showId ?? "all"],
    queryFn: async () => {
      let query = predictionDatabase
        .from("prediction_rounds")
        .select("*")
        .neq("status", "cancelled")
        .order("locks_at", { ascending: true });

      if (showId) {
        query = query.eq("show_id", showId);
      }

      const { data, error } = await query;

      if (missingPredictionSchema(error)) {
        return {
          schemaReady: false,
          rounds: [] as PredictionRound[],
        };
      }

      if (error) throw error;

      return {
        schemaReady: true,
        rounds: (data ?? []) as PredictionRound[],
      };
    },
    staleTime: 30_000,
  });
}

export function useFanSession() {
  return useQuery({
    queryKey: ["fan-session"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error?.name === "AuthSessionMissingError") return null;
      if (error) throw error;
      return data.user ?? null;
    },
    staleTime: 30_000,
  });
}

export function useMyPrediction(roundId?: string, profileId?: string) {
  return useQuery({
    enabled: Boolean(roundId && profileId),
    queryKey: ["my-prediction", roundId, profileId],
    queryFn: async () => {
      const { data, error } = await predictionDatabase
        .from("prediction_entries")
        .select("*, prediction_items(*)")
        .eq("round_id", roundId)
        .eq("profile_id", profileId)
        .maybeSingle();

      if (missingPredictionSchema(error)) return null;
      if (error) throw error;
      return (data as SavedPredictionEntry | null) ?? null;
    },
  });
}

export function usePredictionConsensus(roundId?: string, enabled = false) {
  return useQuery({
    enabled: Boolean(roundId && enabled),
    queryKey: ["prediction-consensus", roundId],
    queryFn: async () => {
      const { data, error } = await predictionDatabase.rpc("prediction_consensus", {
        _round_id: roundId,
      });
      if (error) throw error;
      return data as PredictionConsensus;
    },
    staleTime: 30_000,
  });
}

export function useSubmitPrediction(roundId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: PredictionItem[]) => {
      if (!roundId) throw new Error("Prediction round is unavailable.");

      const payload = items.map((item) => ({
        countryId: item.countryId,
        type: item.type,
        rank: item.rank ?? null,
        confidence: item.confidence ?? null,
      }));
      const { data, error } = await predictionDatabase.rpc("submit_prediction", {
        _round_id: roundId,
        _payload: payload,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-prediction", roundId] }),
        queryClient.invalidateQueries({
          queryKey: ["prediction-consensus", roundId],
        }),
      ]);
    },
  });
}
