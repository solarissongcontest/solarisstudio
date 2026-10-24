import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppDatabase } from "@/integrations/supabase/app-types";
import { supabase as baseSupabase } from "@/integrations/supabase/client";
import {
  missingEngagementSchema,
  type PredictionRound,
} from "@/lib/prediction-data";
import type { PredictionType } from "@/lib/predictions";

const supabase = baseSupabase as unknown as SupabaseClient<AppDatabase>;

const ORGANIZER_PREDICTION_ROUND_PROJECTION =
  "id, show_id, opens_at, locks_at, status, prediction_types, scoring_version, consensus_minimum, created_at, updated_at" as const;

export function useOrganizerPredictionRoundsForShows(
  showIds: string[],
  includeCancelled = false,
) {
  const normalizedShowIds = [...new Set(showIds.filter(Boolean))].sort();

  return useQuery({
    enabled: normalizedShowIds.length > 0,
    queryKey: ["prediction-rounds", "organizer-shows", normalizedShowIds, includeCancelled],
    queryFn: async () => {
      if (!normalizedShowIds.length) {
        return { schemaReady: true, rounds: [] as PredictionRound[] };
      }

      let query = supabase
        .from("prediction_rounds")
        .select(ORGANIZER_PREDICTION_ROUND_PROJECTION)
        .in("show_id", normalizedShowIds)
        .order("locks_at", { ascending: true });

      if (!includeCancelled) query = query.neq("status", "cancelled");

      const { data, error } = await query;
      if (missingEngagementSchema(error)) {
        return { schemaReady: false, rounds: [] as PredictionRound[] };
      }
      if (error) throw error;

      return {
        schemaReady: true,
        rounds: (data ?? []).map((row) => ({
          ...row,
          prediction_types: row.prediction_types as PredictionType[],
        })) as PredictionRound[],
      };
    },
    staleTime: 30_000,
  });
}
