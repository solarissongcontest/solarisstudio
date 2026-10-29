import { createFileRoute, Navigate } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import {
  V3MusicLoading,
  V3MusicUnavailable,
  V3SongDetailScreen,
} from "@/components/v3/V3MusicEntityScreens";
import { v3SongHref } from "@/lib/v3-music-entities";
import { useV3SongProjection } from "@/lib/v3-music-entities-runtime";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/songs/$songId")({
  head: ({ params }) => ({
    meta: [
      { title: "Song — Solaris Studio" },
      {
        name: "description",
        content: "Publication-safe Solaris song identity and published contest appearances.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: `https://studio.solaris-song-contest.workers.dev/songs/${encodeURIComponent(params.songId)}`,
      },
    ],
  }),
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

  if (projection.isError || !projection.data) {
    return (
      <AppShell>
        <V3MusicUnavailable
          title="Song unavailable"
          description="This Song identity is not public or the canonical public projection is unavailable."
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
