import { Link } from "@tanstack/react-router";
import { ChevronLeft, Disc3, Eye, LockKeyhole, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { V3EditionPageProjection } from "@/lib/v3-edition";
import { v3EditionOverviewHref } from "@/lib/v3-edition-view";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

function CountryFlag({
  flagImage,
  shortCode,
}: {
  flagImage: string | null;
  shortCode: string;
}) {
  return (
    <span
      className="grid aspect-[3/2] h-7 w-[2.625rem] shrink-0 place-items-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.055] text-[0.55rem] font-black text-white/70"
      aria-hidden="true"
      data-v3-flag-ratio="3:2"
    >
      {flagImage ? (
        <img src={flagImage} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        shortCode.slice(0, 3)
      )}
    </span>
  );
}

function ProtectedSongs({
  count,
  onReveal,
}: {
  count: number;
  onReveal: () => void;
}) {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Edition · Songs"
        title="Songs & artists"
        description={`${count} revealed ${count === 1 ? "entry is" : "entries are"} hidden while spoiler-free mode is on.`}
        editorial
      />
      <V3Surface level="raised" className="p-5" data-v3-edition-songs-spoiler-protected="">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.055] text-white/45">
            <LockKeyhole className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Song details are spoiler protected</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Song titles, artists and published result context stay hidden until you deliberately reveal this Edition Songs view.
            </p>
            <button
              type="button"
              onClick={onReveal}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--v3-accent)] px-4 text-sm font-semibold text-[var(--v3-bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <Eye className="size-4" aria-hidden="true" />
              Reveal songs
            </button>
          </div>
        </div>
      </V3Surface>
      <V3ActionCard
        title="Music discovery"
        description="Browse the publication-safe Solaris Song and Artist indexes"
        icon={Disc3}
        to="/music"
      />
    </V3Screen>
  );
}

export function V3EditionSongsScreen({
  projection,
  hideSpoilers,
}: {
  projection: V3EditionPageProjection;
  hideSpoilers: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [query, setQuery] = useState("");
  const spoilerProtected = hideSpoilers && !revealed;
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const resultByIdentity = useMemo(
    () =>
      new Map(
        projection.results.state === "available"
          ? projection.results.rows.map((row) => [row.id, row] as const)
          : [],
      ),
    [projection.results.rows, projection.results.state],
  );

  const filtered = useMemo(
    () =>
      projection.entries.filter((entry) => {
        if (!normalizedQuery) return true;
        return `${entry.song ?? ""} ${entry.artist ?? ""} ${entry.name} ${entry.shortCode}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      }),
    [normalizedQuery, projection.entries],
  );

  if (spoilerProtected) {
    return (
      <ProtectedSongs
        count={projection.entries.length}
        onReveal={() => setRevealed(true)}
      />
    );
  }

  const editionMeta = [
    projection.hub.hero.hostLabel,
    projection.hub.hero.year?.toString(),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <V3Screen>
      <Link
        to={v3EditionOverviewHref(projection.hub.hero.href) as any}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Edition overview
      </Link>

      <V3ScreenHeader
        kicker="Edition · Songs"
        title={projection.hub.hero.name}
        description={`${projection.entries.length} revealed ${projection.entries.length === 1 ? "entry" : "entries"}${editionMeta ? ` · ${editionMeta}` : ""}`}
        editorial
      />

      <div className="flex flex-wrap gap-2">
        <V3StatusChip tone="neutral">Published entries only</V3StatusChip>
        {projection.results.state === "available" ? (
          <V3StatusChip tone="success">Official results published</V3StatusChip>
        ) : (
          <V3StatusChip tone="neutral">Results not published</V3StatusChip>
        )}
        {hideSpoilers ? <V3StatusChip tone="warning">Locally revealed</V3StatusChip> : null}
      </div>

      <V3Surface level="raised" className="p-4">
        <label className="relative block">
          <span className="sr-only">Find a song, artist or country</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/38"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
            placeholder="Find a song, artist or country"
            className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/32 focus:border-white/25 focus:ring-2 focus:ring-primary/40"
          />
        </label>
      </V3Surface>

      <p className="px-1 text-xs leading-5 text-white/45" aria-live="polite">
        {filtered.length} revealed {filtered.length === 1 ? "entry" : "entries"} shown.
      </p>

      <V3Section title="Revealed entries" meta={`${filtered.length}`}>
        {filtered.length ? (
          <V3Surface level="raised" className="overflow-hidden">
            <div className="divide-y divide-white/[0.055]">
              {filtered.map((entry) => {
                const result = resultByIdentity.get(entry.id) ?? null;
                return (
                  <article
                    key={entry.id}
                    className="grid gap-3 p-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <span
                      className="grid aspect-square size-16 place-items-center rounded-xl border border-white/[0.08] bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.14),rgba(255,255,255,0.035)_52%,rgba(255,255,255,0.015))] text-white/62"
                      aria-hidden="true"
                    >
                      <Disc3 className="size-7" />
                    </span>

                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold tracking-[-0.02em] text-white/94">
                        {entry.song ? `“${entry.song}”` : "Published entry"}
                      </h2>
                      <p className="mt-1 truncate text-sm text-white/58">
                        {entry.artist ?? "Artist published with this entry"}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {entry.href ? (
                          <Link
                            to={entry.href as any}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-xs font-semibold text-white/65 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                          >
                            <CountryFlag
                              flagImage={entry.flagImage}
                              shortCode={entry.shortCode}
                            />
                            {entry.name}
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-xs font-semibold text-white/60">
                            <CountryFlag
                              flagImage={entry.flagImage}
                              shortCode={entry.shortCode}
                            />
                            {entry.name}
                          </span>
                        )}
                        <V3StatusChip tone="neutral">Revealed</V3StatusChip>
                      </div>
                    </div>

                    <div className="sm:text-right">
                      {result ? (
                        <>
                          <p className="text-sm font-bold tabular-nums text-white/90">
                            #{result.rank}
                          </p>
                          <p className="mt-1 text-xs font-semibold tabular-nums text-white/48">
                            {result.totalPoints} pts
                          </p>
                        </>
                      ) : (
                        <span className="text-xs font-semibold text-white/34">
                          No published result
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </V3Surface>
        ) : (
          <V3Surface className="p-5">
            <p className="text-sm font-semibold">
              {projection.entries.length ? "No matching entry" : "No songs are public yet"}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              {projection.entries.length
                ? "Try another song, artist or country name."
                : "Entries appear here only after the existing publication rules reveal them."}
            </p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section title="Explore music">
        <V3ActionCard
          title="Songs & artists"
          description="Open the first-class publication-safe music discovery surface"
          icon={Disc3}
          to="/music"
        />
      </V3Section>

      {hideSpoilers ? (
        <p className="px-1 text-xs leading-5 text-white/40">
          Revealing songs here is local to this view. Your spoiler-free preference remains enabled.
        </p>
      ) : null}
    </V3Screen>
  );
}
