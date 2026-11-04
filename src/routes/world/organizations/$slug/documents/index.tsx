import { createFileRoute } from "@tanstack/react-router";
import { WorldPublicDocumentIndex } from "@/components/world/WorldPublicDocuments";

export const Route = createFileRoute("/world/organizations/$slug/documents/")({
  head: () => ({
    meta: [
      { title: "Institutional Documents — Terra Solaris" },
      { name: "description", content: "Browse published Terra Solaris charters, treaties and official legal documents." },
    ],
  }),
  component: WorldDocumentIndexRoute,
});

function WorldDocumentIndexRoute() {
  const { slug } = Route.useParams();
  return <WorldPublicDocumentIndex organizationSlug={slug} />;
}
