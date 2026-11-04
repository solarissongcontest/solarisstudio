import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { TerraWorldOrganizationView } from "@/components/world/TerraWorldOrganizationView";

export const Route = createFileRoute("/world/organizations/$slug/")({
  head: () => ({ meta: [
    { title: "Organization — Terra Solaris" },
    { name: "description", content: "Published Terra Solaris organizational identity, leadership and membership." },
  ] }),
  component: OrganizationOverviewPage,
});
function OrganizationOverviewPage() {
  const { slug } = Route.useParams();
  return <AppShell><div className="mx-auto w-full max-w-6xl pb-12"><TerraWorldOrganizationView slug={slug} section="overview" /></div></AppShell>;
}
