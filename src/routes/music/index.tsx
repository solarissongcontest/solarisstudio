import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { V3MusicDiscoveryScreen } from "@/components/v3/V3MusicDiscoveryScreen";
import {
  V3MusicLoading,
  V3MusicUnavailable,
} from "@/components/v3/V3MusicEntityScreens";
import {
  useV3ArtistIndexProjection,
  useV3SongIndexProjection,
} from "@/lib/v3-music-entities-runtime";

type MusicSearch = { q?: string };

export const Route = createFileRoute("/music/")({
  validateSearch: (search: Record<string, unknown>): MusicSearch => ({
    q:
      typeof search.q === "string" && search.q.trim()
        ? search.q.trim().slice(0, 120)
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Songs & artists — Solaris Studio" },
      {
        name: "description",
        content:
          "Discover publication-safe Solaris songs and artists through durable first-class music identities.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://studio.solaris-song-contest.workers.dev/music",
      },
    ],
  }),
  component: MusicPage,
});

function MusicPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = search.q ?? "";
  const songs = useV3SongIndexProjection(query);
  const artists = useV3ArtistIndexProjection(query);

  if (songs.isLoading && artists.isLoading) {
    return (
      <AppShell>
        <V3MusicLoading label="Songs & artists" />
      </AppShell>
    );
  }

  if ((songs.isError || !songs.data) && (artists.isError || !artists.data)) {
    return (
      <AppShell>
        <V3MusicUnavailable
          title="Songs & artists unavailable"
          description="The canonical publication-safe music catalogue could not be loaded. Solaris does not fall back to unpublished Entry data."
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <V3MusicDiscoveryScreen
        songs={songs.data ?? null}
        artists={artists.data ?? null}
        query={query}
        onQueryChange={(nextQuery) => {
          void navigate({
            search: { q: nextQuery || undefined },
            replace: true,
          });
        }}
      />
    </AppShell>
  );
}
