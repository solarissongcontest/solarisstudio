import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldOrganizationScreen } from "@/components/world/WorldOrganizationScreen";

export const Route = createFileRoute("/world/organizations/$slug/")({
  head: ({ params }) => ({
    meta: [
      { title: "Organization — Terra Solaris — Solaris Studio" },
      { name: "description", content: "Public institution identity, leadership and membership from canonical Terra Solaris records." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world/organizations/" + encodeURIComponent(params.slug) }],
  }),
  component: WorldOrganizationOverviewRoute,
});

function WorldOrganizationOverviewRoute() {
  const { slug } = Route.useParams();
  return (
    <AppShell>
      <WorldOrganizationScreen slug={slug} section="overview" />
    </AppShell>
  );
}
