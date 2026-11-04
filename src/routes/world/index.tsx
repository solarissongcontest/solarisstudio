import { createFileRoute } from "@tanstack/react-router";
import { WorldLanding, WorldPublicGate } from "@/components/world/WorldPublic";

export const Route = createFileRoute("/world/")({
  head: () => ({
    meta: [
      { title: "Terra Solaris — Solaris Studio" },
      { name: "description", content: "Explore the public institutions and countries of Terra Solaris." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world" }],
  }),
  component: WorldLandingRoute,
});

function WorldLandingRoute() {
  return <WorldPublicGate><WorldLanding /></WorldPublicGate>;
}
