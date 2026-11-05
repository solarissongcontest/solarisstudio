import { createFileRoute, Navigate } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { V3MusicDataError } from "@/components/v3/V3MusicDataError";
import {
  V3MusicLoading,
  V3MusicUnavailable,
  V3SongDetailScreen,
} from "@/components/v3/V3MusicEntityScreens";
import { v3SongHref } from "@/lib/v3-music-entities";
import { useV3SongProjection } from "@/lib/v3-music-entities-runtime";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SONG_DESCRIPTION =
  "Publication-safe Solaris Song identity and published contest appearances.";

export const Route = createFileRoute("/songs/$songId")({
  head: ({ params }) => {
    const url = `https://studio.solaris-song-contest.workers.dev/songs/${encodeURIComponent(params.songId)}`;
    return {
      meta: [
        { title: "Song — Solaris Studio" },
        { name: "description", content: SONG_DESCRIPTION },
        { property: "og:title", content: "Song — Solaris Studio" },
        { property: "og:description", content: SONG_DESCRIPTION },
        { property: "og:type", content: "music.song" },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: SongPage,
});

function SongPage() {
  const { songId } = Route.useParams();
  const validId = UUID_PATTERN.test(songId);
  const projection = useV3SongProjection(validId ? songId : "");

  if (!validId) {
    return (
      <AppShell>
        <V3MusicUnavailable
          title="Song not found"
          description="Song routes use durable opaque Solaris identity. Titles are never accepted as identity keys."
        />
      </AppShell>
    );
  }

  if (projection.isLoading) {
    return (
      <AppShell>
        <V3MusicLoading label="Song" />
      </AppShell>
    );
  }

  if (projection.isError) {
    return (
      <AppShell>
        <V3MusicDataError
          title="Could not load Song"
          description="The canonical public Song projection is temporarily unavailable."
          onRetry={() => projection.refetch()}
        />
      </AppShell>
    );
  }

  if (!projection.data) {
    return (
      <AppShell>
        <V3MusicUnavailable
          title="Song unavailable"
          description="This Song identity is not public or no longer resolves to a public canonical identity."
        />
      </AppShell>
    );
  }

  if (projection.data.kind === "song_redirect") {
    return <Navigate to={v3SongHref(projection.data.redirectTo) as any} replace />;
  }

  return (
    <AppShell>
      <V3SongDetailScreen song={projection.data} />
    </AppShell>
  );
}
