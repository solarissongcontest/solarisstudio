import { createFileRoute } from "@tanstack/react-router";

import { WorldPublicLegalArchivePage } from "@/components/world/WorldPublicLegalArchive";

export const Route = createFileRoute("/world/documents/$organization/$document_/archive")({
  validateSearch: (search: Record<string, unknown>): { before: number | null } => ({
    before: typeof search.before === "number" && Number.isSafeInteger(search.before) && search.before > 1
      ? search.before : null,
  }),
  head: ({ params }) => ({
    meta: [
      { title: "Legal archive — " + params.document + " — Terra Solaris" },
      { name: "description", content: "Published historical versions of a Terra Solaris institutional legal document." },
    ],
  }),
  component: LegalArchiveRoute,
});

function LegalArchiveRoute() {
  const { organization, document } = Route.useParams();
  const { before } = Route.useSearch();
  return <WorldPublicLegalArchivePage organization={organization} document={document} before={before} />;
}
