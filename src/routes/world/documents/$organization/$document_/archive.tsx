import { createFileRoute } from "@tanstack/react-router";

import { WorldPublicLegalArchivePage } from "@/components/world/WorldPublicLegalArchive";

function parseCursor(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 1) return value;
  if (typeof value === "string" && /^[1-9][0-9]{0,14}$/.test(value)) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) return numeric;
  }
  // Invalid values are rejected by the strict model reader, not coerced into
  // a cursor for private or cross-Work documents.
  return -1;
}

export const Route = createFileRoute("/world/documents/$organization/$document_/archive")({
  validateSearch: (search: Record<string, unknown>) => ({
    before: parseCursor(search.before),
  }),
  head: () => ({
    meta: [
      { title: "Legal Version Archive — Terra Solaris" },
      { name: "description", content: "Read permanent, public historical Versions of Terra Solaris institutional legal documents." },
    ],
  }),
  component: LegalArchiveRoute,
});

function LegalArchiveRoute() {
  const { organization, document } = Route.useParams();
  const { before } = Route.useSearch();
  return (
    <WorldPublicLegalArchivePage
      organization={organization}
      document={document}
      before={before}
    />
  );
}
