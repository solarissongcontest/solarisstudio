import { Link } from "@tanstack/react-router";
import { CalendarDays, Eye, Flag, LockKeyhole } from "lucide-react";
import { useState } from "react";

import type { V3EditionPageProjection } from "@/lib/v3-edition";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";
import { V3EditionHubScreen } from "./V3EditionHubScreen";

function ProtectedSection({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <V3Section title={title} meta="Spoiler protected" className="scroll-mt-24">
      <div id={id}>
        <V3Surface className="flex items-start gap-3 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.055] text-white/45">
            <LockKeyhole className="size-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">Hidden while spoiler-free mode is on</p>
            <p className="mt-1 text-xs leading-5 text-white/48">{description}</p>
          </div>
        </V3Surface>
      </div>
    </V3Section>
  );
}

export function V3EditionSpoilerSafeScreen({
  projection,
  hideSpoilers,
}: {
  projection: V3EditionPageProjection;
  hideSpoilers: boolean;
}) {
  const [revealed, setRevealed] = useState(false);

  if (!hideSpoilers || revealed) {
    return <V3EditionHubScreen projection={projection} />;
  }

  const meta = [projection.hub.hero.hostLabel, projection.hub.hero.year?.toString()]
    .filter(Boolean)
    .join(" · ");

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Edition"
        title={projection.hub.hero.name}
        description={meta || "Explore this Solaris edition"}
        editorial
      />

      <V3Surface level="raised" className="p-5" data-v3-edition-spoiler-protected="">
        <div className="flex flex-wrap items-center gap-2">
          <V3StatusChip tone="warning">Spoiler-free</V3StatusChip>
          {projection.hub.hero.resultsAvailable ? (
            <V3StatusChip tone="neutral">Official result published</V3StatusChip>
          ) : null}
        </div>
        <h2 className="mt-4 text-xl font-bold tracking-[-0.03em]">
          Edition spoilers are hidden
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
          Published story titles, narrative moments, entry details, placements and points stay hidden because spoiler-free mode is on. Public edition identity, participants and show schedule remain available below.
        </p>
        <button
          type="button"
          onClick={() => setRevealed(true)}
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)]"
        >
          <Eye className="size-4" aria-hidden="true" />
          Reveal edition spoilers
        </button>
      </V3Surface>

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

      <V3Section title="At a glance" meta="Spoiler-safe" className="scroll-mt-24">
        <div id="edition-overview" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Delegations", projection.overview.participantCount],
            ["Public shows", projection.overview.showCount],
            ["Semi-finals", projection.overview.semiFinalCount],
            ["Revealed entries", projection.overview.entryCount],
          ].map(([label, value]) => (
            <V3Surface key={String(label)} className="p-4">
              <p className="text-2xl font-black tabular-nums tracking-[-0.04em]">{value}</p>
              <p className="mt-1 text-[0.68rem] font-semibold text-white/45">{label}</p>
            </V3Surface>
          ))}
        </div>
      </V3Section>

      <V3Section title="Participants" meta={`${projection.participants.length} public`} className="scroll-mt-24">
        <div id="edition-participants">
          {projection.participants.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {projection.participants.map((participant) => {
                const row = (
                  <V3Surface className="flex min-h-16 items-center gap-3 px-4 py-3">
                    <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/[0.055] text-[0.65rem] font-black text-white/75">
                      {participant.flagImage ? (
                        <img
                          src={participant.flagImage}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <Flag className="size-4" aria-hidden="true" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{participant.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-white/45">
                        {participant.shortCode}
                        {participant.participationStatus === "confirmed"
                          ? ""
                          : ` · ${participant.participationStatus}`}
                      </span>
                    </span>
                  </V3Surface>
                );
                return participant.href ? (
                  <Link key={participant.id} to={participant.href as any} className="block">
                    {row}
                  </Link>
                ) : (
                  <div key={participant.id}>{row}</div>
                );
              })}
            </div>
          ) : (
            <V3Surface className="p-4">
              <p className="text-sm text-white/52">No public participants yet.</p>
            </V3Surface>
          )}
        </div>
      </V3Section>

      <ProtectedSection
        id="edition-songs"
        title="Songs & artists"
        description="Artist and song names remain withheld here until you deliberately reveal this Edition. The section stays in place so the Edition structure does not change underneath you."
      />

      <V3Section title="Schedule" meta={`${projection.shows.length} public shows`} className="scroll-mt-24">
        <div id="edition-schedule">
          {projection.shows.length ? (
            <div className="grid gap-3">
              {projection.shows.map((show) => (
                <V3ActionCard
                  key={show.id}
                  title={show.name}
                  description={[
                    show.kind.replaceAll("-", " "),
                    show.runningOrderAvailable ? "running order public" : null,
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
        </div>
      </V3Section>

      <ProtectedSection
        id="edition-stories"
        title="Stories"
        description="Published story titles, introductions and narrative moments stay hidden until this Edition is revealed."
      />

      <ProtectedSection
        id="edition-results"
        title="Results"
        description="Official placements, points, qualification outcomes and result links stay hidden until this Edition is revealed."
      />

      <p className="px-1 text-xs leading-5 text-white/45">
        Revealing is local to this Edition view. Your spoiler-free preference stays unchanged.
      </p>
    </V3Screen>
  );
}
