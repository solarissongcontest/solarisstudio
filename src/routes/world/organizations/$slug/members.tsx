import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { TerraWorldOrganizationView } from "@/components/world/TerraWorldOrganizationView";

export const Route = createFileRoute("/world/organizations/$slug/members")({
  head: () => ({ meta: [{ title: "Members — Terra Solaris" }] }),
  component: OrganizationMembersPage,
});
function OrganizationMembersPage() {
  const { slug } = Route.useParams();
  return <AppShell><div className="mx-auto w-full max-w-6xl pb-12"><TerraWorldOrganizationView slug={slug} section="members" /></div></AppShell>;
}
