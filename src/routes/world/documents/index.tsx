import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { WorldDocumentLibraryScreen } from "@/components/v3/V3WorldDocumentLibrary";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { isWorldSlug, normalizeWorldSearch } from "@/lib/world-public-documents";

export const Route = createFileRoute("/world/documents/")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? normalizeWorldSearch(search.q) : "",
    organization: typeof search.organization === "string" && isWorldSlug(search.organization)
      ? search.organization
      : "",
  }),
  head: () => ({
    meta: [
      { title: "Institutional Documents · Terra Solaris" },
      { name: "description", content: "Browse official published charters, treaties, and institutional versions from Terra Solaris." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world/documents" }],
  }),
  component: WorldDocumentsPage,
});

function WorldDocumentsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <WorldPublicGate>
      <WorldDocumentLibraryScreen
      initialSearch={search.q}
      initialOrganization={search.organization}
      onApplySearch={(q, organization) => {
        void navigate({ to: "/world/documents", search: { q, organization } });
      }}
      />
    </WorldPublicGate>
  );
}
