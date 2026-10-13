import { createFileRoute } from "@tanstack/react-router";

import { V3NextInLineRouteGate } from "@/components/v3/V3NextInLineRouteGate";

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
  component: V3NextInLineRouteGate,
});
