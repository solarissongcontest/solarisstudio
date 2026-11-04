import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { WorldOrganizationScreen } from "@/components/world/WorldPublicScreens";

export const Route = createFileRoute("/world/organizations/$slug")({
  head: () => ({
    meta: [
      { title: "International organization — Terra Solaris" },
      { name: "description", content: "Public institutional record, leadership, members and organs of a Terra Solaris organization." },
    ],
  }),
  component: OrganizationPage,
});

function OrganizationPage() {
  const { slug } = Route.useParams();
  return <AppShell><WorldOrganizationScreen slug={slug} /></AppShell>;
}
