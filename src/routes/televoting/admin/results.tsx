import { createFileRoute } from "@tanstack/react-router";

import { VotingResultsWorkspace } from "@/components/televoting/VotingResultsWorkspace";

export const Route = createFileRoute("/televoting/admin/results")({
  head: () => ({
    meta: [
      { title: "Televote Results — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VotingResultsWorkspace,
});
