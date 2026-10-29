import { Link } from "@tanstack/react-router";
import { Disc3, MicVocal, RefreshCw, Search } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type {
  V3ArtistIndexProjection,
  V3SongIndexProjection,
} from "@/lib/v3-music-entities";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";
import { V3ArtistPreview, V3SongPreview } from "./V3MusicPrimitives";

const ROOT_SONG_LIMIT = 6;
const ROOT_ARTIST_LIMIT = 6;

function MusicSearch({
  value,
  onSubmit,
}: {
  value: string;
  onSubmit: (query: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(draft.trim());
  };

  return (
    <form onSubmit={submit} role="search" className="flex gap-2">
      <label className="min-w-0 flex-1">
        <span className="sr-only">Search published songs and artists</span>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={120}
          placeholder="Search songs and artists"
          className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.065]"
        />
      </label>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-4 text-sm font-semibold text-white/88 transition hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      >
        <Search className="size-4" aria-hidden="true" />
        Search
      </button>
    </form>
  );
}

function MissingCollection({
  label,
  onRetry,
}: {
  label: string;
  onRetry?: () => void | Promise<unknown>;
}) {
  return (
    <V3Surface className="p-4">
      <p className="text-sm font-semibold">{label} unavailable</p>
      <p className="mt-1 text-xs leading-5 text-white/48">
        Solaris could not load this publication-safe music collection. Hidden Entry data is not used as a fallback.
      </p>
      {onRetry ? (
        <button
          type="button"
          onClick={() => void onRetry()}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 text-xs font-semibold text-white/78 transition hover:bg-white/[0.09] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Retry {label.toLowerCase()}
        </button>
      ) : null}
    </V3Surface>
  );
}

export function V3MusicDiscoveryScreen({
  songs,
  artists,
  query,
  onQueryChange,
  onRetrySongs,
  onRetryArtists,
}: {
  songs: V3SongIndexProjection | null;
  artists: V3ArtistIndexProjection | null;
  query: string;
  onQueryChange: (query: string) => void;
  onRetrySongs?: () => void | Promise<unknown>;
  onRetryArtists?: () => void | Promise<unknown>;
}) {
  const songItems = songs?.items.slice(0, ROOT_SONG_LIMIT) ?? [];
  const artistItems = artists?.items.slice(0, ROOT_ARTIST_LIMIT) ?? [];
  const totalVisible = (songs?.items.length ?? 0) + (artists?.items.length ?? 0);

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Explore · Music"
        title="Songs & artists"
        description="Discover publication-safe Solaris music through durable Song and Artist identities."
        editorial
      />

      <V3Surface level="raised" className="overflow-hidden">
        <div className="border-b border-white/[0.06] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="v3-kicker">Music discovery</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/58">
                Search the public catalogue without treating mutable song titles or artist names as identity.
              </p>
            </div>
            <V3StatusChip tone="neutral">Published only</V3StatusChip>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <MusicSearch value={query} onSubmit={onQueryChange} />
        </div>
      </V3Surface>

      {query ? (
        <p className="px-1 text-xs leading-5 text-white/45" aria-live="polite">
          {totalVisible} publication-safe matches loaded for “{query}”.
        </p>
      ) : null}

      <V3Section
        title={query ? "Song matches" : "Published songs"}
        meta={songs ? `${songs.items.length} loaded` : "Unavailable"}
      >
        {songs ? (
          songItems.length ? (
            <V3Surface level="raised" className="px-4">
              {songItems.map((song) => (
                <V3SongPreview
                  key={song.id}
                  song={song}
                  context={query ? "Search match" : "Public catalogue"}
                />
              ))}
            </V3Surface>
          ) : (
            <V3Surface className="p-4">
              <p className="text-sm font-semibold">
                {query ? "No published songs match this search" : "No public songs yet"}
              </p>
            </V3Surface>
          )
        ) : (
          <MissingCollection label="Songs" onRetry={onRetrySongs} />
        )}
        <div className="mt-3">
          <V3ActionCard
            title="Browse songs"
            description="Open the searchable publication-safe Song index"
            icon={Disc3}
            to={query ? `/songs?q=${encodeURIComponent(query)}` : "/songs"}
          />
        </div>
      </V3Section>

      <V3Section
        title={query ? "Artist matches" : "Artists to explore"}
        meta={artists ? `${artists.items.length} loaded` : "Unavailable"}
      >
        {artists ? (
          artistItems.length ? (
            <V3Surface level="raised" className="px-4">
              {artistItems.map((artist) => (
                <V3ArtistPreview key={artist.id} artist={artist} />
              ))}
            </V3Surface>
          ) : (
            <V3Surface className="p-4">
              <p className="text-sm font-semibold">
                {query ? "No published artists match this search" : "No public artists yet"}
              </p>
            </V3Surface>
          )
        ) : (
          <MissingCollection label="Artists" onRetry={onRetryArtists} />
        )}
        <div className="mt-3">
          <V3ActionCard
            title="Browse artists"
            description="Open the searchable publication-safe Artist index"
            icon={MicVocal}
            to={query ? `/artists?q=${encodeURIComponent(query)}` : "/artists"}
          />
        </div>
      </V3Section>

      <V3Section title="Music identity">
        <V3Surface className="p-5">
          <p className="text-sm font-semibold text-white/90">
            Songs and artists are first-class Solaris entities
          </p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
            Names and titles can change. Solaris keeps durable identity behind the public catalogue, while Entry remains authoritative for credits, media and participation and Results remains authoritative for official outcomes.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
            <Link to="/songs" className="text-primary hover:underline">
              Song index
            </Link>
            <Link to="/artists" className="text-primary hover:underline">
              Artist index
            </Link>
          </div>
        </V3Surface>
      </V3Section>
    </V3Screen>
  );
}

export const V3_MUSIC_DISCOVERY_LIMITS = {
  songs: ROOT_SONG_LIMIT,
  artists: ROOT_ARTIST_LIMIT,
} as const;
