import { createFileRoute } from "@tanstack/react-router";

import { useAdminContext } from "@/components/admin/AdminContext";
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

  // VotingRoundsView owns several draft and confirmation sheets. Remount it
  // when global Organizer scope changes so a rename/delete/live-status command
  // prepared for edition A cannot survive into edition B.
  return <VotingRoundsView key={editionId ?? "unscoped"} />;
}
