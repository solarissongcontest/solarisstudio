import { useAllJuryVotes } from "@/lib/data-live";

/**
 * Compatibility alias for relationship pages. This deliberately uses the
 * paginated live archive hook so relationship analytics are never limited to
 * Supabase/PostgREST's first page of jury rows and refresh when votes change.
 */
export function useCompleteJuryArchive() {
  return useAllJuryVotes();
}
