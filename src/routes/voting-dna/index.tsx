import { createFileRoute } from "@tanstack/react-router";

import { V3VotingDnaDirectoryScreen } from "@/components/v3/V3VotingDnaDirectoryScreen";

export const Route = createFileRoute("/voting-dna/")({
  head: () => ({
    meta: [
      { title: "Country Voting DNA — Solaris Studio" },
      {
        name: "description",
        content: "Choose a country to explore descriptive voting and result patterns from published SSC data.",
      },
    ],
  }),
  component: V3VotingDnaDirectoryScreen,
});
