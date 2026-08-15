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

async function pagedRows<T>(table: string, editionId?: string | null): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    let query: any = (supabase as any)
      .from(table)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (editionId) {
      query = query.eq("edition_id", editionId);
    }

    const { data, error } = await query;

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
 * Readiness pages can span hundreds or thousands of vote rows. Supabase/PostgREST
 * limits a single response, so these datasets must be paginated rather than fetched
 * with the normal one-shot "all" hooks.
 *
 * Pass an edition ID for the Control Room. Omit it for cross-edition views such as
 * Action Centre.
 */
export function useAdminReadinessData(editionId?: string | null) {
  return useQuery({
    queryKey: ["admin-readiness-data", editionId ?? "all"],
    queryFn: async (): Promise<AdminReadinessData> => {
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
    staleTime: 15_000,
  });
}
