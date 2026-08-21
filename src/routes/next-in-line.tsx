import { createFileRoute } from "@tanstack/react-router";

import { NextInLineCompetition } from "@/components/NextInLineCompetition";

export const Route = createFileRoute("/next-in-line")({
  head: () => ({
    meta: [
      { title: "Next in Line — Solaris Studio" },
      {
        name: "description",
        content: "The separate Solaris competition for songs that did not win a National Final or were not selected internally by countries already competing in SSC.",
      },
    ],
  }),
  component: NextInLineCompetition,
});
