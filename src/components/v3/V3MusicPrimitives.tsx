import { Link } from "@tanstack/react-router";
import { Disc3, MicVocal } from "lucide-react";

import type {
  V3ArtistSummary,
  V3SongSummary,
} from "@/lib/v3-music-entities";
import { v3ArtistHref, v3SongHref } from "@/lib/v3-music-entities";
import { V3StatusChip } from "./V3Foundation";

function artistLine(song: V3SongSummary) {
  return song.artists.length
    ? song.artists.map((artist) => artist.displayName).join(" · ")
    : "Published Solaris song";
}

export function V3SongPreview({
  song,
  context,
}: {
  song: V3SongSummary;
  context?: string;
}) {
  return (
    <Link
      to={v3SongHref(song.id) as any}
      className="group grid min-h-20 grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-3 border-b border-white/[0.055] py-3 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <span
        className="grid aspect-square size-[3.25rem] place-items-center rounded-xl border border-white/[0.08] bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.16),rgba(255,255,255,0.035)_52%,rgba(255,255,255,0.015))] text-white/68 transition group-hover:text-white/90"
        aria-hidden="true"
      >
        <Disc3 className="size-6" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white/92">
          {song.title}
        </span>
        <span className="mt-1 block truncate text-xs text-white/50">
          {artistLine(song)}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <V3StatusChip tone="neutral">Published</V3StatusChip>
          {context ? (
            <span className="text-[0.68rem] font-semibold text-white/38">
              {context}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}

export function V3ArtistPreview({ artist }: { artist: V3ArtistSummary }) {
  return (
    <Link
      to={v3ArtistHref(artist.id) as any}
      className="group flex min-h-20 items-center gap-3 border-b border-white/[0.055] py-3 last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <span
        className="grid size-[3.25rem] shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.045] text-white/62 transition group-hover:bg-white/[0.075] group-hover:text-white/88"
        aria-hidden="true"
      >
        <MicVocal className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-white/92">
          {artist.displayName}
        </span>
        <span className="mt-1 block text-xs text-white/48">
          First-class Solaris artist identity
        </span>
      </span>
    </Link>
  );
}
