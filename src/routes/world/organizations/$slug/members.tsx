import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { WorldOrganizationScreen } from "@/components/world/WorldOrganizationScreen";

export const Route = createFileRoute("/world/organizations/$slug/members")({
  head: ({ params }) => ({
    meta: [
      { title: "Member Countries — Terra Solaris — Solaris Studio" },
      { name: "description", content: "Public membership and representation records for an international Terra Solaris organization." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world/organizations/" + encodeURIComponent(params.slug) + "/members" }],
  }),
  component: WorldOrganizationMembersRoute,
});

function WorldOrganizationMembersRoute() {
  const { slug } = Route.useParams();
  return (
    <AppShell>
      <WorldOrganizationScreen slug={slug} section="members" />
    </AppShell>
  );
}
