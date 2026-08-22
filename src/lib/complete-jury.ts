import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { JuryVote } from "@/lib/data";

const PAGE_SIZE = 1000;

async function fetchCompleteJuryArchive(): Promise<JuryVote[]> {
  const rows: JuryVote[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await (supabase.from("jury_votes") as any)
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const page = ((data ?? []) as any[]).map((row) => ({
      ...row,
      receiving_country_id:
        row.receiving_country_id ?? row.receiving_entity_id ?? "",
    })) as JuryVote[];

    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

/**
 * The normal generic table loader performs one PostgREST request. Supabase caps
 * that response at 1,000 rows, while the jury archive is already several times
 * larger. Relationship analytics therefore need a deliberately paginated
 * archive fetch so recent editions are never silently dropped.
 */
export function useCompleteJuryArchive() {
  return useQuery({
    queryKey: ["jury_votes", "complete-archive"],
    queryFn: fetchCompleteJuryArchive,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
