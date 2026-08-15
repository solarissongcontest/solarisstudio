import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  JuryVote,
  Participant,
  ResultRow,
  Televote,
  Voter,
} from "@/lib/data";

const PAGE_SIZE = 500;

async function pagedRows<T>(table: string, editionId: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select("*")
      .eq("edition_id", editionId)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export type AdminReadinessData = {
  participants: Participant[];
  voters: Voter[];
  juryVotes: JuryVote[];
  televotes: Televote[];
  results: ResultRow[];
};

/**
 * Load only the currently selected edition.
 *
 * A missing edition ID means the admin context has not resolved yet, so the query
 * stays disabled. It must never be interpreted as "load all historical contests".
 */
export function useAdminReadinessData(editionId?: string | null) {
  return useQuery({
    enabled: !!editionId,
    queryKey: ["admin-readiness-data", editionId ?? "pending"],
    queryFn: async (): Promise<AdminReadinessData> => {
      if (!editionId) {
        return {
          participants: [],
          voters: [],
          juryVotes: [],
          televotes: [],
          results: [],
        };
      }

      const [participants, voters, juryVotes, televotes, results] = await Promise.all([
        pagedRows<Participant>("participants", editionId),
        pagedRows<Voter>("voters", editionId),
        pagedRows<JuryVote>("jury_votes", editionId),
        pagedRows<Televote>("televote_votes", editionId),
        pagedRows<ResultRow>("results", editionId),
      ]);

      return {
        participants,
        voters,
        juryVotes,
        televotes,
        results,
      };
    },
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  });
}
