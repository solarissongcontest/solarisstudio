import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { WorldCountriesDirectory, WorldCountryRolloutGate } from "@/components/world/WorldCountryInternational";

export const Route = createFileRoute("/world/countries/")({
  head: () => ({
    meta: [
      { title: "World countries — Terra Solaris — Solaris Studio" },
      { name: "description", content: "Browse the countries of Terra Solaris and open their public institutional memberships and international histories." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world/countries" }],
  }),
  component: WorldCountriesRoute,
});

function WorldCountriesRoute() {
  return <AppShell><WorldCountryRolloutGate><WorldCountriesDirectory /></WorldCountryRolloutGate></AppShell>;
}
