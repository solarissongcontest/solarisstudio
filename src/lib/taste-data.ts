import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppDatabase, FanTasteBallotRow } from "@/integrations/supabase/app-types";
import { supabase as baseSupabase } from "@/integrations/supabase/client";

import { missingEngagementSchema } from "./prediction-data";

const supabase = baseSupabase as unknown as SupabaseClient<AppDatabase>;

export function useTasteBallots(profileId?: string) {
  return useQuery({
    enabled: Boolean(profileId),
    queryKey: ["fan-taste-ballots", profileId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fan_taste_ballots")
        .select("*")
        .eq("profile_id", profileId!)
        .order("updated_at", { ascending: false });

      if (missingEngagementSchema(error)) {
        return {
          schemaReady: false,
          ballots: [] as FanTasteBallotRow[],
        };
      }

      if (error) throw error;

      return {
        schemaReady: true,
        ballots: (data ?? []) as FanTasteBallotRow[],
      };
    },
  });
}

export function useSaveTasteBallot(profileId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      showId,
      ranking,
    }: {
      showId: string;
      ranking: string[];
    }) => {
      if (!profileId) {
        throw new Error("Sign in to save your Taste DNA ballot.");
      }

      const { error: profileError } = await supabase
        .from("fan_profiles")
        .upsert({ id: profileId }, { onConflict: "id" });

      if (profileError) throw profileError;

      const { data, error } = await supabase
        .from("fan_taste_ballots")
        .upsert(
          {
            profile_id: profileId,
            show_id: showId,
            ranking,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "profile_id,show_id" },
        )
        .select("*")
        .single();

      if (error) throw error;
      return data as FanTasteBallotRow;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fan-taste-ballots", profileId] });
    },
  });
}

export function useDeleteTasteBallot(profileId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (showId: string) => {
      if (!profileId) return;

      const { error } = await supabase
        .from("fan_taste_ballots")
        .delete()
        .eq("profile_id", profileId)
        .eq("show_id", showId);

      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["fan-taste-ballots", profileId] });
    },
  });
}
