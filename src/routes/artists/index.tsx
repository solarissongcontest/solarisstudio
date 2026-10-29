import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { V3MusicDataError } from "@/components/v3/V3MusicDataError";
import {
  V3ArtistIndexScreen,
  V3MusicLoading,
  V3MusicUnavailable,
} from "@/components/v3/V3MusicEntityScreens";
import { useV3ArtistIndexProjection } from "@/lib/v3-music-entities-runtime";

type ArtistsSearch = { q?: string };

const ARTISTS_URL = "https://studio.solaris-song-contest.workers.dev/artists";
const ARTISTS_DESCRIPTION =
  "Browse the searchable publication-safe Solaris Artist index and its published Song relationships.";

export const Route = createFileRoute("/artists/")({
  validateSearch: (search: Record<string, unknown>): ArtistsSearch => ({
    q:
      typeof search.q === "string" && search.q.trim()
        ? search.q.trim().slice(0, 120)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Artists — Solaris Studio" },
      { name: "description", content: ARTISTS_DESCRIPTION },
      { property: "og:title", content: "Artists — Solaris Studio" },
      { property: "og:description", content: ARTISTS_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: ARTISTS_URL },
    ],
    links: [{ rel: "canonical", href: ARTISTS_URL }],
  }),
  component: ArtistsPage,
});

function ArtistsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = search.q ?? "";
  const projection = useV3ArtistIndexProjection(query);

  return (
    <AppShell>
      {projection.isLoading ? (
        <V3MusicLoading label="Artists" />
      ) : projection.isError ? (
        <V3MusicDataError
          title="Could not load Artists"
          description="The publication-safe Artist collection is temporarily unavailable."
          onRetry={() => projection.refetch()}
        />
      ) : !projection.data ? (
        <V3MusicUnavailable
          title="Artists unavailable"
          description="No publication-safe Artist collection is currently available. No Entry labels are promoted into identity as a fallback."
        />
      ) : (
        <V3ArtistIndexScreen
          projection={projection.data}
          query={query}
          onQueryChange={(nextQuery) => {
            void navigate({
              search: { q: nextQuery || undefined },
              replace: true,
            });
          }}
        />
      )}
    </AppShell>
  );
}
