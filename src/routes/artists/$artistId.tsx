import { createFileRoute, Navigate } from "@tanstack/react-router";

import { AppShell } from "@/components/AppShell";
import { V3MusicDataError } from "@/components/v3/V3MusicDataError";
import {
  V3ArtistDetailScreen,
  V3MusicLoading,
  V3MusicUnavailable,
} from "@/components/v3/V3MusicEntityScreens";
import { v3ArtistHref } from "@/lib/v3-music-entities";
import { useV3ArtistProjection } from "@/lib/v3-music-entities-runtime";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/artists/$artistId")({
  head: ({ params }) => ({
    meta: [
      { title: "Artist — Solaris Studio" },
      {
        name: "description",
        content: "Publication-safe Solaris artist identity and published contest appearances.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: `https://studio.solaris-song-contest.workers.dev/artists/${encodeURIComponent(params.artistId)}`,
      },
    ],
  }),
  component: ArtistPage,
});

function ArtistPage() {
  const { artistId } = Route.useParams();
  const validId = UUID_PATTERN.test(artistId);
  const projection = useV3ArtistProjection(validId ? artistId : "");

  if (!validId) {
    return (
      <AppShell>
        <V3MusicUnavailable
          title="Artist not found"
          description="Artist routes use durable opaque Solaris identity. Display names are never accepted as identity keys."
        />
      </AppShell>
    );
  }

  if (projection.isLoading) {
    return (
      <AppShell>
        <V3MusicLoading label="Artist" />
      </AppShell>
    );
  }

  if (projection.isError) {
    return (
      <AppShell>
        <V3MusicDataError
          title="Could not load Artist"
          description="The canonical public Artist projection is temporarily unavailable."
          onRetry={() => projection.refetch()}
        />
      </AppShell>
    );
  }

  if (!projection.data) {
    return (
      <AppShell>
        <V3MusicUnavailable
          title="Artist unavailable"
          description="This Artist identity is not public or no longer resolves to a public canonical identity."
        />
      </AppShell>
    );
  }

  if (projection.data.kind === "artist_redirect") {
    return <Navigate to={v3ArtistHref(projection.data.redirectTo) as any} replace />;
  }

  return (
    <AppShell>
      <V3ArtistDetailScreen artist={projection.data} />
    </AppShell>
  );
}
