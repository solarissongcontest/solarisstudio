import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Flag,
  LockKeyhole,
  Music2,
  Radio,
  Trophy,
} from "lucide-react";

import type {
  V3EditionEntry,
  V3EditionPageProjection,
  V3EditionParticipant,
} from "@/lib/v3-edition";
import type { V3EditionSectionKey } from "@/lib/v3-explore";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
  type V3StatusTone,
} from "./V3Foundation";

export type V3EditionHubScreenProps = {
  projection: V3EditionPageProjection;
};

const SECTION_DESCRIPTIONS: Record<V3EditionSectionKey, string> = {
  overview: "Edition identity and public contest context",
  participants: "Public delegations participating in this edition",
  songs: "Artists and songs that have cleared their publication gate",
  schedule: "Public shows in canonical edition order",
  stories: "Published editorial story for this edition",
  results: "Official published Grand Final result",
};

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

function editionMeta(projection: V3EditionPageProjection): string {
  return [projection.hub.hero.hostLabel, projection.hub.hero.year?.toString()]
    .filter(Boolean)
    .join(" · ");
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
    <Link to={item.href as any} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
      {body}
    </Link>
  ) : body;
}

/**
 * Presentation-only complete Edition composition. Every item it receives has
 * already crossed the server publication boundary. The screen never fetches,
 * infers result visibility, reads storage, or owns result analysis.
 */
export function V3EditionHubScreen({ projection }: V3EditionHubScreenProps) {
  const status = experiencePresentation(projection.hub.hero.experience);
  const meta = editionMeta(projection);

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Edition"
        title={projection.hub.hero.name}
        description={meta || "Explore this Solaris edition"}
        editorial
      />

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

      <nav aria-label={`Explore ${projection.hub.hero.name}`} className="flex flex-wrap gap-2">
        {projection.hub.sections.map((section) =>
          section.state === "available" ? (
            <a
              key={section.key}
              href={section.href}
              className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/[0.07] hover:text-white"
            >
              {section.label}
            </a>
          ) : (
            <span
              key={section.key}
              className="rounded-full border border-white/[0.06] px-3 py-2 text-xs font-semibold text-white/32"
              aria-disabled="true"
            >
              {section.label}
            </span>
          ),
        )}
      </nav>

      <V3Section
        title="At a glance"
        meta={projection.hub.hero.editionNumber != null ? `SSC ${projection.hub.hero.editionNumber}` : undefined}
        className="scroll-mt-24"
      >
        <div id="edition-overview" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

      <V3Section
        title="Participants"
        meta={`${projection.participants.length} public`}
        className="scroll-mt-24"
      >
        <div id="edition-participants" className="grid gap-2 sm:grid-cols-2">
          {projection.participants.length ? (
            projection.participants.map((participant) => (
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
            ))
          ) : (
            <V3Surface className="p-4 sm:col-span-2">
              <p className="text-sm font-semibold">No public participants yet</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                Delegations appear here only after the official participant publication gate opens.
              </p>
            </V3Surface>
          )}
        </div>
      </V3Section>

      <V3Section
        title="Songs & artists"
        meta={`${projection.entries.length} revealed`}
        className="scroll-mt-24"
      >
        <div id="edition-songs" className="grid gap-2 sm:grid-cols-2">
          {projection.entries.length ? (
            projection.entries.map((entry) => (
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
            ))
          ) : (
            <V3Surface className="p-4 sm:col-span-2">
              <p className="text-sm font-semibold">No songs are public yet</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                Artist and song details remain hidden until their existing publication rules allow them.
              </p>
            </V3Surface>
          )}
        </div>
      </V3Section>

      <V3Section
        title="Schedule"
        meta={`${projection.shows.length} public shows`}
        className="scroll-mt-24"
      >
        <div id="edition-schedule" className="grid gap-3">
          {projection.shows.length ? (
            projection.shows.map((show) => (
              <V3ActionCard
                key={show.id}
                title={show.name}
                description={[
                  show.kind.replaceAll("-", " "),
                  show.participantCount ? `${show.participantCount} entries` : null,
                  show.runningOrderAvailable ? "running order public" : null,
                  show.resultsAvailable ? "results available" : null,
                ].filter(Boolean).join(" · ")}
                icon={CalendarDays}
                tone="neutral"
                to={show.href}
              />
            ))
          ) : (
            <V3Surface className="p-4">
              <p className="text-sm font-semibold">No public shows yet</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                Show information appears here only after it becomes public.
              </p>
            </V3Surface>
          )}
        </div>
      </V3Section>

      <V3Section title="Stories" className="scroll-mt-24">
        <div id="edition-stories">
          {projection.story ? (
            <V3Surface level="raised" className="p-5">
              <p className="v3-kicker">Published story</p>
              <h3 className="mt-2 text-xl font-bold tracking-[-0.03em]">{projection.story.title}</h3>
              {projection.story.subtitle ? (
                <p className="mt-1 text-sm text-white/55">{projection.story.subtitle}</p>
              ) : null}
              {projection.story.introduction ? (
                <p className="mt-4 text-sm leading-6 text-white/62">{projection.story.introduction}</p>
              ) : null}
              {projection.story.items.length ? (
                <div className="mt-5 grid gap-3">
                  {projection.story.items.slice(0, 5).map((item) => (
                    <V3Surface key={item.id} className="p-4">
                      <p className="text-sm font-semibold">{item.headline}</p>
                      <p className="mt-1 text-xs leading-5 text-white/48">{item.summary}</p>
                    </V3Surface>
                  ))}
                </div>
              ) : null}
            </V3Surface>
          ) : (
            <V3Surface className="p-4">
              <p className="text-sm font-semibold">No published edition story yet</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                Editorial material appears only after its existing publication workflow completes.
              </p>
            </V3Surface>
          )}
        </div>
      </V3Section>

      <V3Section title="Results" className="scroll-mt-24">
        <div id="edition-results">
          {projection.results.state === "locked" ? (
            <V3Surface className="p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.055] text-white/45">
                  <LockKeyhole className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Official results are still locked</p>
                  <p className="mt-1 text-xs leading-5 text-white/48">
                    Solaris will not expose placements or points here before the Grand Final result publication gate opens.
                  </p>
                </div>
              </div>
            </V3Surface>
          ) : projection.results.state === "empty" ? (
            <V3Surface className="p-4">
              <p className="text-sm font-semibold">Results are public, but no ranked rows are available yet</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                This page will update from the canonical result source when ranked data exists.
              </p>
            </V3Surface>
          ) : (
            <div className="grid gap-3">
              <V3Surface level="raised" className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                  <div>
                    <p className="v3-kicker">Official result</p>
                    <p className="mt-1 text-sm font-semibold">Grand Final ranking</p>
                  </div>
                  <Trophy className="size-5 text-white/45" aria-hidden="true" />
                </div>
                <ol className="divide-y divide-white/[0.055]">
                  {projection.results.rows.slice(0, 10).map((row) => (
                    <li key={row.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                      <span className="w-7 shrink-0 text-sm font-black tabular-nums text-white/55">#{row.rank}</span>
                      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.055] text-[0.58rem] font-black text-white/70">
                        {row.flagImage ? (
                          <img src={row.flagImage} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          row.shortCode.slice(0, 3)
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        {row.href ? (
                          <Link to={row.href as any} className="truncate text-sm font-semibold hover:underline">
                            {row.name}
                          </Link>
                        ) : (
                          <span className="block truncate text-sm font-semibold">{row.name}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{row.totalPoints} pts</span>
                    </li>
                  ))}
                </ol>
              </V3Surface>
              {projection.results.showHref ? (
                <V3ActionCard
                  title="Open official result"
                  description="View the full published show result in Results"
                  icon={Trophy}
                  tone="neutral"
                  to={projection.results.showHref}
                />
              ) : null}
            </div>
          )}
        </div>
      </V3Section>

      <V3Section title="Explore this edition" meta={`${projection.hub.sections.length} sections`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {projection.hub.sections.map((section) => {
            if (section.state === "locked") {
              return (
                <V3Surface key={section.key} className="p-4">
                  <div className="flex min-h-16 items-start gap-3">
                    <LockKeyhole className="mt-1 size-4 shrink-0 text-white/35" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold">{section.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-white/48">Available after official publication</span>
                    </span>
                  </div>
                </V3Surface>
              );
            }
            if (section.state === "empty") {
              return (
                <V3Surface key={section.key} className="p-4">
                  <div className="flex min-h-16 items-start gap-3">
                    <Flag className="mt-1 size-4 shrink-0 text-white/35" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold">{section.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-white/48">Nothing public here yet</span>
                    </span>
                  </div>
                </V3Surface>
              );
            }
            return (
              <V3ActionCard
                key={section.key}
                title={section.label}
                description={SECTION_DESCRIPTIONS[section.key]}
                tone="neutral"
                to={section.href}
              />
            );
          })}
        </div>
      </V3Section>
    </V3Screen>
  );
}
