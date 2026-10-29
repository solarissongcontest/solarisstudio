import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { EventTime } from "@/components/public/EventTime";
import type { V3EditionPageProjection, V3EditionShow } from "@/lib/v3-edition";
import { v3EditionOverviewHref } from "@/lib/v3-edition-view";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

function showKindLabel(kind: string) {
  if (kind === "semi-final" || kind === "semi") return "Semi-final";
  if (kind === "grand-final" || kind === "final") return "Grand Final";
  return kind.replaceAll("-", " ");
}

function ScheduleRow({
  show,
  isNext,
}: {
  show: V3EditionShow;
  isNext: boolean;
}) {
  return (
    <Link
      to={show.href as any}
      className="block border-b border-white/[0.055] last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <article className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-bold tracking-[-0.02em] text-white/94">
              {show.name}
            </h2>
            {isNext ? <V3StatusChip tone="progress">Up next</V3StatusChip> : null}
          </div>
          <div className="mt-2">
            {show.startsAt ? (
              <EventTime value={show.startsAt} label="Scheduled" />
            ) : (
              <span className="text-xs font-semibold text-white/42">
                Time to be announced
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <V3StatusChip tone="neutral">{showKindLabel(show.kind)}</V3StatusChip>
            {show.participantCount > 0 ? (
              <V3StatusChip tone="neutral">{show.participantCount} entries</V3StatusChip>
            ) : null}
            {show.runningOrderAvailable ? (
              <V3StatusChip tone="neutral">Running order public</V3StatusChip>
            ) : null}
            {show.resultsAvailable ? (
              <V3StatusChip tone="success">Results public</V3StatusChip>
            ) : null}
          </div>
        </div>
        <span
          className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/55"
          aria-hidden="true"
        >
          <CalendarDays className="size-5" />
        </span>
      </article>
    </Link>
  );
}

export function V3EditionScheduleScreen({
  projection,
}: {
  projection: V3EditionPageProjection;
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = useMemo(
    () =>
      projection.shows.filter((show) => {
        if (!normalizedQuery) return true;
        return `${show.name} ${showKindLabel(show.kind)}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      }),
    [normalizedQuery, projection.shows],
  );
  const nextEventId = projection.hub.hero.nextEvent?.id ?? null;
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
        kicker="Edition · Schedule"
        title={projection.hub.hero.name}
        description={`${projection.shows.length} public ${projection.shows.length === 1 ? "show" : "shows"}${editionMeta ? ` · ${editionMeta}` : ""}`}
        editorial
      />

      {projection.hub.hero.nextEvent ? (
        <V3Surface level="raised" className="p-4">
          <p className="v3-kicker">Next public show</p>
          <p className="mt-2 text-sm font-semibold text-white/90">
            {projection.hub.hero.nextEvent.title}
          </p>
          <div className="mt-2">
            {projection.hub.hero.nextEvent.startsAt ? (
              <EventTime value={projection.hub.hero.nextEvent.startsAt} label="Starts" />
            ) : (
              <span className="text-xs font-semibold text-white/42">
                Time to be announced
              </span>
            )}
          </div>
        </V3Surface>
      ) : null}

      <V3Surface level="raised" className="p-4">
        <label className="relative block">
          <span className="sr-only">Find a show</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/38"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={120}
            placeholder="Find a show"
            className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/32 focus:border-white/25 focus:ring-2 focus:ring-primary/40"
          />
        </label>
      </V3Surface>

      <p className="px-1 text-xs leading-5 text-white/45" aria-live="polite">
        {filtered.length} public {filtered.length === 1 ? "show" : "shows"} shown in canonical Edition order.
      </p>

      <V3Section title="Public shows" meta={`${filtered.length}`}>
        {filtered.length ? (
          <V3Surface level="raised" className="px-4">
            {filtered.map((show) => (
              <ScheduleRow
                key={show.id}
                show={show}
                isNext={show.id === nextEventId}
              />
            ))}
          </V3Surface>
        ) : (
          <V3Surface className="p-5">
            <p className="text-sm font-semibold">
              {projection.shows.length ? "No matching show" : "No public shows yet"}
            </p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              {projection.shows.length
                ? "Try another show name or type."
                : "Shows appear here only after their existing publication gate opens."}
            </p>
          </V3Surface>
        )}
      </V3Section>
    </V3Screen>
  );
}
