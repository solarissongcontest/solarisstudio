import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { WorldCountryInternational, WorldCountryRolloutGate } from "@/components/world/WorldCountryInternational";

export const Route = createFileRoute("/world/countries/$code")({
  head: ({ params }) => ({
    meta: [
      { title: params.code.toUpperCase() + " — International — Terra Solaris — Solaris Studio" },
      { name: "description", content: "Public institutional memberships and international affiliations of a Terra Solaris country." },
    ],
    links: [{
      rel: "canonical",
      href: "https://studio.solaris-song-contest.workers.dev/world/countries/" + encodeURIComponent(params.code),
    }],
  }),
  component: WorldCountryRoute,
});

function WorldCountryRoute() {
  const { code } = Route.useParams();
  return <WorldCountryRolloutGate><AppShell><WorldCountryInternational code={code} /></AppShell></WorldCountryRolloutGate>;
}
