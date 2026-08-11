import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AppDatabase,
  FanProfileRow,
  PredictionEntryRow,
  PredictionItemRow,
  PredictionRoundRow,
  PredictionScoreRow,
} from "@/integrations/supabase/app-types";
import { supabase as baseSupabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

import type { PredictionItem, PredictionType } from "./predictions";

const supabase = baseSupabase as unknown as SupabaseClient<AppDatabase>;

export type PredictionRound = Omit<PredictionRoundRow, "prediction_types"> & {
  prediction_types: PredictionType[];
};

export type SavedPredictionEntry = PredictionEntryRow & {
  prediction_items: Array<
    Pick<PredictionItemRow, "country_id" | "prediction_type" | "rank" | "confidence">
  >;
  prediction_score: PredictionScoreRow | null;
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

export type SharedPrediction = {
  entryId: string;
  showId: string;
  displayName: string;
  score: number;
  percentile: number | null;
  breakdown: Record<string, number | string | null>;
  scoringVersion: string;
  scoredAt: string;
  items: Array<{
    countryId: string;
    type: PredictionType;
    rank: number | null;
    confidence: number | null;
  }>;
};

type PostgrestLikeError = {
  code?: string;
  message?: string;
};

export function missingEngagementSchema(error: PostgrestLikeError | null) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "42P01" ||
    error?.code === "42703" ||
    error?.code === "PGRST202" ||
    error?.code === "PGRST204" ||
    error?.code === "PGRST205" ||
    message.includes("prediction_") ||
    message.includes("fan_profiles") ||
    message.includes("fan_follows") ||
    message.includes("content_events")
  );
}

function asPredictionRound(row: PredictionRoundRow): PredictionRound {
  return {
    ...row,
    prediction_types: row.prediction_types as PredictionType[],
  };
}

async function attachPredictionDetails(
  entries: PredictionEntryRow[],
): Promise<SavedPredictionEntry[]> {
  if (!entries.length) return [];

  const entryIds = entries.map((entry) => entry.id);
  const [itemsResult, scoresResult] = await Promise.all([
    supabase
      .from("prediction_items")
      .select("entry_id, country_id, prediction_type, rank, confidence")
      .in("entry_id", entryIds),
    supabase.from("prediction_scores").select("*").in("entry_id", entryIds),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (scoresResult.error) throw scoresResult.error;

  const itemsByEntry = new Map<string, SavedPredictionEntry["prediction_items"]>();
  for (const item of itemsResult.data ?? []) {
    const list = itemsByEntry.get(item.entry_id) ?? [];
    list.push({
      country_id: item.country_id,
      prediction_type: item.prediction_type,
      rank: item.rank,
      confidence: item.confidence,
    });
    itemsByEntry.set(item.entry_id, list);
  }

  const scoreByEntry = new Map(
    (scoresResult.data ?? []).map((score) => [score.entry_id, score] as const),
  );

  return entries.map((entry) => ({
    ...entry,
    prediction_items: itemsByEntry.get(entry.id) ?? [],
    prediction_score: scoreByEntry.get(entry.id) ?? null,
  }));
}

export function usePredictionRounds(showId?: string, includeCancelled = false) {
  return useQuery({
    queryKey: ["prediction-rounds", showId ?? "all", includeCancelled],
    queryFn: async () => {
      let query = supabase
        .from("prediction_rounds")
        .select("*")
        .order("locks_at", { ascending: true });

      if (!includeCancelled) query = query.neq("status", "cancelled");

      if (showId) query = query.eq("show_id", showId);

      const { data, error } = await query;
      if (missingEngagementSchema(error)) {
        return { schemaReady: false, rounds: [] as PredictionRound[] };
      }
      if (error) throw error;

      return {
        schemaReady: true,
        rounds: (data ?? []).map(asPredictionRound),
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

export function useFanProfile(profileId?: string) {
  return useQuery({
    enabled: Boolean(profileId),
    queryKey: ["fan-profile", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fan_profiles")
        .select("*")
        .eq("id", profileId!)
        .maybeSingle();
      if (missingEngagementSchema(error)) return null;
      if (error) throw error;
      return data as FanProfileRow | null;
    },
  });
}

export function useSaveFanProfile(profileId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      profile: Pick<FanProfileRow, "display_name" | "visibility" | "leaderboard_opt_in">,
    ) => {
      if (!profileId) throw new Error("Sign in before updating your profile.");
      const { data, error } = await supabase
        .from("fan_profiles")
        .upsert(
          { id: profileId, ...profile, updated_at: new Date().toISOString() },
          { onConflict: "id" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fan-profile", profileId] });
    },
  });
}

export function useMyPrediction(roundId?: string, profileId?: string) {
  return useQuery({
    enabled: Boolean(roundId && profileId),
    queryKey: ["my-prediction", roundId, profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prediction_entries")
        .select("*")
        .eq("round_id", roundId!)
        .eq("profile_id", profileId!)
        .maybeSingle();

      if (missingEngagementSchema(error)) return null;
      if (error) throw error;
      if (!data) return null;
      return (await attachPredictionDetails([data]))[0] ?? null;
    },
  });
}

export function useMyPredictionHistory(profileId?: string) {
  return useQuery({
    enabled: Boolean(profileId),
    queryKey: ["prediction-history", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prediction_entries")
        .select("*")
        .eq("profile_id", profileId!)
        .order("updated_at", { ascending: false });
      if (missingEngagementSchema(error)) return [] as SavedPredictionEntry[];
      if (error) throw error;
      return attachPredictionDetails(data ?? []);
    },
  });
}

export function usePredictionConsensus(roundId?: string, enabled = false) {
  return useQuery({
    enabled: Boolean(roundId && enabled),
    queryKey: ["prediction-consensus", roundId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("prediction_consensus", {
        _round_id: roundId!,
      });
      if (error) throw error;
      return data as unknown as PredictionConsensus;
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
      })) as Json;
      const { data, error } = await supabase.rpc("submit_prediction", {
        _round_id: roundId,
        _payload: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-prediction", roundId] }),
        queryClient.invalidateQueries({ queryKey: ["prediction-history"] }),
        queryClient.invalidateQueries({ queryKey: ["prediction-consensus", roundId] }),
      ]);
    },
  });
}

export function useSavePredictionRound() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      round: Pick<
        PredictionRound,
        | "show_id"
        | "opens_at"
        | "locks_at"
        | "status"
        | "prediction_types"
        | "consensus_minimum"
      >,
    ) => {
      const { data, error } = await supabase
        .from("prediction_rounds")
        .upsert(
          {
            ...round,
            scoring_version: "v1",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "show_id" },
        )
        .select("*")
        .single();
      if (error) throw error;
      return asPredictionRound(data);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prediction-rounds"] });
    },
  });
}

export function useDeletePredictionRound() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roundId: string) => {
      const { error } = await supabase.from("prediction_rounds").delete().eq("id", roundId);
      if (error) throw error;
      return roundId;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["prediction-rounds"] });
    },
  });
}

export function useScorePredictionRound() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (roundId: string) => {
      const { data, error } = await supabase.rpc("score_prediction_round", {
        _round_id: roundId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prediction-rounds"] }),
        queryClient.invalidateQueries({ queryKey: ["prediction-history"] }),
        queryClient.invalidateQueries({ queryKey: ["my-prediction"] }),
      ]);
    },
  });
}

export function useEnablePredictionShare() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const { data, error } = await supabase.rpc("enable_prediction_share", {
        _entry_id: entryId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["prediction-history"] }),
        queryClient.invalidateQueries({ queryKey: ["my-prediction"] }),
      ]);
    },
  });
}

export function useSharedPrediction(token?: string) {
  return useQuery({
    enabled: Boolean(token),
    queryKey: ["shared-prediction", token],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("shared_prediction", {
        _share_token: token!,
      });
      if (error) throw error;
      return data as unknown as SharedPrediction;
    },
  });
}
