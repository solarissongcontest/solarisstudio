import { createFileRoute } from "@tanstack/react-router";

import { WorldPublicLegalDocumentsPage } from "@/components/world/WorldPublicLegalDocuments";

export const Route = createFileRoute("/world/documents/")({
  head: () => ({
    meta: [
      { title: "Institutional documents — Terra Solaris" },
      { name: "description", content: "Published legal documents and permanent institutional version history in Terra Solaris." },
    ],
  }),
  component: DocumentsRoute,
});

function DocumentsRoute() {
  return <WorldPublicLegalDocumentsPage />;
}
