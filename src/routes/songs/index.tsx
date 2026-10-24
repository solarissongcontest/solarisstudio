import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import {
  V3MusicLoading,
  V3MusicUnavailable,
  V3SongIndexScreen,
} from "@/components/v3/V3MusicEntityScreens";
import { useV3SongIndexProjection } from "@/lib/v3-music-entities-runtime";

export const Route = createFileRoute("/songs/")({
  head: () => ({
    meta: [
      { title: "Songs — Solaris Studio" },
      {
        name: "description",
        content: "Browse publication-safe Solaris song identities and their published artist credits and appearances.",
      },
    ],
  }),
  component: SongsPage,
});

function SongsPage() {
  const [query, setQuery] = useState("");
  const projection = useV3SongIndexProjection(query);

  return (
    <AppShell>
      {projection.isLoading ? (
        <V3MusicLoading label="Songs" />
      ) : projection.isError || !projection.data ? (
        <V3MusicUnavailable
          title="Songs unavailable"
          description="The publication-safe Song index could not be loaded. No Entry titles are promoted into identity as a fallback."
        />
      ) : (
        <V3SongIndexScreen
          projection={projection.data}
          query={query}
          onQueryChange={setQuery}
        />
      )}
    </AppShell>
  );
}
