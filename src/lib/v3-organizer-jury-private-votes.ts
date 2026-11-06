import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { JuryVote, Voter } from "@/lib/data";

type OrganizerJuryScope = {
  actorId: string | null | undefined;
  editionId: string | null | undefined;
  showId: string | null | undefined;
};

// The generic show-level Jury hook is used by public and historical consumers.
// The Organizer editor must not reuse its query key for unpublished vote rows.
export function useOrganizerJuryVotes({ actorId, editionId, showId }: OrganizerJuryScope) {
  return useQuery<JuryVote[]>({
    queryKey: ["jury_votes", "organizer-private", actorId, editionId, showId],
    enabled: Boolean(actorId && editionId && showId),
    queryFn: async () => {
      if (!actorId || !editionId || !showId) {
        throw new Error("Organizer Jury vote reads require authenticated actor, edition and show");
      }
      // The user's Supabase session and database RLS remain the authoritative
      // read boundary. Account-specific cache partitioning is additional defense.
      const { data, error } = await supabase
        .from("jury_votes")
        .select("*")
        .eq("edition_id", editionId)
        .eq("show_id", showId);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        receiving_country_id: row.receiving_country_id ?? row.receiving_entity_id ?? "",
      })) as JuryVote[];
    },
    gcTime: 0,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Never reuse the public show-level voter-roster query for Organizer drafts. */
export function useOrganizerShowVoters({ actorId, editionId, showId }: OrganizerJuryScope) {
  return useQuery<Voter[]>({
    queryKey: ["voters", "organizer-private", actorId, editionId, showId],
    enabled: Boolean(actorId && editionId && showId),
    queryFn: async () => {
      if (!actorId || !editionId || !showId) {
        throw new Error("Organizer Jury roster reads require authenticated actor, edition and show");
      }
      const { data, error } = await supabase
        .from("voters")
        .select("*")
        .eq("edition_id", editionId)
        .eq("show_id", showId)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as Voter[];
    },
    gcTime: 0,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
