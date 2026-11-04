import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { FlagFrame } from "@/components/FlagMedia";
import { Archive, BarChart3, BookOpen, GitCompareArrows, Trophy, Vote } from "lucide-react";

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
  hideResultSpoilers: boolean;
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

function EditionContextLink({
  entry,
  className,
}: {
  entry: V3CountryExploreProjection["participationHistory"][number];
  className: string;
}) {
  if (!entry.editionHref) {
    return <p className={className}>{entry.editionLabel}</p>;
  }

  return (
    <Link to={entry.editionHref as any} className={`${className} hover:text-primary hover:underline`}>
      {entry.editionLabel}
    </Link>
  );
}

/**
 * Presentation-only public Delegation detail. Result rows arrive only from the
 * canonical publication-gated Results source and remain spoiler-protected here.
 * Voting analytics, publication decisions and following mutations stay owned by
 * their canonical Solaris surfaces.
 */
export function V3DelegationScreen({
  projection,
  hideResultSpoilers,
}: V3DelegationScreenProps) {
  const currentStatus = projection.currentEntry
    ? statusPresentation(projection.currentEntry.status)
    : null;
  const wiki = projection.actions.wiki;
  const compare = projection.actions.compare;
  const currentResult = projection.currentResult;
  const [showFullHistory, setShowFullHistory] = useState(false);
  const visibleHistory = showFullHistory
    ? projection.participationHistory
    : projection.participationHistory.slice(0, 6);

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

      <section
        data-v3-country-identity=""
        className="grid min-w-0 grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-start gap-4 border-b border-white/10 px-1 pb-5 sm:grid-cols-[160px_minmax(0,1fr)]"
        aria-label="Country identity"
      >
        <FlagFrame
          image={projection.flag.src}
          alt={projection.flag.alt}
          fallback={projection.code}
          loading="eager"
          className="block aspect-[3/2] w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
          imageClassName="block h-full w-full"
        />
        <div className="min-w-0">
          <p className="v3-kicker">{projection.code}{projection.region ? ` · ${projection.region}` : ""}</p>
          {projection.nativeName && projection.nativeName !== projection.name ? (
            <p className="mt-2 break-words text-sm font-semibold text-white/70">{projection.nativeName}</p>
          ) : null}
          {projection.description ? (
            projection.description.length > 160 ? (
              <details className="mt-3">
                <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                  About this country
                </summary>
                <p className="mt-1 break-words text-sm leading-6 text-white/65">{projection.description}</p>
              </details>
            ) : (
              <p className="mt-3 break-words text-sm leading-6 text-white/65">{projection.description}</p>
            )
          ) : (
            <p className="mt-3 text-sm leading-6 text-white/48">Published Solaris delegation identity and entry history.</p>
          )}
        </div>
      </section>

      <V3Section title="Current entry">
        {projection.currentEntry ? (
          <V3Surface className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{entryTitle(projection.currentEntry)}</p>
                <EditionContextLink
                  entry={projection.currentEntry}
                  className="mt-1 block text-xs leading-5 text-white/48"
                />
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

      {currentResult ? (
        <V3Section title="Current result">
          {hideResultSpoilers ? (
            <V3ActionCard
              title="Official result published"
              description="Spoiler-free mode is hiding this delegation's placement and points until you deliberately open the result."
              icon={Trophy}
              tone="neutral"
              to={currentResult.showHref}
            />
          ) : (
            <V3Surface level="raised" className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="v3-kicker">{currentResult.showName}</p>
                  <p className="mt-2 text-2xl font-black tracking-[-0.04em]">
                    #{currentResult.rank} · {currentResult.points} pts
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/48">
                    {currentResult.juryPoints != null ? (
                      <span>Jury {currentResult.juryPoints} pts</span>
                    ) : null}
                    {currentResult.televotePoints != null ? (
                      <span>Televote {currentResult.televotePoints} pts</span>
                    ) : null}
                  </div>
                  {currentResult.editionHref ? (
                    <Link
                      to={currentResult.editionHref as any}
                      className="mt-3 inline-block text-xs font-semibold text-white/55 hover:text-primary hover:underline"
                    >
                      {currentResult.editionLabel}
                    </Link>
                  ) : (
                    <p className="mt-3 text-xs text-white/48">{currentResult.editionLabel}</p>
                  )}
                </div>
                <V3StatusChip tone="success">Published</V3StatusChip>
              </div>
              <Link
                to={currentResult.showHref as any}
                className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm font-semibold text-white/80 transition hover:bg-white/[0.08] hover:text-white"
              >
                Open official result
              </Link>
            </V3Surface>
          )}
        </V3Section>
      ) : null}

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
            {visibleHistory.map((entry) => {
              const status = statusPresentation(entry.status);
              return (
                <V3Surface key={entry.editionId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <EditionContextLink
                        entry={entry}
                        className="block text-sm font-semibold text-white/92"
                      />
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
        {projection.participationHistory.length > 6 ? (
          <button
            type="button"
            className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white/85 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-expanded={showFullHistory}
            onClick={() => setShowFullHistory((expanded) => !expanded)}
          >
            {showFullHistory ? "Show recent editions" : `Show all ${projection.participationHistory.length} editions`}
          </button>
        ) : null}
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
          <V3ActionCard
            title="Voting relationships"
            description="Explore published historical support patterns across delegations"
            icon={Vote}
            tone="neutral"
            to="/relationships"
          />
          <V3ActionCard
            title="Stories"
            description="Published edition narratives and archive moments"
            icon={BookOpen}
            tone="neutral"
            to="/stories"
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
        Delegation detail is publication-safe. Official result context comes from the canonical Results source; deeper voting analysis remains authoritative in Results and dedicated analysis surfaces.
      </p>
    </V3Screen>
  );
}
