import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicDocumentReader } from "@/components/world/WorldPublicDocuments";

export const Route = createFileRoute("/world/organizations/$slug/documents/$documentSlug")({
  validateSearch: (search: Record<string, unknown>) => {
    const requested = search.version;
    const parsed = typeof requested === "string" && /^\d+$/.test(requested)
      ? Number(requested)
      : typeof requested === "number" ? requested : null;
    return {
      version: requested === undefined || requested === null
        ? undefined : parsed !== null && Number.isSafeInteger(parsed) && parsed >= 1
          ? parsed : -1,
    };
  },
  head: () => ({
    meta: [
      { title: "Legal Document Reader — Terra Solaris" },
      { name: "description", content: "Read authoritative published institution legal documents and their version history." },
    ],
  }),
  component: WorldDocumentReaderRoute,
});

function WorldDocumentReaderRoute() {
  const { slug, documentSlug } = Route.useParams();
  const { version } = Route.useSearch();
  return <WorldPublicDocumentReader organizationSlug={slug} documentSlug={documentSlug} version={version} />;
}
