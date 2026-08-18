import { createFileRoute } from "@tanstack/react-router";

import { VotingResultsView } from "@/components/televoting/VotingResultsView";

export const Route = createFileRoute("/televoting/admin/results")({
  head: () => ({
    meta: [
      { title: "Televote Results — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VotingResultsView,
});
