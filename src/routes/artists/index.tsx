import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import {
  V3ArtistIndexScreen,
  V3MusicLoading,
  V3MusicUnavailable,
} from "@/components/v3/V3MusicEntityScreens";
import { useV3ArtistIndexProjection } from "@/lib/v3-music-entities-runtime";

export const Route = createFileRoute("/artists/")({
  head: () => ({
    meta: [
      { title: "Artists — Solaris Studio" },
      {
        name: "description",
        content: "Browse publication-safe Solaris artist identities and their published songs and appearances.",
      },
    ],
  }),
  component: ArtistsPage,
});

function ArtistsPage() {
  const [query, setQuery] = useState("");
  const projection = useV3ArtistIndexProjection(query);

  return (
    <AppShell>
      {projection.isLoading ? (
        <V3MusicLoading label="Artists" />
      ) : projection.isError || !projection.data ? (
        <V3MusicUnavailable
          title="Artists unavailable"
          description="The publication-safe Artist index could not be loaded. No Entry labels are promoted into identity as a fallback."
        />
      ) : (
        <V3ArtistIndexScreen
          projection={projection.data}
          query={query}
          onQueryChange={setQuery}
        />
      )}
    </AppShell>
  );
}
