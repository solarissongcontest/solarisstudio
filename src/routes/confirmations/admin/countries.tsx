import { createFileRoute } from "@tanstack/react-router";

import { DelegationCountriesView } from "@/components/confirmations/DelegationCountriesView";

export const Route = createFileRoute("/confirmations/admin/countries")({
  head: () => ({
    meta: [
      { title: "Delegation Countries — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DelegationCountriesView,
});
