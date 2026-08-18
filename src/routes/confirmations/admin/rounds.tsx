import { createFileRoute } from "@tanstack/react-router";

import { DelegationRoundsView } from "@/components/confirmations/DelegationRoundsView";

export const Route = createFileRoute("/confirmations/admin/rounds")({
  head: () => ({
    meta: [
      { title: "Submission Rounds — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DelegationRoundsView,
});
