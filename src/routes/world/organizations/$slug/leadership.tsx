import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { TerraWorldOrganizationView } from "@/components/world/TerraWorldOrganizationView";

export const Route = createFileRoute("/world/organizations/$slug/leadership")({
  head: () => ({ meta: [{ title: "Leadership — Terra Solaris" }] }),
  component: OrganizationLeadershipPage,
});
function OrganizationLeadershipPage() {
  const { slug } = Route.useParams();
  return <AppShell><div className="mx-auto w-full max-w-6xl pb-12"><TerraWorldOrganizationView slug={slug} section="leadership" /></div></AppShell>;
}
