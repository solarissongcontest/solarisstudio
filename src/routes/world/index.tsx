import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { WorldDirectoryScreen } from "@/components/world/WorldPublicScreens";

export const Route = createFileRoute("/world/")({
  head: () => ({
    meta: [
      { title: "Terra Solaris World — Solaris Studio" },
      { name: "description", content: "Explore official Terra Solaris international organizations, institutions and memberships." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world" }],
  }),
  component: WorldPage,
});

function WorldPage() {
  return <AppShell><WorldDirectoryScreen /></AppShell>;
}
