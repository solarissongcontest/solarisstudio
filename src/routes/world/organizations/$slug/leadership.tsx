import { createFileRoute } from "@tanstack/react-router";
import { WorldOrganizationPage } from "@/components/v3/V3WorldPublicPages";

export const Route = createFileRoute("/world/organizations/$slug/leadership")({
  head: () => ({
    meta: [
      { title: "Institution leadership — Terra Solaris" },
      { name: "description", content: "Current canonical institutional officeholders and vacant offices." },
    ],
  }),
  component: InstitutionLeadershipRoute,
});

function InstitutionLeadershipRoute() {
  const { slug } = Route.useParams();
  return <WorldOrganizationPage slug={slug} section="leadership" />;
}
