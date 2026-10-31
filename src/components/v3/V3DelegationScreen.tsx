import { Link } from "@tanstack/react-router";
import {
  Archive,
  BarChart3,
  BookOpen,
  ChevronRight,
  GitCompareArrows,
  Trophy,
  Vote,
  type LucideIcon,
} from "lucide-react";

import type { V3CountryExploreProjection } from "@/lib/v3-explore-entities";
import { V3Screen, V3Section, V3StatusChip, type V3StatusTone } from "./V3Foundation";

export type V3DelegationScreenProps = {
  projection: V3CountryExploreProjection;
  hideResultSpoilers: boolean;
};

function statusPresentation(status: string | null): { label: string; tone: V3StatusTone } | null {
  if (!status) return null;
  switch (status.toLowerCase()) {
    case "withdrawn": return { label: "Withdrawn", tone: "warning" };
    case "disqualified": return { label: "Disqualified", tone: "danger" };
    case "confirmed": return { label: "Participating", tone: "success" };
    default: return { label: status, tone: "neutral" };
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
  if (!entry.editionHref) return <p className={className}>{entry.editionLabel}</p>;
  return <Link to={entry.editionHref as any} className={`${className} hover:text-primary hover:underline`}>{entry.editionLabel}</Link>;
}

function ExploreLink({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link to={to as any} className="flex min-h-16 items-center gap-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
      <span className="grid size-9 shrink-0 place-items-center text-[var(--v3-accent-strong)]" aria-hidden="true"><Icon className="size-[18px]" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-white/45">{description}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-white/24" aria-hidden="true" />
    </Link>
  );
}

export function V3DelegationScreen({ projection, hideResultSpoilers }: V3DelegationScreenProps) {
  const currentStatus = projection.currentEntry ? statusPresentation(projection.currentEntry.status) : null;
  const wiki = projection.actions.wiki;
  const compare = projection.actions.compare;
  const currentResult = projection.currentResult;

  return (
    <V3Screen>
      <header className="grid gap-4 border-b border-white/[0.08] pb-5 sm:grid-cols-[132px_minmax(0,1fr)] sm:items-center" data-v3-delegation-header="">
        <div className="aspect-[3/2] w-28 overflow-hidden rounded-lg bg-white/[0.035] sm:w-full" data-v3-flag-ratio="3:2">
          {projection.flag.src ? (
            <img src={projection.flag.src} alt={projection.flag.alt} className="h-full w-full object-cover" loading="eager" />
          ) : (
            <div className="grid h-full place-items-center text-xl font-black tracking-[0.12em] text-white/68">{projection.code}</div>
          )}
        </div>
        <div className="min-w-0">
          <p className="v3-kicker">Delegation · {projection.code}</p>
          <h1 className="mt-2 text-[clamp(2rem,8vw,2.8rem)] font-semibold leading-[0.98] tracking-[-0.05em]">{projection.name}</h1>
          {[projection.nativeName && projection.nativeName !== projection.name ? projection.nativeName : null, projection.region].filter(Boolean).length ? (
            <p className="mt-2 text-xs text-white/48">{[projection.nativeName && projection.nativeName !== projection.name ? projection.nativeName : null, projection.region].filter(Boolean).join(" · ")}</p>
          ) : null}
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/52">{projection.description ?? "Public Solaris delegation identity and published entry history."}</p>
        </div>
      </header>

      <V3Section title="Current entry">
        {projection.currentEntry ? (
          <div className="flex items-start justify-between gap-4 border-y border-white/[0.07] py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{entryTitle(projection.currentEntry)}</p>
              <EditionContextLink entry={projection.currentEntry} className="mt-1 block text-xs leading-5 text-white/48" />
            </div>
            {currentStatus ? <V3StatusChip tone={currentStatus.tone}>{currentStatus.label}</V3StatusChip> : null}
          </div>
        ) : (
          <p className="border-y border-white/[0.07] py-4 text-sm leading-6 text-white/48">No public entry yet. Entry details appear only after canonical publication rules expose them.</p>
        )}
      </V3Section>

      {currentResult ? (
        <V3Section title="Current result">
          {hideResultSpoilers ? (
            <Link to={currentResult.showHref as any} className="flex min-h-16 items-center gap-3 border-y border-white/[0.07] py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
              <Trophy className="size-5 shrink-0 text-[var(--v3-accent-strong)]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Official result published</span>
                <span className="mt-1 block text-xs leading-5 text-white/45">Spoiler-free mode is hiding placement and points.</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-white/24" aria-hidden="true" />
            </Link>
          ) : (
            <div className="border-l-2 border-[var(--v3-accent)] pl-4" data-v3-delegation-current-result="">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="v3-kicker">{currentResult.showName}</p>
                  <p className="mt-2 text-2xl font-bold tracking-[-0.04em]">#{currentResult.rank} · {currentResult.points} pts</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/48">
                    {currentResult.juryPoints != null ? <span>Jury {currentResult.juryPoints} pts</span> : null}
                    {currentResult.televotePoints != null ? <span>Televote {currentResult.televotePoints} pts</span> : null}
                  </div>
                </div>
                <V3StatusChip tone="success">Published</V3StatusChip>
              </div>
              <Link to={currentResult.showHref as any} className="mt-4 inline-flex min-h-11 items-center font-semibold text-[var(--v3-accent-strong)]">Open official result</Link>
            </div>
          )}
        </V3Section>
      ) : null}

      <V3Section title="Participation history" meta={projection.participationHistory.length ? `${projection.participationHistory.length} edition${projection.participationHistory.length === 1 ? "" : "s"}` : undefined}>
        {projection.participationHistory.length ? (
          <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]" data-v3-delegation-history="">
            {projection.participationHistory.map((entry) => {
              const status = statusPresentation(entry.status);
              return (
                <div key={entry.editionId} className="flex min-h-16 items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <EditionContextLink entry={entry} className="block text-sm font-semibold text-white/92" />
                    <p className="mt-1 truncate text-xs text-white/48">{entryTitle(entry)}</p>
                  </div>
                  {status ? <V3StatusChip tone={status.tone}>{status.label}</V3StatusChip> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="border-y border-white/[0.07] py-4 text-sm text-white/48">No published participation history is available yet.</p>
        )}
      </V3Section>

      <V3Section title="Explore more">
        <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]">
          <ExploreLink to={projection.resultsDestination} icon={BarChart3} title="Results" description="Placements, points and score analysis" />
          <ExploreLink to="/relationships" icon={Vote} title="Voting relationships" description="Published historical support patterns" />
          <ExploreLink to="/stories" icon={BookOpen} title="Stories" description="Edition narratives and archive moments" />
          {wiki ? <ExploreLink to={wiki.href} icon={BookOpen} title={wiki.label} description="Public Solaris reference profile" /> : null}
          {compare ? <ExploreLink to={compare.href} icon={GitCompareArrows} title={compare.label} description="Compare this delegation with another country" /> : null}
          <ExploreLink to="/countries" icon={Archive} title="All delegations" description="Return to the public country archive" />
        </div>
      </V3Section>

      <p className="mt-6 text-xs leading-5 text-white/40">Delegation detail is publication-safe. Official result context comes from the canonical Results source.</p>
    </V3Screen>
  );
}
