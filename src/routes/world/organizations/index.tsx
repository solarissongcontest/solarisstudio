import { createFileRoute } from "@tanstack/react-router";
import { WorldDirectory, WorldPublicGate } from "@/components/world/WorldPublic";
import {
  cleanWorldSearch,
  parseWorldDirectoryUrlPage,
  type WorldDirectoryFilter,
} from "@/lib/terra-world-public";

// Search metadata is optional to preserve links from existing public World routes.
type DirectorySearch = { q?: string; status?: WorldDirectoryFilter; page?: number };

export const Route = createFileRoute("/world/organizations/")({
  validateSearch: (search: Record<string, unknown>): DirectorySearch => ({
    q: typeof search.q === "string" ? cleanWorldSearch(search.q) : "",
    status: search.status === "current" || search.status === "historical" ? search.status : "all",
    page: parseWorldDirectoryUrlPage(search.page),
  }),
  head: () => ({
    meta: [
      { title: "Organizations — Terra Solaris" },
      { name: "description", content: "Find public GUARD, UNITY and recognized Terra Solaris institutional profiles." },
    ],
    links: [{ rel: "canonical", href: "https://studio.solaris-song-contest.workers.dev/world/organizations" }],
  }),
  component: WorldDirectoryRoute,
});

function WorldDirectoryRoute() {
  const { q = "", status = "all", page = 1 } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <WorldPublicGate verifyOnMount>
      <WorldDirectory
        term={q}
        filter={status}
        page={page - 1}
        onTermChange={(next) => void navigate({
          search: { q: next, status, page: 1 }, replace: true,
        })}
        onFilterChange={(next) => void navigate({
          search: { q, status: next, page: 1 }, replace: true,
        })}
        onPageChange={(next) => void navigate({
          search: { q, status, page: next + 1 },
        })}
        onReset={() => void navigate({
          search: { q: "", status: "all", page: 1 }, replace: true,
        })}
      />
    </WorldPublicGate>
  );
}
