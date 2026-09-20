import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  JuryVote,
  Participant,
  ResultRow,
  Televote,
} from "./data";

// Re-export the normal data API. Archive screens still load the complete archive,
// but deliberately do not keep permanent Realtime subscriptions open. On the
// Free plan, repeatedly streaming/invalidation-refetching thousands of historic
// vote rows is expensive egress for data that is almost always immutable.
export * from "./data";

const PAGE_SIZE = 1000;
const ARCHIVE_STALE_TIME = 10 * 60 * 1000;

type ArchiveTable =
  | "jury_votes"
  | "televote_votes"
  | "results"
  | "participants";

type CompleteArchiveOptions = {
  /**
   * Kept for API compatibility. Archive Realtime is intentionally disabled.
   * Live show/result surfaces have their own narrowly scoped refresh logic.
   */
  realtime?: boolean;
};

function canonicaliseArchiveRow(table: ArchiveTable, row: any) {
  if (table === "jury_votes") {
    return {
      ...row,
      receiving_country_id:
        row.receiving_country_id ?? row.receiving_entity_id ?? "",
    };
  }

  return {
    ...row,
    country_id: row.country_id ?? row.contest_entity_id ?? "",
  };
}

async function fetchCompleteArchive<T>(table: ArchiveTable): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await (supabase.from(table) as any)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = ((data ?? []) as any[]).map((row) =>
      canonicaliseArchiveRow(table, row),
    ) as T[];

    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

function useCompleteArchive<T>(
  table: ArchiveTable,
  queryKey: string,
  _options?: CompleteArchiveOptions,
) {
  return useQuery({
    queryKey: [queryKey, "all"],
    queryFn: () => fetchCompleteArchive<T>(table),
    // Historical archives are large (jury_votes alone is thousands of rows).
    // Cache them across navigation/focus/reconnect instead of redownloading.
    staleTime: ARCHIVE_STALE_TIME,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useAllJuryVotes(options?: CompleteArchiveOptions) {
  return useCompleteArchive<JuryVote>("jury_votes", "jury_votes", options);
}

export function useAllTelevotes(options?: CompleteArchiveOptions) {
  return useCompleteArchive<Televote>("televote_votes", "televote_votes", options);
}

export function useAllResults(options?: CompleteArchiveOptions) {
  return useCompleteArchive<ResultRow>("results", "results", options);
}

export function useAllParticipants(options?: CompleteArchiveOptions) {
  return useCompleteArchive<Participant>("participants", "participants", options);
}
