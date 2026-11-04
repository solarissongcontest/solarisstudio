import { createFileRoute } from "@tanstack/react-router";
import { WorldOrganizationPage } from "@/components/v3/V3WorldPublicPages";

export const Route = createFileRoute("/world/organizations/$slug/members")({
  head: () => ({
    meta: [
      { title: "Institution members — Terra Solaris" },
      { name: "description", content: "Authoritative public membership status for Terra Solaris organizations." },
    ],
  }),
  component: InstitutionMembersRoute,
});

function InstitutionMembersRoute() {
  const { slug } = Route.useParams();
  return <WorldOrganizationPage slug={slug} section="members" />;
}
