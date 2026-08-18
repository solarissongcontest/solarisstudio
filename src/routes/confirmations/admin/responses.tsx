import { createFileRoute } from "@tanstack/react-router";

import { DelegationResponsesView } from "@/components/confirmations/DelegationResponsesView";

export const Route = createFileRoute("/confirmations/admin/responses")({
  head: () => ({
    meta: [
      { title: "Delegation Responses — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DelegationResponsesView,
});
