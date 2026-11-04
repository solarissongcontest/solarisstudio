import { createFileRoute } from "@tanstack/react-router";
import { WorldOrganizationPage } from "@/components/v3/V3WorldPublicPages";

export const Route = createFileRoute("/world/organizations/$slug")({
  head: () => ({
    meta: [
      { title: "Institution overview — Terra Solaris" },
      { name: "description", content: "Official public institution profile, leadership and memberships." },
    ],
  }),
  component: OrganizationOverviewRoute,
});

function OrganizationOverviewRoute() {
  const { slug } = Route.useParams();
  return <WorldOrganizationPage slug={slug} section="overview" />;
}
