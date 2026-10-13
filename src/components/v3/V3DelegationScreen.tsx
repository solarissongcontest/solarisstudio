import { Archive, BarChart3, BookOpen, GitCompareArrows } from "lucide-react";

import type { V3CountryExploreProjection } from "@/lib/v3-explore-entities";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
  type V3StatusTone,
} from "./V3Foundation";

export type V3DelegationScreenProps = {
  projection: V3CountryExploreProjection;
};

function statusPresentation(status: string | null): {
  label: string;
  tone: V3StatusTone;
} | null {
  if (!status) return null;
  switch (status.toLowerCase()) {
    case "withdrawn":
      return { label: "Withdrawn", tone: "warning" };
    case "disqualified":
      return { label: "Disqualified", tone: "danger" };
    case "confirmed":
      return { label: "Participating", tone: "success" };
    default:
      return { label: status, tone: "neutral" };
  }
}

function entryTitle(entry: V3CountryExploreProjection["participationHistory"][number]) {
  return [entry.artist, entry.song].filter(Boolean).join(" · ") || "Entry details not revealed";
}

/**
 * Presentation-only public Delegation detail. Results, ranks, points, voting
 * analytics, publication decisions and following mutations remain owned by
 * their canonical Solaris surfaces.
 */
export function V3DelegationScreen({ projection }: V3DelegationScreenProps) {
  const currentStatus = projection.currentEntry
    ? statusPresentation(projection.currentEntry.status)
    : null;
  const wiki = projection.actions.wiki;
  const compare = projection.actions.compare;

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Delegation"
        title={projection.name}
        description={
          [projection.code, projection.nativeName, projection.region]
            .filter(Boolean)
            .join(" · ") || "Solaris Song Contest delegation"
        }
        editorial
      />

      <V3Surface level="raised" className="overflow-hidden">
        <div className="grid gap-5 p-5 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
          <div className="mx-auto aspect-[3/2] w-full max-w-40 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            {projection.flag.src ? (
              <img
                src={projection.flag.src}
                alt={projection.flag.alt}
                className="h-full w-full object-cover"
                loading="eager"
              />
            ) : (
              <div className="grid h-full place-items-center text-2xl font-black tracking-[0.12em] text-white/72">
                {projection.code}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="v3-kicker">{projection.code}</p>
            {projection.nativeName && projection.nativeName !== projection.name ? (
              <p className="mt-2 text-sm font-semibold text-white/70">{projection.nativeName}</p>
            ) : null}
            {projection.description ? (
              <p className="mt-3 text-sm leading-6 text-white/58">{projection.description}</p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-white/48">
                Public Solaris delegation identity and published entry history.
              </p>
            )}
          </div>
        </div>
      </V3Surface>

      <V3Section title="Current entry">
        {projection.currentEntry ? (
          <V3Surface className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{entryTitle(projection.currentEntry)}</p>
                <p className="mt-1 text-xs leading-5 text-white/48">
                  {projection.currentEntry.editionLabel}
                </p>
              </div>
              {currentStatus ? (
                <V3StatusChip tone={currentStatus.tone}>{currentStatus.label}</V3StatusChip>
              ) : null}
            </div>
          </V3Surface>
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">No public entry yet</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Entry details appear only after the canonical publication rules expose them.
            </p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section
        title="Participation history"
        meta={
          projection.participationHistory.length
            ? `${projection.participationHistory.length} edition${projection.participationHistory.length === 1 ? "" : "s"}`
            : undefined
        }
      >
        {projection.participationHistory.length ? (
          <div className="grid gap-2">
            {projection.participationHistory.slice(0, 10).map((entry) => {
              const status = statusPresentation(entry.status);
              return (
                <V3Surface key={entry.editionId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{entry.editionLabel}</p>
                      <p className="mt-1 truncate text-xs text-white/48">{entryTitle(entry)}</p>
                    </div>
                    {status ? <V3StatusChip tone={status.tone}>{status.label}</V3StatusChip> : null}
                  </div>
                </V3Surface>
              );
            })}
          </div>
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm text-white/52">No published participation history is available yet.</p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section title="Explore more">
        <div className="grid gap-3 sm:grid-cols-2">
          <V3ActionCard
            title="Results"
            description="Placements, points and score analysis"
            icon={BarChart3}
            tone="neutral"
            to={projection.resultsDestination}
          />
          {wiki ? (
            <V3ActionCard
              title={wiki.label}
              description="Open the public Solaris reference profile"
              icon={BookOpen}
              tone="neutral"
              to={wiki.href}
            />
          ) : null}
          {compare ? (
            <V3ActionCard
              title={compare.label}
              description="Compare this delegation with another country"
              icon={GitCompareArrows}
              tone="neutral"
              to={compare.href}
            />
          ) : null}
          <V3ActionCard
            title="All delegations"
            description="Return to the public country archive"
            icon={Archive}
            tone="neutral"
            to="/countries"
          />
        </div>
      </V3Section>

      <p className="px-1 text-xs leading-5 text-white/40">
        Delegation detail is publication-safe. Placements, points and voting analysis remain authoritative in Results and dedicated analysis surfaces.
      </p>
    </V3Screen>
  );
}
