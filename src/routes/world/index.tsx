import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldLanding } from "@/components/world/WorldDirectory";

export const Route = createFileRoute("/world/")({
  head: () => ({
    meta: [
      { title: "Terra Solaris — World — Solaris Studio" },
      { name: "description", content: "Explore the public organizations, countries and institutions of Terra Solaris." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world" }],
  }),
  component: WorldPage,
});

function WorldPage() {
  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl pb-10">
        <WorldLanding />
      </main>
    </AppShell>
  );
}
