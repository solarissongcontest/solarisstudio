import { CalendarDays, LockKeyhole, Radio } from "lucide-react";

import type { V3EditionHubProjection, V3EditionSectionKey } from "@/lib/v3-explore";
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
  projection: V3EditionHubProjection;
};

const SECTION_DESCRIPTIONS: Record<V3EditionSectionKey, string> = {
  overview: "Edition identity, host context and the public story so far",
  participants: "Public delegations and participants in this edition",
  songs: "Public entries and their canonical song information",
  schedule: "Shows and other public edition dates",
  stories: "Editorial stories connected to this edition",
  results: "Official published result for this edition",
};

function experiencePresentation(
  experience: V3EditionHubProjection["hero"]["experience"],
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

function editionMeta(projection: V3EditionHubProjection): string {
  return [projection.hero.hostLabel, projection.hero.year?.toString()].filter(Boolean).join(" · ");
}

/**
 * Presentation-only Edition hub over the canonical Explore projection.
 * Results visibility and Live availability are already resolved upstream.
 */
export function V3EditionHubScreen({ projection }: V3EditionHubScreenProps) {
  const status = experiencePresentation(projection.hero.experience);
  const meta = editionMeta(projection);

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Edition"
        title={projection.hero.name}
        description={meta || "Explore this Solaris edition"}
        editorial
      />

      <V3Surface level="raised" className="overflow-hidden">
        {projection.hero.artworkUrl ? (
          <div className="relative aspect-[16/8] overflow-hidden border-b border-white/[0.06] bg-white/[0.025]">
            <img
              src={projection.hero.artworkUrl}
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

        <div className="flex items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <p className="v3-kicker">Solaris edition</p>
            <p className="mt-2 text-sm font-semibold leading-5 text-white/72">
              {projection.hero.resultsAvailable
                ? "Official results are published"
                : "Results remain locked until official publication"}
            </p>
          </div>
          <V3StatusChip tone={status.tone}>{status.label}</V3StatusChip>
        </div>
      </V3Surface>

      {projection.liveAction ? (
        <V3Section title="Live now" meta={<V3StatusChip tone="live">Live</V3StatusChip>}>
          <V3ActionCard
            title={projection.liveAction.label}
            description="Enter the dedicated live experience for the current show"
            icon={Radio}
            tone="neutral"
            to={projection.liveAction.href}
          />
        </V3Section>
      ) : null}

      <V3Section title="Explore this edition" meta={`${projection.sections.length} sections`}>
        <div className="grid gap-3 sm:grid-cols-2">
          {projection.sections.map((section) => {
            if (section.state === "locked") {
              return (
                <V3Surface key={section.key} className="p-4">
                  <div className="flex min-h-16 items-start gap-3">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.055] text-white/45"
                      aria-hidden="true"
                    >
                      <LockKeyhole className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{section.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-white/48">
                        Available after official publication
                      </span>
                    </span>
                  </div>
                </V3Surface>
              );
            }

            if (section.state === "empty") {
              return (
                <V3Surface key={section.key} className="p-4">
                  <div className="flex min-h-16 items-start gap-3">
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.055] text-white/45"
                      aria-hidden="true"
                    >
                      <CalendarDays className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{section.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-white/48">
                        Nothing public here yet
                      </span>
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

      {projection.hero.nextEvent ? (
        <V3Section title="Next event">
          <V3ActionCard
            title={projection.hero.nextEvent.title}
            description={projection.hero.nextEvent.startsAt ?? "Time to be announced"}
            icon={CalendarDays}
            tone="neutral"
            to={projection.hero.nextEvent.href}
          />
        </V3Section>
      ) : null}
    </V3Screen>
  );
}
