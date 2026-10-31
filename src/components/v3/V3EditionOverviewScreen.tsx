import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Eye,
  Flag,
  LockKeyhole,
  Music2,
  Radio,
  Trophy,
} from "lucide-react";
import { useState, type ReactNode } from "react";

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
  V3Screen,
  V3Section,
  V3StatusChip,
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
  trailing?: ReactNode;
}) {
  const body = (
    <div className="flex min-h-16 items-center gap-3 py-2.5">
      <span
        className="grid aspect-[3/2] h-8 w-12 shrink-0 place-items-center overflow-hidden rounded-[0.45rem] bg-white/[0.045] text-[0.62rem] font-black text-white/70"
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
        <span className="mt-0.5 block truncate text-xs text-white/45">{detail}</span>
      </span>
      {trailing}
      {item.href ? <ChevronRight className="size-4 shrink-0 text-white/24" aria-hidden="true" /> : null}
    </div>
  );

  return item.href ? (
    <Link
      to={item.href as any}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function SectionFooterLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      to={to as any}
      className="mt-4 flex min-h-11 items-center justify-between gap-3 border-t border-white/[0.07] pt-3 text-sm font-semibold text-[var(--v3-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
      data-v3-section-footer-action=""
    >
      <span>{children}</span>
      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}

function ContextAction({
  to,
  icon: Icon,
  eyebrow,
  title,
  meta,
}: {
  to: string;
  icon: typeof Radio;
  eyebrow: string;
  title: string;
  meta?: ReactNode;
}) {
  return (
    <Link
      to={to as any}
      className="group flex min-h-16 items-center gap-3 border-b border-white/[0.07] py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.055] text-[var(--v3-accent-strong)]">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.64rem] font-bold uppercase tracking-[0.12em] text-white/38">
          {eyebrow}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold">{title}</span>
        {meta ? <span className="mt-1 block text-xs text-white/45">{meta}</span> : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-white/25 transition group-hover:text-white/50" aria-hidden="true" />
    </Link>
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
      <div className="flex items-start gap-3 border-y border-white/[0.07] py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.045] text-white/40">
          <LockKeyhole className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold">Hidden while spoiler-free mode is on</p>
          <p className="mt-1 text-xs leading-5 text-white/46">{description}</p>
        </div>
      </div>
    </V3Section>
  );
}

function SpoilerReveal({ onReveal }: { onReveal: () => void }) {
  return (
    <section className="mt-4 border-y border-amber-200/15 py-5" data-v3-edition-spoiler-protected="">
      <V3StatusChip tone="warning">Spoiler-free</V3StatusChip>
      <h2 className="mt-3 text-lg font-bold tracking-[-0.025em]">Edition spoilers are hidden</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
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
    </section>
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
    <nav
      aria-label={`Explore ${projection.hub.hero.name}`}
      className="-mx-4 mt-1 overflow-x-auto border-b border-white/[0.07] px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-v3-edition-local-nav=""
    >
      <div className="flex min-w-max gap-5">
        {links.map((item) =>
          item.locked ? (
            <span
              key={item.key}
              className="inline-flex min-h-11 items-center border-b-2 border-transparent text-xs font-semibold text-white/28"
              aria-disabled="true"
            >
              {item.label}
            </span>
          ) : (
            <Link
              key={item.key}
              to={item.href as any}
              aria-current={item.key === "overview" ? "page" : undefined}
              className="inline-flex min-h-11 items-center border-b-2 border-transparent text-xs font-semibold text-white/56 transition hover:border-white/18 hover:text-white aria-[current=page]:border-[var(--v3-accent)] aria-[current=page]:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              {item.label}
            </Link>
          ),
        )}
      </div>
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
      <header className="border-b border-white/[0.08] pb-5" data-v3-edition-hero="">
        <div className="flex items-center justify-between gap-3">
          <p className="v3-kicker">
            {projection.hub.hero.editionNumber != null
              ? `SSC ${projection.hub.hero.editionNumber}`
              : "Edition"}
          </p>
          <V3StatusChip tone={status.tone}>{status.label}</V3StatusChip>
        </div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <h1 className="max-w-[15ch] text-[clamp(1.9rem,8vw,2.7rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-balance">
              {projection.hub.hero.name}
            </h1>
            {meta ? <p className="mt-2 text-sm text-white/48">{meta}</p> : null}
          </div>
          {projection.hub.hero.artworkUrl && !spoilerSafe ? (
            <div className="aspect-[4/3] w-24 overflow-hidden rounded-xl bg-white/[0.035] sm:w-32">
              <img
                src={projection.hub.hero.artworkUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ) : null}
        </div>
        {projection.description && !spoilerSafe ? (
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/52">{projection.description}</p>
        ) : null}
        <p className="mt-3 text-xs font-medium text-white/40">
          {projection.hub.hero.resultsAvailable
            ? "Official results published"
            : "Results remain locked until official publication"}
        </p>
      </header>

      <SectionNav projection={projection} spoilerSafe={spoilerSafe} />

      {spoilerSafe ? <SpoilerReveal onReveal={() => setRevealed(true)} /> : null}

      {projection.hub.liveAction || projection.hub.hero.nextEvent ? (
        <section className="mt-5" aria-label="Current edition context">
          {projection.hub.liveAction ? (
            <ContextAction
              to={projection.hub.liveAction.href}
              icon={Radio}
              eyebrow="Live now"
              title={projection.hub.liveAction.label}
            />
          ) : null}
          {projection.hub.hero.nextEvent ? (
            <ContextAction
              to={projection.hub.hero.nextEvent.href}
              icon={CalendarDays}
              eyebrow="Coming up"
              title={projection.hub.hero.nextEvent.title}
              meta={
                projection.hub.hero.nextEvent.startsAt ? (
                  <EventTime value={projection.hub.hero.nextEvent.startsAt} label="Starts" />
                ) : (
                  "Time to be announced"
                )
              }
            />
          ) : null}
        </section>
      ) : null}

      <V3Section title="Edition snapshot" meta="Published overview">
        <dl
          className="grid grid-cols-2 border-y border-white/[0.07] sm:grid-cols-4 sm:divide-x sm:divide-white/[0.07]"
          data-v3-edition-metrics=""
        >
          {[
            ["Delegations", projection.overview.participantCount],
            ["Revealed entries", projection.overview.entryCount],
            ["Public shows", projection.overview.showCount],
            ["Semi-finals", projection.overview.semiFinalCount],
          ].map(([label, value], index) => (
            <div
              key={String(label)}
              className={`py-3 ${index % 2 === 0 ? "pr-3" : "pl-3"} ${index < 2 ? "border-b border-white/[0.07] sm:border-b-0" : ""} sm:px-4 sm:first:pl-0 sm:last:pr-0`}
            >
              <dd className="text-xl font-bold tabular-nums tracking-[-0.035em]">{value}</dd>
              <dt className="mt-1 text-[0.66rem] font-semibold text-white/40">{label}</dt>
            </div>
          ))}
        </dl>
      </V3Section>

      {!spoilerSafe && featuredOutcome.length ? (
        <V3Section title="Edition outcome" meta="Official">
          <div className="border-y border-white/[0.07]">
            {featuredOutcome.map((row) => (
              <div key={row.id} className="flex min-h-16 items-center gap-3 py-3">
                <Trophy className="size-4 shrink-0 text-[var(--v3-accent-strong)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{row.name}</span>
                  <span className="mt-0.5 block text-xs text-white/42">Official rank #{row.rank}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{row.totalPoints} pts</span>
              </div>
            ))}
          </div>
          {projection.results.showHref ? (
            <SectionFooterLink to={projection.results.showHref}>Open official result</SectionFooterLink>
          ) : null}
        </V3Section>
      ) : null}

      <V3Section title="Participants" meta={`${projection.participants.length} public`}>
        {participantPreview.length ? (
          <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
            {participantPreview.map((participant) => (
              <IdentityRow
                key={participant.id}
                item={participant}
                detail={participant.shortCode}
                trailing={
                  participant.participationStatus === "confirmed" ? null : (
                    <V3StatusChip tone={participantTone(participant.participationStatus)}>
                      {participantLabel(participant.participationStatus)}
                    </V3StatusChip>
                  )
                }
              />
            ))}
          </div>
        ) : (
          <p className="border-y border-white/[0.07] py-4 text-sm text-white/48">No public participants yet.</p>
        )}
        {projection.participants.length ? (
          <SectionFooterLink to={v3EditionViewHref(projection.hub.hero.href, "participants")}>
            View all {projection.participants.length} participants
          </SectionFooterLink>
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
            <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
              {entryPreview.map((entry) => (
                <IdentityRow
                  key={entry.id}
                  item={entry}
                  detail={
                    [entry.song ? `“${entry.song}”` : null, entry.artist]
                      .filter(Boolean)
                      .join(" · ") || "Entry details published"
                  }
                  trailing={<Music2 className="size-4 shrink-0 text-white/28" aria-hidden="true" />}
                />
              ))}
            </div>
          ) : (
            <p className="border-y border-white/[0.07] py-4 text-sm text-white/48">No songs are public yet.</p>
          )}
          {projection.entries.length ? (
            <SectionFooterLink to={v3EditionViewHref(projection.hub.hero.href, "songs")}>
              Browse all {projection.entries.length} songs
            </SectionFooterLink>
          ) : null}
        </V3Section>
      )}

      <V3Section title="Schedule" meta={`${projection.shows.length} public shows`}>
        {showPreview.length ? (
          <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
            {showPreview.map((show) => (
              <Link
                key={show.id}
                to={show.href as any}
                className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.045] text-white/45">
                  <CalendarDays className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{show.name}</span>
                  <span className="mt-1 block text-xs capitalize text-white/42">
                    {[
                      show.kind.replaceAll("-", " "),
                      show.runningOrderAvailable ? "running order public" : null,
                      !spoilerSafe && show.resultsAvailable ? "results available" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {show.startsAt ? (
                    <span className="mt-1 block text-xs text-white/40">
                      <EventTime value={show.startsAt} label="Starts" />
                    </span>
                  ) : null}
                </span>
                <ChevronRight className="size-4 shrink-0 text-white/24" aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="border-y border-white/[0.07] py-4 text-sm text-white/48">No public shows yet.</p>
        )}
        {projection.shows.length ? (
          <SectionFooterLink to={v3EditionViewHref(projection.hub.hero.href, "schedule")}>
            Open full schedule
          </SectionFooterLink>
        ) : null}
      </V3Section>

      {spoilerSafe ? (
        <ProtectedSection
          title="Stories"
          description="Published story titles, introductions and narrative moments stay hidden until this Edition is revealed."
        />
      ) : projection.story ? (
        <V3Section title="Stories" meta="Published editorial timeline">
          <article className="border-l-2 border-[var(--v3-accent)] pl-4">
            <p className="v3-kicker">{projection.story.title}</p>
            {projection.story.subtitle ? (
              <p className="mt-2 text-sm leading-6 text-white/52">{projection.story.subtitle}</p>
            ) : null}
            {storyPreview?.length ? (
              <div className="mt-4 divide-y divide-white/[0.07]">
                {storyPreview.map((item) => (
                  <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="text-sm font-semibold">{item.headline}</p>
                    <p className="mt-1 text-xs leading-5 text-white/46">{item.summary}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
          <SectionFooterLink to={projection.story.href}>Open full story</SectionFooterLink>
        </V3Section>
      ) : (
        <V3Section title="Stories">
          <p className="border-y border-white/[0.07] py-4 text-sm text-white/48">No published edition story yet.</p>
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
            <div className="flex items-start gap-3 border-y border-white/[0.07] py-4">
              <LockKeyhole className="mt-0.5 size-4 shrink-0 text-white/42" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold">Official results are still locked</p>
                <p className="mt-1 text-xs leading-5 text-white/46">
                  Placements and points appear only after official result publication.
                </p>
              </div>
            </div>
          ) : projection.results.state === "empty" ? (
            <p className="border-y border-white/[0.07] py-4 text-sm text-white/48">No ranked rows are available yet.</p>
          ) : (
            <>
              <ol className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
                {resultPreview.map((row) => (
                  <li key={row.id} className="flex min-h-14 items-center gap-3 py-2.5">
                    <span className="w-7 shrink-0 text-sm font-bold tabular-nums text-white/48">
                      #{row.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{row.totalPoints} pts</span>
                  </li>
                ))}
              </ol>
              {projection.results.showHref ? (
                <SectionFooterLink to={projection.results.showHref}>
                  Open complete official result
                </SectionFooterLink>
              ) : null}
            </>
          )}
        </V3Section>
      )}

      {spoilerSafe ? (
        <p className="mt-6 text-xs leading-5 text-white/42">
          Revealing is local to this Edition view. Your spoiler-free preference stays unchanged.
        </p>
      ) : null}
    </V3Screen>
  );
}
