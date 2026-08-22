import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type {
  JuryVote,
  Participant,
  ResultRow,
  Televote,
} from "./data";

// Re-export the normal data API. The archive hooks below deliberately override
// the same names from ./data so every public analytics surface gets the complete,
// current archive rather than Supabase's first 1,000 rows.
export * from "./data";

const PAGE_SIZE = 1000;

type ArchiveTable =
  | "jury_votes"
  | "televote_votes"
  | "results"
  | "participants";

type CompleteArchiveOptions = {
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

  // Stable ordering is essential when paging. Without it, rows can move between
  // pages while votes are being saved and the archive can silently miss or
  // duplicate data.
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

function useArchiveRealtime(
  table: ArchiveTable,
  queryKey: string,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const instanceId = useId().replace(/:/g, "");

  useEffect(() => {
    if (!enabled) return;

    // Supabase channels are stateful. Giving each mounted archive observer its
    // own topic prevents one consumer from replacing or removing another
    // consumer's subscription when both need the same archive table.
    const channel = supabase
      .channel(`solaris-${table}-archive-live-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => {
          void queryClient.invalidateQueries({ queryKey: [queryKey] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, instanceId, queryClient, queryKey, table]);
}

function useCompleteArchive<T>(
  table: ArchiveTable,
  queryKey: string,
  options?: CompleteArchiveOptions,
) {
  useArchiveRealtime(table, queryKey, options?.realtime ?? true);

  return useQuery({
    queryKey: [queryKey, "all"],
    queryFn: () => fetchCompleteArchive<T>(table),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
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
