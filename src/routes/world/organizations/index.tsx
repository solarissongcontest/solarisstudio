import { createFileRoute } from "@tanstack/react-router";
import { WorldDirectory, WorldPublicGate } from "@/components/world/WorldPublic";

export const Route = createFileRoute("/world/organizations/")({
  head: () => ({
    meta: [
      { title: "Organizations — Terra Solaris" },
      { name: "description", content: "Find public GUARD, UNITY and recognized Terra Solaris institutional profiles." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world/organizations" }],
  }),
  component: WorldDirectoryRoute,
});

function WorldDirectoryRoute() {
  return <WorldPublicGate verifyOnMount><WorldDirectory /></WorldPublicGate>;
}
