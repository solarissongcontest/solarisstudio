import { createFileRoute } from "@tanstack/react-router";
import { WorldOrganizationPage, WorldPublicGate } from "@/components/world/WorldPublic";

type WorldSection = "overview" | "leadership" | "members";

export const Route = createFileRoute("/world/organizations/$slug")({
  validateSearch: (search: Record<string, unknown>): { tab: WorldSection } => ({
    tab: search.tab === "leadership" || search.tab === "members" ? search.tab : "overview",
  }),
  head: ({ params }) => ({
    meta: [
      { title: params.slug.toUpperCase() + " — Terra Solaris" },
      { name: "description", content: "Published institutional identity, leadership and membership in Terra Solaris." },
    ],
    links: [{
      rel: "canonical",
      href: "https://studio.solaris-song-contest.workers.dev/world/organizations/" + encodeURIComponent(params.slug),
    }],
  }),
  component: OrganizationRoute,
});

function OrganizationRoute() {
  const { slug } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WorldPublicGate>
      <WorldOrganizationPage
        slug={slug}
        view={tab}
        onViewChange={(next) => void navigate({ search: { tab: next }, replace: true })}
      />
    </WorldPublicGate>
  );
}
