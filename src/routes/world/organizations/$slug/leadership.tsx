import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldOrganizationScreen } from "@/components/world/WorldOrganizationScreen";

export const Route = createFileRoute("/world/organizations/$slug/leadership")({
  head: ({ params }) => ({
    meta: [
      { title: "Institutional Leadership — Terra Solaris — Solaris Studio" },
      { name: "description", content: "Current public institutional office holders and constitutional term information." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world/organizations/" + encodeURIComponent(params.slug) + "/leadership" }],
  }),
  component: WorldOrganizationLeadershipRoute,
});

function WorldOrganizationLeadershipRoute() {
  const { slug } = Route.useParams();
  return (
    <AppShell>
      <WorldOrganizationScreen slug={slug} section="leadership" />
    </AppShell>
  );
}
