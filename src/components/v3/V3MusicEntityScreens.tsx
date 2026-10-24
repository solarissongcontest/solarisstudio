import { Link } from "@tanstack/react-router";
import { Disc3, MicVocal, Search } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import type {
  V3ArtistDetail,
  V3ArtistIndexProjection,
  V3SongDetail,
  V3SongIndexProjection,
} from "@/lib/v3-music-entities";
import { v3ArtistHref, v3SongHref } from "@/lib/v3-music-entities";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3Surface,
} from "./V3Foundation";

function SearchBox({
  value,
  label,
  placeholder,
  onSubmit,
}: {
  value: string;
  label: string;
  placeholder: string;
  onSubmit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(draft.trim());
  };

  return (
    <form onSubmit={submit} className="flex gap-2" role="search">
      <label className="min-w-0 flex-1">
        <span className="sr-only">{label}</span>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={120}
          placeholder={placeholder}
          className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm text-white outline-none transition placeholder:text-white/35 focus:border-white/25 focus:bg-white/[0.065]"
        />
      </label>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-4 text-sm font-semibold text-white/88 transition hover:bg-white/[0.1]"
      >
        <Search className="size-4" aria-hidden="true" />
        Search
      </button>
    </form>
  );
}

function QueryState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <V3Surface className="p-5">
      <p className="text-sm font-semibold text-white/90">{title}</p>
      <p className="mt-1 text-sm leading-6 text-white/50">{description}</p>
    </V3Surface>
  );
}

export function V3ArtistIndexScreen({
  projection,
  query,
  onQueryChange,
}: {
  projection: V3ArtistIndexProjection;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Explore · Artists"
        title="Artists"
        description="First-class Solaris artist identities linked to entries that are already public. Names are presentation, not identity."
        editorial
      />

      <V3Surface level="raised" className="p-4 sm:p-5">
        <SearchBox
          value={query}
          label="Search artists"
          placeholder="Search published artists"
          onSubmit={onQueryChange}
        />
      </V3Surface>

      <V3Section
        title={query ? "Search results" : "Published artists"}
        meta={`${projection.items.length} shown`}
      >
        {projection.items.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {projection.items.map((artist) => (
              <V3ActionCard
                key={artist.id}
                title={artist.displayName}
                description="Artist profile"
                icon={MicVocal}
                to={v3ArtistHref(artist.id)}
              />
            ))}
          </div>
        ) : (
          <QueryState
            title={query ? "No artists found" : "No public artists yet"}
            description={
              query
                ? "Try another published artist name or alias."
                : "Artist identities appear here only after System links them to publication-safe entries."
            }
          />
        )}
      </V3Section>

      <V3Section title="Explore music">
        <V3ActionCard
          title="Songs"
          description="Browse first-class published song identities"
          icon={Disc3}
          to="/songs"
        />
      </V3Section>
    </V3Screen>
  );
}

export function V3SongIndexScreen({
  projection,
  query,
  onQueryChange,
}: {
  projection: V3SongIndexProjection;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Explore · Songs"
        title="Songs"
        description="Published Solaris songs backed by durable System identity rather than mutable title text."
        editorial
      />

      <V3Surface level="raised" className="p-4 sm:p-5">
        <SearchBox
          value={query}
          label="Search songs"
          placeholder="Search published songs"
          onSubmit={onQueryChange}
        />
      </V3Surface>

      <V3Section
        title={query ? "Search results" : "Published songs"}
        meta={`${projection.items.length} shown`}
      >
        {projection.items.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {projection.items.map((song) => (
              <V3ActionCard
                key={song.id}
                title={song.title}
                description={
                  song.artists.length
                    ? song.artists.map((artist) => artist.displayName).join(" · ")
                    : "Published song"
                }
                icon={Disc3}
                to={v3SongHref(song.id)}
              />
            ))}
          </div>
        ) : (
          <QueryState
            title={query ? "No songs found" : "No public songs yet"}
            description={
              query
                ? "Try another published song title."
                : "Song identities appear here only after System links them to publication-safe entries."
            }
          />
        )}
      </V3Section>

      <V3Section title="Explore music">
        <V3ActionCard
          title="Artists"
          description="Browse first-class published artist identities"
          icon={MicVocal}
          to="/artists"
        />
      </V3Section>
    </V3Screen>
  );
}

function AppearanceList({
  appearances,
}: {
  appearances: readonly V3ArtistDetail["appearances"][number][];
}) {
  if (!appearances.length) {
    return (
      <QueryState
        title="No public appearances"
        description="No publication-safe Entry appearance is currently exposed for this identity."
      />
    );
  }

  return (
    <div className="grid gap-2">
      {appearances.map((appearance) => (
        <V3Surface key={appearance.entryId} className="px-4 py-3">
          <p className="text-sm font-semibold text-white/90">{appearance.songLabel}</p>
          <p className="mt-1 text-xs text-white/48">{appearance.artistLabel}</p>
        </V3Surface>
      ))}
    </div>
  );
}

export function V3ArtistDetailScreen({ artist }: { artist: V3ArtistDetail }) {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Artist"
        title={artist.displayName}
        description={artist.bio ?? "Published Solaris artist identity."}
        editorial
      />

      {artist.aliases.length ? (
        <V3Section title="Also known as">
          <div className="flex flex-wrap gap-2">
            {artist.aliases.map((alias, index) => (
              <span
                key={`${alias.editionId ?? "global"}:${alias.name}:${index}`}
                className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-white/72"
              >
                {alias.name}
              </span>
            ))}
          </div>
        </V3Section>
      ) : null}

      <V3Section title="Songs" meta={`${artist.songs.length}`}>
        {artist.songs.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {artist.songs.map((song) => (
              <V3ActionCard
                key={song.id}
                title={song.title}
                description="Open song"
                icon={Disc3}
                to={v3SongHref(song.id)}
              />
            ))}
          </div>
        ) : (
          <QueryState
            title="No public songs"
            description="No publication-safe songs are currently linked to this Artist identity."
          />
        )}
      </V3Section>

      <V3Section title="Published appearances" meta={`${artist.appearances.length}`}>
        <AppearanceList appearances={artist.appearances} />
      </V3Section>

      <p className="px-1 text-xs leading-5 text-white/40">
        Artist identity comes from the canonical System registry. Credits, media, participation state and results remain owned by their existing Entry and Results projections.
      </p>
    </V3Screen>
  );
}

export function V3SongDetailScreen({ song }: { song: V3SongDetail }) {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Song"
        title={song.title}
        description={
          song.artists.length
            ? song.artists.map((artist) => artist.displayName).join(" · ")
            : "Published Solaris song identity."
        }
        editorial
      />

      <V3Section title="Artists" meta={`${song.artists.length}`}>
        {song.artists.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {song.artists.map((artist) => (
              <V3ActionCard
                key={artist.id}
                title={artist.creditLabel || artist.displayName}
                description={
                  artist.creditLabel && artist.creditLabel !== artist.displayName
                    ? artist.displayName
                    : `Credit ${artist.position}`
                }
                icon={MicVocal}
                to={v3ArtistHref(artist.id)}
              />
            ))}
          </div>
        ) : (
          <QueryState
            title="No public Artist credit"
            description="The Song identity is public, but no publication-safe Artist identity is currently exposed for its credits."
          />
        )}
      </V3Section>

      <V3Section title="Published appearances" meta={`${song.appearances.length}`}>
        <AppearanceList appearances={song.appearances} />
      </V3Section>

      <p className="px-1 text-xs leading-5 text-white/40">
        Song identity is durable and title-independent. Audio, video, artwork, credits and official results remain authoritative on their canonical Entry and Results surfaces.
      </p>
    </V3Screen>
  );
}

export function V3MusicLoading({ label }: { label: string }) {
  return (
    <V3Screen>
      <V3ScreenHeader title={label} description="Loading publication-safe Solaris music data…" />
      <QueryState title="Loading" description="Checking the canonical public projection." />
    </V3Screen>
  );
}

export function V3MusicUnavailable({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <V3Screen>
      <V3ScreenHeader title={title} description={description} />
      <V3Surface className="p-5">
        <p className="text-sm text-white/55">
          This page fails closed when the System projection is unavailable or the identity is not public.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/artists" className="text-sm font-semibold text-primary hover:underline">
            Browse artists
          </Link>
          <Link to="/songs" className="text-sm font-semibold text-primary hover:underline">
            Browse songs
          </Link>
        </div>
      </V3Surface>
    </V3Screen>
  );
}
