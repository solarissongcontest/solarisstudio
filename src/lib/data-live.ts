import { useEffect } from "react";
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

function useArchiveRealtime(table: ArchiveTable, queryKey: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel(`solaris-${table}-archive-live`)
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
  }, [queryClient, queryKey, table]);
}

function useCompleteArchive<T>(
  table: ArchiveTable,
  queryKey: string,
) {
  useArchiveRealtime(table, queryKey);

  return useQuery({
    queryKey: [queryKey, "all"],
    queryFn: () => fetchCompleteArchive<T>(table),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

export function useAllJuryVotes() {
  return useCompleteArchive<JuryVote>("jury_votes", "jury_votes");
}

export function useAllTelevotes() {
  return useCompleteArchive<Televote>("televote_votes", "televote_votes");
}

export function useAllResults() {
  return useCompleteArchive<ResultRow>("results", "results");
}

export function useAllParticipants() {
  return useCompleteArchive<Participant>("participants", "participants");
}
