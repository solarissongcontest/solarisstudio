import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  Eye,
  Flag,
  LockKeyhole,
  Music2,
  Radio,
  Search,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";

import { EventTime } from "@/components/public/EventTime";
import type {
  V3EditionEntry,
  V3EditionPageProjection,
  V3EditionParticipant,
} from "@/lib/v3-edition";
import {
  V3_EDITION_OVERVIEW_LIMITS,
  type V3EditionCollectionView,
  v3EditionOverviewHref,
  v3EditionViewHref,
} from "@/lib/v3-edition-view";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
  type V3StatusTone,
} from "./V3Foundation";

export type V3EditionProductScreenProps = {
  projection: V3EditionPageProjection;
  hideSpoilers: boolean;
  view: V3EditionCollectionView | null;
};

function editionMeta(projection: V3EditionPageProjection): string {
  return [projection.hub.hero.hostLabel, projection.hub.hero.year?.toString()]
    .filter(Boolean)
    .join(" · ");
}

function experiencePresentation(
  experience: V3EditionPageProjection["hub"]["hero"]["experience"],
): { label: string; tone: V3StatusTone } {
  switch (experience) {
    case "live":
      return { label: "Live", tone: "live" };
    case "results":
      return { label: "Results", tone: "success" };
    case "post-edition":
      return { label: "Complete", tone: "success" };
    case "archived":
      return { label: "Archive", tone: "neutral" };
    case "show-day":
      return { label: "Show day", tone: "warning" };
    case "pre-show":
      return { label: "Pre-show", tone: "progress" };
    case "upcoming":
      return { label: "Upcoming", tone: "progress" };
  }
}

function prioritizesOutcome(
  experience: V3EditionPageProjection["hub"]["hero"]["experience"],
) {
  return (
    experience === "results" ||
    experience === "post-edition" ||
    experience === "archived"
  );
}

function participantTone(
  status: V3EditionParticipant["participationStatus"],
): V3StatusTone {
  if (status === "withdrawn") return "warning";
  if (status === "disqualified") return "danger";
  return "neutral";
}

function participantLabel(status: V3EditionParticipant["participationStatus"]) {
  if (status === "withdrawn") return "Withdrawn";
  if (status === "disqualified") return "Disqualified";
  return "Participating";
}

function IdentityRow({
  item,
  detail,
  trailing,
}: {
  item: V3EditionParticipant | V3EditionEntry;
  detail: string;
  trailing?: React.ReactNode;
}) {
  const body = (
    <div className="flex min-h-14 items-center gap-3">
      <span
        className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.055] text-[0.65rem] font-black text-white/75"
        aria-hidden="true"
      >
        {item.flagImage ? (
          <img src={item.flagImage} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          item.shortCode.slice(0, 3)
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{item.name}</span>
        <span className="mt-0.5 block truncate text-xs text-white/48">{detail}</span>
      </span>
      {trailing}
    </div>
  );

  return item.href ? (
    <Link
      to={item.href as any}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function CollectionBackLink({ projection }: { projection: V3EditionPageProjection }) {
  return (
    <Link
      to={v3EditionOverviewHref(projection.hub.hero.href) as any}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-white/70 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <ChevronLeft className="size-4" aria-hidden="true" />
      Edition overview
    </Link>
  );
}

function CollectionSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/38"
        aria-hidden="true"
      />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        className="min-h-11 w-full rounded-xl border border-white/10 bg-white/[0.035] pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/32 focus:border-white/25 focus:ring-2 focus:ring-primary/40"
      />
    </label>
  );
}

function EditionCollectionScreen({
  projection,
  view,
  spoilerSafe,
}: {
  projection: V3EditionPageProjection;
  view: V3EditionCollectionView;
  spoilerSafe: boolean;
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase();
  const participants = useMemo(
    () =>
      normalized
        ? projection.participants.filter((item) =>
            `${item.name} ${item.shortCode}`.toLocaleLowerCase().includes(normalized),
          )
        : projection.participants,
    [normalized, projection.participants],
  );
  const entries = useMemo(
    () =>
      normalized
        ? projection.entries.filter((item) =>
            `${item.name} ${item.shortCode} ${item.song ?? ""} ${item.artist ?? ""}`
              .toLocaleLowerCase()
              .includes(normalized),
          )
        : projection.entries,
    [normalized, projection.entries],
  );
  const meta = editionMeta(projection);

  if (view === "participants") {
    return (
      <V3Screen>
        <CollectionBackLink projection={projection} />
        <V3ScreenHeader
          kicker="Edition · Participants"
          title={projection.hub.hero.name}
          description={`${projection.participants.length} public delegations${meta ? ` · ${meta}` : ""}`}
          editorial
        />
        {projection.participants.length > V3_EDITION_OVERVIEW_LIMITS.participants ? (
          <CollectionSearch value={query} onChange={setQuery} label="Find a delegation" />
        ) : null}
        <V3Section title="Participants" meta={`${participants.length} shown`}>
          {participants.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {participants.map((participant) => (
                <V3Surface key={participant.id} className="px-4 py-2.5">
                  <IdentityRow
                    item={participant}
                    detail={participant.shortCode}
                    trailing={
                      <V3StatusChip tone={participantTone(participant.participationStatus)}>
                        {participantLabel(participant.participationStatus)}
                      </V3StatusChip>
                    }
                  />
                </V3Surface>
              ))}
            </div>
          ) : (
            <V3Surface className="p-5">
              <p className="text-sm font-semibold">No matching delegation</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                Try another country name or short code.
              </p>
            </V3Surface>
          )}
        </V3Section>
      </V3Screen>
    );
  }

  if (view === "songs") {
    return (
      <V3Screen>
        <CollectionBackLink projection={projection} />
        <V3ScreenHeader
          kicker="Edition · Songs"
          title={projection.hub.hero.name}
          description={`${projection.entries.length} revealed entries${meta ? ` · ${meta}` : ""}`}
          editorial
        />
        {projection.entries.length > V3_EDITION_OVERVIEW_LIMITS.songs ? (
          <CollectionSearch value={query} onChange={setQuery} label="Find a song, artist or country" />
        ) : null}
        <V3Section title="Songs & artists" meta={`${entries.length} shown`}>
          {entries.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {entries.map((entry) => (
                <V3Surface key={entry.id} className="px-4 py-2.5">
                  <IdentityRow
                    item={entry}
                    detail={
                      [entry.song ? `“${entry.song}”` : null, entry.artist]
                        .filter(Boolean)
                        .join(" · ") || "Entry details published"
                    }
                    trailing={<Music2 className="size-4 shrink-0 text-white/30" aria-hidden="true" />}
                  />
                </V3Surface>
              ))}
            </div>
          ) : (
            <V3Surface className="p-5">
              <p className="text-sm font-semibold">No matching song or artist</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                Try another song, artist, country or short code.
              </p>
            </V3Surface>
          )}
        </V3Section>
      </V3Screen>
    );
  }

  return (
    <V3Screen>
      <CollectionBackLink projection={projection} />
      <V3ScreenHeader
        kicker="Edition · Schedule"
        title={projection.hub.hero.name}
        description={`${projection.shows.length} public shows${meta ? ` · ${meta}` : ""}`}
        editorial
      />
      <V3Section title="Schedule" meta={`${projection.shows.length} public shows`}>
        {projection.shows.length ? (
          <div className="grid gap-3">
            {projection.shows.map((show) => (
              <div key={show.id} className="grid gap-2">
                <div className="px-1">
                  {show.startsAt ? (
                    <EventTime value={show.startsAt} label="Scheduled" />
                  ) : (
                    <span className="text-xs font-semibold text-white/45">Time to be announced</span>
                  )}
                </div>
                <V3ActionCard
                  title={show.name}
                  description={[
                    show.kind.replaceAll("-", " "),
                    !spoilerSafe && show.participantCount ? `${show.participantCount} entries` : null,
                    show.runningOrderAvailable ? "running order public" : null,
                    !spoilerSafe && show.resultsAvailable ? "results available" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  icon={CalendarDays}
                  tone="neutral"
                  to={show.href}
                />
              </div>
            ))}
          </div>
        ) : (
          <V3Surface className="p-5">
            <p className="text-sm font-semibold">No public shows yet</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Show information appears only after it becomes public.
            </p>
          </V3Surface>
        )}
      </V3Section>
    </V3Screen>
  );
}

function ProtectedSection({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <V3Section title={title} meta="Spoiler protected">
      <V3Surface className="flex items-start gap-3 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.055] text-white/45">
          <LockKeyhole className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold">Hidden while spoiler-free mode is on</p>
          <p className="mt-1 text-xs leading-5 text-white/48">{description}</p>
        </div>
      </V3Surface>
    </V3Section>
  );
}

function SpoilerRevealCard({ onReveal }: { onReveal: () => void }) {
  return (
    <V3Surface level="raised" className="p-5" data-v3-edition-spoiler-protected="">
      <div className="flex flex-wrap items-center gap-2">
        <V3StatusChip tone="warning">Spoiler-free</V3StatusChip>
      </div>
      <h2 className="mt-4 text-xl font-bold tracking-[-0.03em]">Edition spoilers are hidden</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
        Published story moments, entry details, placements and points stay hidden until you deliberately reveal this Edition.
      </p>
      <button
        type="button"
        onClick={onReveal}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)]"
      >
        <Eye className="size-4" aria-hidden="true" />
        Reveal edition spoilers
      </button>
    </V3Surface>
  );
}

function SectionNav({
  projection,
  spoilerSafe,
}: {
  projection: V3EditionPageProjection;
  spoilerSafe: boolean;
}) {
  const base = projection.hub.hero.href;
  const links = [
    { key: "overview", label: "Overview", href: v3EditionOverviewHref(base), locked: false },
    {
      key: "participants",
      label: "Participants",
      href: v3EditionViewHref(base, "participants"),
      locked: false,
    },
    {
      key: "songs",
      label: "Songs",
      href: v3EditionViewHref(base, "songs"),
      locked: spoilerSafe,
    },
    {
      key: "schedule",
      label: "Schedule",
      href: v3EditionViewHref(base, "schedule"),
      locked: false,
    },
    {
      key: "stories",
      label: "Stories",
      href: projection.story?.href ?? base,
      locked: spoilerSafe || !projection.story,
    },
    {
      key: "results",
      label: "Results",
      href: projection.results.showHref ?? base,
      locked: spoilerSafe || projection.results.state !== "available",
    },
  ];

  return (
    <nav aria-label={`Explore ${projection.hub.hero.name}`} className="flex flex-wrap gap-2">
      {links.map((item) =>
        item.locked ? (
          <span
            key={item.key}
            className="rounded-full border border-white/[0.06] px-3 py-2 text-xs font-semibold text-white/32"
            aria-disabled="true"
          >
            {item.label}
          </span>
        ) : (
          <Link
            key={item.key}
            to={item.href as any}
            className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.07] hover:text-white"
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}

function EditionOverview({
  projection,
  spoilerSafe,
  onReveal,
}: {
  projection: V3EditionPageProjection;
  spoilerSafe: boolean;
  onReveal: () => void;
}) {
  const status = experiencePresentation(projection.hub.hero.experience);
  const meta = editionMeta(projection);
  const participantPreview = projection.participants.slice(
    0,
    V3_EDITION_OVERVIEW_LIMITS.participants,
  );
  const entryPreview = projection.entries.slice(0, V3_EDITION_OVERVIEW_LIMITS.songs);
  const showPreview = projection.shows.slice(0, V3_EDITION_OVERVIEW_LIMITS.schedule);
  const storyPreview = projection.story?.items.slice(
    0,
    V3_EDITION_OVERVIEW_LIMITS.storyItems,
  );
  const resultPreview = projection.results.rows.slice(
    0,
    V3_EDITION_OVERVIEW_LIMITS.resultRows,
  );
  const prioritizeOutcome = prioritizesOutcome(projection.hub.hero.experience);
  const winnerRows = prioritizeOutcome
    ? projection.results.rows.filter((row) => row.rank === 1)
    : [];
  const featuredOutcome = winnerRows.length ? winnerRows : resultPreview.slice(0, 1);

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Edition"
        title={projection.hub.hero.name}
        description={meta || "Explore this Solaris edition"}
        editorial
      />

      {spoilerSafe ? (
        <SpoilerRevealCard onReveal={onReveal} />
      ) : (
        <V3Surface level="raised" className="overflow-hidden">
          {projection.hub.hero.artworkUrl ? (
            <div className="relative aspect-[16/8] overflow-hidden border-b border-white/[0.06] bg-white/[0.025]">
              <img
                src={projection.hub.hero.artworkUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"
                aria-hidden="true"
              />
            </div>
          ) : null}
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="v3-kicker">Solaris edition</p>
                <p className="mt-2 text-sm font-semibold leading-5 text-white/72">
                  {projection.hub.hero.resultsAvailable
                    ? "Official results are published"
                    : "Results remain locked until official publication"}
                </p>
              </div>
              <V3StatusChip tone={status.tone}>{status.label}</V3StatusChip>
            </div>
            {projection.description ? (
              <p className="mt-4 text-sm leading-6 text-white/58">{projection.description}</p>
            ) : null}
          </div>
        </V3Surface>
      )}

      {projection.hub.liveAction ? (
        <V3Section title="Live now" meta={<V3StatusChip tone="live">Live</V3StatusChip>}>
          <V3ActionCard
            title={projection.hub.liveAction.label}
            description="Enter the dedicated live experience for the current show"
            icon={Radio}
            tone="neutral"
            to={projection.hub.liveAction.href}
          />
        </V3Section>
      ) : null}

      {projection.hub.hero.nextEvent ? (
        <V3Section title="Coming up" meta={<V3StatusChip tone="progress">Next public show</V3StatusChip>}>
          <V3ActionCard
            title={projection.hub.hero.nextEvent.title}
            description="Next scheduled public show"
            icon={CalendarDays}
            tone="neutral"
            to={projection.hub.hero.nextEvent.href}
            meta={
              projection.hub.hero.nextEvent.startsAt ? (
                <EventTime value={projection.hub.hero.nextEvent.startsAt} label="Starts" />
              ) : (
                "Time to be announced"
              )
            }
          />
        </V3Section>
      ) : null}

      {!spoilerSafe && featuredOutcome.length ? (
        <V3Section title="Edition outcome" meta={<V3StatusChip tone="success">Official result</V3StatusChip>}>
          <V3Surface level="raised" className="divide-y divide-white/[0.055] overflow-hidden">
            {featuredOutcome.map((row) => (
              <div key={row.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <Trophy className="size-4 shrink-0 text-white/45" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{row.name}</span>
                  <span className="mt-0.5 block text-xs text-white/45">Official rank #{row.rank}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{row.totalPoints} pts</span>
              </div>
            ))}
          </V3Surface>
          {projection.results.showHref ? (
            <V3ActionCard
              title="Open official result"
              description="View the complete published result in Results"
              icon={Trophy}
              tone="neutral"
              to={projection.results.showHref}
            />
          ) : null}
        </V3Section>
      ) : null}

      <SectionNav projection={projection} spoilerSafe={spoilerSafe} />

      <V3Section title="At a glance" meta={projection.hub.hero.editionNumber != null ? `SSC ${projection.hub.hero.editionNumber}` : undefined}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Delegations", projection.overview.participantCount],
            ["Revealed entries", projection.overview.entryCount],
            ["Public shows", projection.overview.showCount],
            ["Semi-finals", projection.overview.semiFinalCount],
          ].map(([label, value]) => (
            <V3Surface key={String(label)} className="p-4">
              <p className="text-2xl font-black tabular-nums tracking-[-0.04em]">{value}</p>
              <p className="mt-1 text-[0.68rem] font-semibold text-white/45">{label}</p>
            </V3Surface>
          ))}
        </div>
      </V3Section>

      <V3Section title="Participants" meta={`${projection.participants.length} public`}>
        {participantPreview.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {participantPreview.map((participant) => (
              <V3Surface key={participant.id} className="px-4 py-2.5">
                <IdentityRow
                  item={participant}
                  detail={participant.shortCode}
                  trailing={
                    <V3StatusChip tone={participantTone(participant.participationStatus)}>
                      {participantLabel(participant.participationStatus)}
                    </V3StatusChip>
                  }
                />
              </V3Surface>
            ))}
          </div>
        ) : (
          <V3Surface className="p-4"><p className="text-sm text-white/52">No public participants yet.</p></V3Surface>
        )}
        {projection.participants.length ? (
          <V3ActionCard
            title={`View all ${projection.participants.length} participants`}
            description="Open the complete public delegation collection"
            icon={Flag}
            tone="neutral"
            to={v3EditionViewHref(projection.hub.hero.href, "participants")}
          />
        ) : null}
      </V3Section>

      {spoilerSafe ? (
        <ProtectedSection
          title="Songs & artists"
          description="Artist and song names stay hidden until you deliberately reveal this Edition."
        />
      ) : (
        <V3Section title="Songs & artists" meta={`${projection.entries.length} revealed`}>
          {entryPreview.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {entryPreview.map((entry) => (
                <V3Surface key={entry.id} className="px-4 py-2.5">
                  <IdentityRow
                    item={entry}
                    detail={
                      [entry.song ? `“${entry.song}”` : null, entry.artist]
                        .filter(Boolean)
                        .join(" · ") || "Entry details published"
                    }
                    trailing={<Music2 className="size-4 shrink-0 text-white/30" aria-hidden="true" />}
                  />
                </V3Surface>
              ))}
            </div>
          ) : (
            <V3Surface className="p-4"><p className="text-sm text-white/52">No songs are public yet.</p></V3Surface>
          )}
          {projection.entries.length ? (
            <V3ActionCard
              title={`Browse all ${projection.entries.length} songs`}
              description="Open the complete revealed song collection for this edition"
              icon={Music2}
              tone="neutral"
              to={v3EditionViewHref(projection.hub.hero.href, "songs")}
            />
          ) : null}
        </V3Section>
      )}

      <V3Section title="Schedule" meta={`${projection.shows.length} public shows`}>
        {showPreview.length ? (
          <div className="grid gap-3">
            {showPreview.map((show) => (
              <V3ActionCard
                key={show.id}
                title={show.name}
                description={[
                  show.kind.replaceAll("-", " "),
                  show.runningOrderAvailable ? "running order public" : null,
                  !spoilerSafe && show.resultsAvailable ? "results available" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                icon={CalendarDays}
                tone="neutral"
                to={show.href}
              />
            ))}
          </div>
        ) : (
          <V3Surface className="p-4"><p className="text-sm text-white/52">No public shows yet.</p></V3Surface>
        )}
        {projection.shows.length ? (
          <V3ActionCard
            title="Open full schedule"
            description="See every public show in canonical edition order"
            icon={CalendarDays}
            tone="neutral"
            to={v3EditionViewHref(projection.hub.hero.href, "schedule")}
          />
        ) : null}
      </V3Section>

      {spoilerSafe ? (
        <ProtectedSection
          title="Stories"
          description="Published story titles, introductions and narrative moments stay hidden until this Edition is revealed."
        />
      ) : projection.story ? (
        <V3Section title="Stories" meta="Published editorial timeline">
          <V3Surface level="raised" className="p-5">
            <p className="v3-kicker">{projection.story.title}</p>
            {projection.story.subtitle ? <p className="mt-2 text-sm text-white/55">{projection.story.subtitle}</p> : null}
            {storyPreview?.length ? (
              <div className="mt-4 grid gap-3">
                {storyPreview.map((item) => (
                  <div key={item.id} className="border-t border-white/[0.06] pt-3 first:border-0 first:pt-0">
                    <p className="text-sm font-semibold">{item.headline}</p>
                    <p className="mt-1 text-xs leading-5 text-white/48">{item.summary}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </V3Surface>
          <V3ActionCard
            title="Open full story"
            description="Read the complete published edition timeline"
            icon={BookOpen}
            tone="neutral"
            to={projection.story.href}
          />
        </V3Section>
      ) : (
        <V3Section title="Stories">
          <V3Surface className="p-4"><p className="text-sm text-white/52">No published edition story yet.</p></V3Surface>
        </V3Section>
      )}

      {spoilerSafe ? (
        <ProtectedSection
          title="Results"
          description="Official placements, points and result links stay hidden until this Edition is revealed."
        />
      ) : (
        <V3Section title="Results">
          {projection.results.state === "locked" ? (
            <V3Surface className="flex items-start gap-3 p-5">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-white/45" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Official results are still locked</p>
                <p className="mt-1 text-xs leading-5 text-white/48">Placements and points appear only after official result publication.</p>
              </div>
            </V3Surface>
          ) : projection.results.state === "empty" ? (
            <V3Surface className="p-4"><p className="text-sm text-white/52">No ranked rows are available yet.</p></V3Surface>
          ) : (
            <>
              <V3Surface level="raised" className="overflow-hidden">
                <ol className="divide-y divide-white/[0.055]">
                  {resultPreview.map((row) => (
                    <li key={row.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                      <span className="w-7 shrink-0 text-sm font-black tabular-nums text-white/55">#{row.rank}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{row.totalPoints} pts</span>
                    </li>
                  ))}
                </ol>
              </V3Surface>
              {projection.results.showHref ? (
                <V3ActionCard
                  title="Open complete official result"
                  description="Continue in Results for the full ranking and breakdown"
                  icon={Trophy}
                  tone="neutral"
                  to={projection.results.showHref}
                />
              ) : null}
            </>
          )}
        </V3Section>
      )}

      {spoilerSafe ? (
        <p className="px-1 text-xs leading-5 text-white/45">
          Revealing is local to this Edition view. Your spoiler-free preference stays unchanged.
        </p>
      ) : null}
    </V3Screen>
  );
}

function ProtectedSongsCollection({
  projection,
  onReveal,
}: {
  projection: V3EditionPageProjection;
  onReveal: () => void;
}) {
  return (
    <V3Screen>
      <CollectionBackLink projection={projection} />
      <V3ScreenHeader
        kicker="Edition · Songs"
        title={projection.hub.hero.name}
        description="Song and artist details are spoiler protected"
        editorial
      />
      <SpoilerRevealCard onReveal={onReveal} />
      <ProtectedSection
        title="Songs & artists"
        description="Reveal this Edition to browse its published songs and artists."
      />
    </V3Screen>
  );
}

/**
 * Canonical Edition product surface for the V3 app. It deliberately keeps the
 * Overview bounded and turns long collections into opt-in views while reusing
 * the exact same publication-safe Edition projection. No collection view owns
 * fetching, publication authority, result calculation, or browser-side timing.
 */
export function V3EditionProductScreen({
  projection,
  hideSpoilers,
  view,
}: V3EditionProductScreenProps) {
  const [revealed, setRevealed] = useState(false);
  const spoilerSafe = hideSpoilers && !revealed;

  if (view === "songs" && spoilerSafe) {
    return <ProtectedSongsCollection projection={projection} onReveal={() => setRevealed(true)} />;
  }

  if (view) {
    return (
      <EditionCollectionScreen
        projection={projection}
        view={view}
        spoilerSafe={spoilerSafe}
      />
    );
  }

  return (
    <EditionOverview
      projection={projection}
      spoilerSafe={spoilerSafe}
      onReveal={() => setRevealed(true)}
    />
  );
}
