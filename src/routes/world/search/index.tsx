import { createFileRoute } from "@tanstack/react-router";

import { WorldPublicGate } from "@/components/world/WorldPublic";
import { WorldUnifiedSearchPage } from "@/components/world/WorldUnifiedSearch";
import { parseWorldSearchCategory, parseWorldSearchPage, verifiedWorldSearchTerm } from "@/lib/terra-world-unified-search";

export const Route = createFileRoute("/world/search/")({
  validateSearch: (search: Record<string, unknown>): { q: string; c: number; o: number; type: "all" | "countries" | "organizations" } => ({
    q: typeof search.q === "string" ? verifiedWorldSearchTerm(search.q) : "",
    c: parseWorldSearchPage(search.c),
    o: parseWorldSearchPage(search.o),
    type: parseWorldSearchCategory(search.type),
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
  const { q, c, o, type } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WorldPublicGate>
      <WorldUnifiedSearchPage
        term={q}
        countryPage={c}
        organizationPage={o}
        category={type}
        onSearch={(next) => void navigate({
          search: { q: verifiedWorldSearchTerm(next), c: 0, o: 0, type },
          replace: false,
        })}
        onCategoryChange={(next) => void navigate({
          search: { q, c: 0, o: 0, type: parseWorldSearchCategory(next) },
          replace: false,
        })}
        onPagesChange={(nextCountryPage, nextOrganizationPage, replace = false) => void navigate({
          search: { q, c: nextCountryPage, o: nextOrganizationPage, type },
          replace,
        })}
      />
    </WorldPublicGate>
  );
}
