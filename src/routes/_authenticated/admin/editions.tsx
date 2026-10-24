import { createFileRoute } from "@tanstack/react-router";

import { AllEditionsWorkspaceV3 } from "@/components/admin/AllEditionsWorkspaceV3";

export const Route = createFileRoute("/_authenticated/admin/editions")({
  head: () => ({
    meta: [
      { title: "Editions — Solaris Organizer" },
      {
        name: "description",
        content: "Create and manage Solaris Song Contest editions from the Organizer workspace.",
      },
    ],
  }),
  component: AllEditionsWorkspaceV3,
});
