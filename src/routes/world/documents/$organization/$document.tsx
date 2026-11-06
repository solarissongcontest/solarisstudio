import { createFileRoute } from "@tanstack/react-router";

import { WorldDocumentReaderScreen } from "@/components/v3/V3WorldDocumentLibrary";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { parseWorldDocumentVersionQuery } from "@/lib/world-public-documents";

export const Route = createFileRoute("/world/documents/$organization/$document")({
  validateSearch: (search: Record<string, unknown>) => ({
    version: parseWorldDocumentVersionQuery(search.version),
  }),
  head: ({ params }) => ({
    meta: [
      { title: "Institutional Document · Terra Solaris" },
      { name: "description", content: "Read published Terra Solaris institutional documents and their historical revisions." },
    ],
    links: [{
      rel: "canonical",
      href: "https://studio.solaris-song-contest.workers.dev/world/documents/" +
        encodeURIComponent(params.organization) + "/" + encodeURIComponent(params.document),
    }],
  }),
  component: WorldDocumentPage,
});

function WorldDocumentPage() {
  const { organization, document } = Route.useParams();
  const { version } = Route.useSearch();
  return (
    <WorldPublicGate verifyOnMount>
      <WorldDocumentReaderScreen organization={organization} document={document} version={version} />
    </WorldPublicGate>
  );
}
