import { createFileRoute } from "@tanstack/react-router";

import { useAdminContext } from "@/components/admin/AdminContext";
import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";
import { VotingRoundsView } from "@/components/televoting/VotingRoundsView";

export const Route = createFileRoute("/televoting/admin/rounds")({
  head: () => ({
    meta: [
      { title: "Voting Rounds — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VotingRoundsRoute,
});

function VotingRoundsRoute() {
  const { editionId } = useAdminContext();
  const actorId = useAuthenticatedUser().id;

  // VotingRoundsView owns draft/rename/delete/status confirmation state. Remount
  // it when Organizer scope or authenticated actor changes so commands prepared
  // for another edition or account cannot survive in a new user's workspace.
  return <VotingRoundsView key={`${actorId}:${editionId ?? "unscoped"}`} />;
}
