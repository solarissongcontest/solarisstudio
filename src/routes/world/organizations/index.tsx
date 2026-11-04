import { createFileRoute } from "@tanstack/react-router";
import { WorldOrganizationsDirectoryPage } from "@/components/v3/V3WorldPublicPages";

export const Route = createFileRoute("/world/organizations/")({
  head: () => ({
    meta: [
      { title: "Organizations — Terra Solaris" },
      { name: "description", content: "Find and browse public Terra Solaris international organizations." },
    ],
  }),
  component: WorldOrganizationsDirectoryPage,
});
