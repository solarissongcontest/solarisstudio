import { createFileRoute } from "@tanstack/react-router";

import { WorldPublicLegalDocumentVersionPage } from "@/components/world/WorldPublicLegalDocumentVersion";

export const Route = createFileRoute("/world/documents/$organization/$document_/version/$version")({
  parseParams: (params) => ({
    organization: params.organization,
    document: params.document,
    version: Number(params.version),
  }),
  head: ({ params }) => ({
    meta: [
      { title: "Document version — " + params.document + " — Terra Solaris" },
      { name: "description", content: "Read a published Terra Solaris institutional legal document version." },
    ],
  }),
  component: LegalDocumentVersionRoute,
});

function LegalDocumentVersionRoute() {
  const { organization, document, version } = Route.useParams();
  return <WorldPublicLegalDocumentVersionPage organization={organization} document={document} version={version} />;
}
