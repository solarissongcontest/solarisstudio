import { createFileRoute } from "@tanstack/react-router";
import { WorldDocumentPrintPage } from "@/components/world/WorldDocumentPrintPage";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { parseWorldDocumentVersionQuery } from "@/lib/world-public-documents";

export const Route = createFileRoute("/world/documents/$organization/$document_/print")({
  validateSearch: (search: Record<string, unknown>) => ({
    version: parseWorldDocumentVersionQuery(search.version),
  }),
  head: () => ({
    meta: [
      { title: "Print Institutional Document — Terra Solaris" },
      { name: "description", content: "Print or save an authorized public Terra Solaris legal Version as PDF." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: PrintWorldDocumentRoute,
});

function PrintWorldDocumentRoute() {
  const { organization, document } = Route.useParams();
  const { version } = Route.useSearch();
  return (
    <WorldPublicGate verifyOnMount>
      <WorldDocumentPrintPage organization={organization} document={document} version={version} />
    </WorldPublicGate>
  );
}
