import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { V3MusicDataError } from "@/components/v3/V3MusicDataError";
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

const MUSIC_URL = "https://studio.solaris-song-contest.workers.dev/music";
const MUSIC_DESCRIPTION =
  "Discover publication-safe Solaris songs and artists through durable first-class music identities.";

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
      { name: "description", content: MUSIC_DESCRIPTION },
      { property: "og:title", content: "Songs & artists — Solaris Studio" },
      { property: "og:description", content: MUSIC_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: MUSIC_URL },
    ],
    links: [{ rel: "canonical", href: MUSIC_URL }],
  }),
  component: MusicPage,
});

function MusicPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const query = search.q ?? "";
  const songs = useV3SongIndexProjection(query);
  const artists = useV3ArtistIndexProjection(query);

  if (songs.isLoading || artists.isLoading) {
    return (
      <AppShell>
        <V3MusicLoading label="Songs & artists" />
      </AppShell>
    );
  }

  if (songs.isError && artists.isError) {
    return (
      <AppShell>
        <V3MusicDataError
          title="Could not load Songs & artists"
          description="The publication-safe music catalogue is temporarily unavailable."
          onRetry={() => Promise.all([songs.refetch(), artists.refetch()])}
        />
      </AppShell>
    );
  }

  if (!songs.data && !artists.data) {
    return (
      <AppShell>
        <V3MusicUnavailable
          title="Songs & artists unavailable"
          description="No publication-safe music catalogue is currently available. Solaris does not fall back to unpublished Entry data."
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
        onRetrySongs={songs.isError ? () => songs.refetch() : undefined}
        onRetryArtists={artists.isError ? () => artists.refetch() : undefined}
      />
    </AppShell>
  );
}
