import { createFileRoute } from "@tanstack/react-router";

import { useAdminContext } from "@/components/admin/AdminContext";
import { VotingRoundsView } from "@/components/televoting/VotingRoundsView";

export const Route = createFileRoute("/televoting/admin/rounds")({
  head: () => ({
    meta: [
      { title: "Voting Rounds — Solaris Organizer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VotingRoundsRoute,
});

function VotingRoundsRoute() {
  const { editionId } = useAdminContext();

  // VotingRoundsView owns draft/rename/delete/status confirmation state. Remount
  // it when Organizer scope changes so commands prepared for edition A cannot
  // survive into edition B after the global edition selector changes.
  return <VotingRoundsView key={editionId ?? "unscoped"} />;
}
