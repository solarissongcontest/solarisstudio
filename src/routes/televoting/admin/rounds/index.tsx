import { createFileRoute } from "@tanstack/react-router";

import { useAdminContext } from "@/components/admin/AdminContext";
import { VotingRoundsView } from "@/components/televoting/VotingRoundsView";

export const Route = createFileRoute("/televoting/admin/rounds/")({
  head: () => ({
    meta: [
      { title: "Voting Rounds — Solaris Organizer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: VotingRoundsIndexRoute,
});

function VotingRoundsIndexRoute() {
  const { editionId } = useAdminContext();

  // Preserve the original edition reset while allowing the parent layout
  // to render child routes such as /rounds/$id/entries via <Outlet />.
  return <VotingRoundsView key={editionId ?? "unscoped"} />;
}
