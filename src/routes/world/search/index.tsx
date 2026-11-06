import { createFileRoute } from "@tanstack/react-router";

import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldUnifiedSearchPage } from "@/components/world/WorldUnifiedSearch";
import { verifiedWorldSearchTerm } from "@/lib/terra-world-unified-search";

export const Route = createFileRoute("/world/search/")({
  validateSearch: (search: Record<string, unknown>): { q: string } => ({
    q: typeof search.q === "string" ? verifiedWorldSearchTerm(search.q) : "",
  }),
  head: () => ({
    meta: [
      { title: "Search Terra Solaris — Solaris Studio" },
      { name: "description", content: "Search published Terra Solaris countries and international organizations." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world/search" }],
  }),
  component: WorldSearchRoute,
});

function WorldSearchRoute() {
  const { q } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WorldPublicGate>
      <WorldUnifiedSearchPage
        term={q}
        onSearch={(next) => void navigate({
          search: { q: verifiedWorldSearchTerm(next) },
          replace: false,
        })}
      />
    </WorldPublicGate>
  );
}
