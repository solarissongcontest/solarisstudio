import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  Eye,
  Flag,
  LockKeyhole,
  Music2,
  Radio,
  Trophy,
} from "lucide-react";
import { useState } from "react";

import { EventTime } from "@/components/public/EventTime";
import type {
  V3EditionEntry,
  V3EditionPageProjection,
  V3EditionParticipant,
} from "@/lib/v3-edition";
import {
  V3_EDITION_OVERVIEW_LIMITS,
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
        className="grid aspect-[3/2] h-8 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.055] text-[0.62rem] font-black text-white/75"
        aria-hidden="true"
        data-v3-flag-ratio="3:2"
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
      <V3StatusChip tone="warning">Spoiler-free</V3StatusChip>
      <h2 className="mt-4 text-xl font-bold tracking-[-0.03em]">Edition spoilers are hidden</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
        Published story moments, entry details, placements and points stay hidden until you deliberately reveal this Edition.
      </p>
      <button
        type="button"
        onClick={onReveal}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
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
            className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}

export function V3EditionOverviewScreen({
  projection,
  hideSpoilers,
}: {
  projection: V3EditionPageProjection;
  hideSpoilers: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const spoilerSafe = hideSpoilers && !revealed;
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
  const featuredOutcome = prioritizeOutcome
    ? winnerRows.length
      ? winnerRows
      : resultPreview.slice(0, 1)
    : [];

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Edition"
        title={projection.hub.hero.name}
        description={meta || "Explore this Solaris edition"}
        editorial
      />

      {spoilerSafe ? (
        <SpoilerRevealCard onReveal={() => setRevealed(true)} />
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

      <V3Section
        title="At a glance"
        meta={
          projection.hub.hero.editionNumber != null
            ? `SSC ${projection.hub.hero.editionNumber}`
            : undefined
        }
      >
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
          <V3Surface className="p-4">
            <p className="text-sm text-white/52">No public participants yet.</p>
          </V3Surface>
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
            <V3Surface className="p-4">
              <p className="text-sm text-white/52">No songs are public yet.</p>
            </V3Surface>
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
          <V3Surface className="p-4">
            <p className="text-sm text-white/52">No public shows yet.</p>
          </V3Surface>
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
            {projection.story.subtitle ? (
              <p className="mt-2 text-sm text-white/55">{projection.story.subtitle}</p>
            ) : null}
            {storyPreview?.length ? (
              <div className="mt-4 grid gap-3">
                {storyPreview.map((item) => (
                  <div
                    key={item.id}
                    className="border-t border-white/[0.06] pt-3 first:border-0 first:pt-0"
                  >
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
          <V3Surface className="p-4">
            <p className="text-sm text-white/52">No published edition story yet.</p>
          </V3Surface>
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
                <p className="mt-1 text-xs leading-5 text-white/48">
                  Placements and points appear only after official result publication.
                </p>
              </div>
            </V3Surface>
          ) : projection.results.state === "empty" ? (
            <V3Surface className="p-4">
              <p className="text-sm text-white/52">No ranked rows are available yet.</p>
            </V3Surface>
          ) : (
            <>
              <V3Surface level="raised" className="overflow-hidden">
                <ol className="divide-y divide-white/[0.055]">
                  {resultPreview.map((row) => (
                    <li key={row.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                      <span className="w-7 shrink-0 text-sm font-black tabular-nums text-white/55">
                        #{row.rank}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {row.name}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {row.totalPoints} pts
                      </span>
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
