import { createFileRoute } from "@tanstack/react-router";
import { AdminWorldDocumentDraftWorkspace } from "@/components/admin/AdminWorldDocumentDraftWorkspace";

export const Route = createFileRoute("/_authenticated/admin/world-documents")({
  head: () => ({
    meta: [
      { title: "Institutional document drafts — Solaris Organizer" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Restricted Terra Solaris institutional document draft operations." },
    ],
  }),
  component: AdminWorldDocumentDraftWorkspace,
});
