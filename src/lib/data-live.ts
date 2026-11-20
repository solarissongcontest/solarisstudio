import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { solarisQueryPolicy } from "./app-query-policy";
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
const ARCHIVE_STALE_TIME = 60 * 60 * 1000;

const ARCHIVE_SELECTS = {
  jury_votes:
    "id,edition_id,show_id,voter_country_id,voter_id,voter_entity_id,receiving_country_id,receiving_entity_id,points",
  televote_votes:
    "id,edition_id,show_id,country_id,contest_entity_id,points",
  results:
    "id,edition_id,show_id,country_id,contest_entity_id,jury_points,televote_points,total_points,final_rank",
  participants:
    "id,edition_id,show_id,country_id,contest_entity_id,artist,song,running_order,semi_final,qualified,notes",
} as const;

type ArchiveTable = keyof typeof ARCHIVE_SELECTS;

export type CompleteArchiveOptions = {
  /**
   * Kept for API compatibility. Archive Realtime is intentionally disabled.
   * Live show/result surfaces have their own narrowly scoped refresh logic.
   */
  realtime?: boolean;
  /**
   * Lets mobile reading surfaces defer the expensive full archive until after
   * first meaningful paint. Critical/live routes should normally leave this on.
   */
  enabled?: boolean;
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
      .select(ARCHIVE_SELECTS[table])
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
  options?: CompleteArchiveOptions,
) {
  return useQuery({
    ...solarisQueryPolicy("cold"),
    queryKey: [queryKey, "all"],
    queryFn: () => fetchCompleteArchive<T>(table),
    enabled: options?.enabled ?? true,
    // Historical archives are larger than normal cold data. Keep them fresh
    // for an hour while still inheriting cold focus/reconnect semantics.
    staleTime: ARCHIVE_STALE_TIME,
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
