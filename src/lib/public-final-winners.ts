import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { solarisQueryPolicy } from "@/lib/app-query-policy";

export type PublicFinalWinner = {
  show_id: string;
  country_id: string;
  final_rank: number;
  total_points: number;
};

/**
 * Editions need only first place in already published finals.
 * Never read the global results archive (or votes) just to label a directory.
 * The caller supplies ONLY final Show IDs whose edition, show and result
 * publication gates are all established from canonical public data.
 */
export function usePublicFinalWinners(publishedFinalShowIds: readonly string[]) {
  const showIds = [...new Set(publishedFinalShowIds.filter(Boolean))].sort();
  return useQuery({
    ...solarisQueryPolicy("cold"),
    queryKey: ["published-edition-final-winners", showIds],
    enabled: showIds.length > 0,
    queryFn: async (): Promise<PublicFinalWinner[]> => {
      // Do not silently truncate an unexpectedly huge query.
      if (showIds.length > 500) throw new Error("Public final-winner lookup exceeds its finite directory budget");
      const { data, error } = await supabase
        .from("results")
        .select("show_id,country_id,contest_entity_id,final_rank,total_points")
        .in("show_id", showIds)
        .eq("final_rank", 1)
        .limit(500);

      if (error) throw error;
      return (data ?? [])
        .filter((row) => row.show_id && (row.country_id || row.contest_entity_id) && row.final_rank === 1)
        .map((row) => ({
          show_id: row.show_id!,
          country_id: (row.country_id || row.contest_entity_id)!,
          final_rank: row.final_rank!,
          total_points: row.total_points,
        }));
    },
  });
}
