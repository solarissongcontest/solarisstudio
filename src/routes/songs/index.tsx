import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { V3MusicDataError } from "@/components/v3/V3MusicDataError";
import {
  V3MusicLoading,
  V3MusicUnavailable,
  V3SongIndexScreen,
} from "@/components/v3/V3MusicEntityScreens";
import { useV3SongIndexProjection } from "@/lib/v3-music-entities-runtime";

type SongsSearch = { q?: string };

export const Route = createFileRoute("/songs/")({
  validateSearch: (search: Record<string, unknown>): SongsSearch => ({
    q:
      typeof search.q === "string" && search.q.trim()
        ? search.q.trim().slice(0, 120)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Songs — Solaris Studio" },
      {
        name: "description",
        content:
          "Browse publication-safe Solaris song identities and their published artist credits and appearances.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://studio.solaris-song-contest.workers.dev/songs",
      },
    ],
  }),
  component: SongsPage,
});

function SongsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = search.q ?? "";
  const projection = useV3SongIndexProjection(query);

  return (
    <AppShell>
      {projection.isLoading ? (
        <V3MusicLoading label="Songs" />
      ) : projection.isError ? (
        <V3MusicDataError
          title="Could not load Songs"
          description="The publication-safe Song collection is temporarily unavailable."
          onRetry={() => projection.refetch()}
        />
      ) : !projection.data ? (
        <V3MusicUnavailable
          title="Songs unavailable"
          description="No publication-safe Song collection is currently available. No Entry titles are promoted into identity as a fallback."
        />
      ) : (
        <V3SongIndexScreen
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
