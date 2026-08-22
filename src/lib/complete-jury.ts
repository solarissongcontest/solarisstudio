import { useAllJuryVotes } from "@/lib/data";

/**
 * Compatibility alias for relationship pages. The canonical all-jury hook now
 * performs the complete paginated archive fetch itself, keeps the cache shared
 * across analytics surfaces, and invalidates/refetches when votes change.
 */
export function useCompleteJuryArchive() {
  return useAllJuryVotes();
}
