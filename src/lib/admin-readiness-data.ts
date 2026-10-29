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

/**
 * Keep the Control Room readiness reader least-data by construction.
 *
 * These projections intentionally mirror the public TypeScript row shapes the
 * readiness calculator already consumes. Using explicit columns prevents a new
 * or heavyweight database column from silently joining every Control Room
 * readiness fetch merely because the table schema grew.
 */
const READINESS_SELECTS = {
  participants:
    "id,edition_id,show_id,country_id,contest_entity_id,artist,song,running_order,semi_final,qualified,notes",
  voters:
    "id,edition_id,show_id,country_id,contest_entity_id,name,kind,flag_image,accent_color,sort_order,created_at",
  jury_votes:
    "id,edition_id,show_id,voter_country_id,voter_id,voter_entity_id,receiving_country_id,receiving_entity_id,points",
  jury_ballot_statuses:
    "id,edition_id,show_id,voter_id,voter_country_id,voter_entity_id,status,note",
  televote_votes:
    "id,edition_id,show_id,country_id,contest_entity_id,points",
  results:
    "id,edition_id,show_id,country_id,contest_entity_id,jury_points,televote_points,total_points,final_rank",
} as const;

type ReadinessTable = keyof typeof READINESS_SELECTS;

async function pagedRows<T>(table: ReadinessTable, editionId: string): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await (supabase as any)
      .from(table)
      .select(READINESS_SELECTS[table])
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

export type JuryBallotStatus = {
  id: string;
  edition_id: string;
  show_id: string;
  voter_id: string | null;
  voter_country_id: string | null;
  voter_entity_id: string | null;
  status: "did_not_vote";
  note: string | null;
};

export type AdminReadinessData = {
  participants: Participant[];
  voters: Voter[];
  juryVotes: JuryVote[];
  juryBallotStatuses: JuryBallotStatus[];
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
          juryBallotStatuses: [],
          televotes: [],
          results: [],
        };
      }

      const [participants, voters, juryVotes, juryBallotStatuses, televotes, results] = await Promise.all([
        pagedRows<Participant>("participants", editionId),
        pagedRows<Voter>("voters", editionId),
        pagedRows<JuryVote>("jury_votes", editionId),
        pagedRows<JuryBallotStatus>("jury_ballot_statuses", editionId),
        pagedRows<Televote>("televote_votes", editionId),
        pagedRows<ResultRow>("results", editionId),
      ]);

      return {
        participants,
        voters,
        juryVotes,
        juryBallotStatuses,
        televotes,
        results,
      };
    },
    staleTime: 30_000,
    gcTime: 5 * 60 * 1000,
  });
}
