import { useQuery } from "@tanstack/react-query";

import { loadOrganizerJuryVoteRows, loadOrganizerShowVoterRows } from "@/integrations/organizer/jury-private-reads";
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
      // RLS-authorized I/O stays in integrations. This hook owns cache scope.
      return loadOrganizerJuryVoteRows(editionId, showId);
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
      return loadOrganizerShowVoterRows(editionId, showId);
    },
    gcTime: 0,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
