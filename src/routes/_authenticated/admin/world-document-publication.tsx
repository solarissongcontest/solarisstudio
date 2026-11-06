import { createFileRoute } from "@tanstack/react-router";
import { AdminWorldDocumentPublicationWorkspace } from "@/components/admin/AdminWorldDocumentPublicationWorkspace";

export const Route = createFileRoute("/_authenticated/admin/world-document-publication")({
  head: () => ({
    meta: [
      { title: "Legal document publication — Solaris Organizer" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Restricted governed Terra Solaris legal document publication." },
    ],
  }),
  component: AdminWorldDocumentPublicationWorkspace,
});
