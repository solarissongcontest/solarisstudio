import { createFileRoute } from "@tanstack/react-router";

import { VotingRoundsView } from "@/components/televoting/VotingRoundsView";

export const Route = createFileRoute("/televoting/admin/rounds")({
  head: () => ({
    meta: [
      { title: "Voting Rounds — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VotingRoundsView,
});
