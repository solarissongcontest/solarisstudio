import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

export type V3ResultStanding = {
  rank: number;
  country: string;
  points: number;
  detail?: string | null;
};

export type V3ResultLink = {
  id: string;
  title: string;
  description: string;
  to?: string;
};

export type V3ResultsScreenProps = {
  editionLabel: string;
  showLabel: string;
  official: boolean;
  spoilersHidden?: boolean;
  podium?: readonly V3ResultStanding[];
  ownResult?: V3ResultStanding | null;
  exploreResult?: readonly V3ResultLink[];
  moreAnalysis?: readonly V3ResultLink[];
};

function standingLabel(standing: V3ResultStanding) {
  return `${standing.rank}. ${standing.country}`;
}

/**
 * Results is outcome-first. The official result appears before scorecharts and
 * analysis tools; spoiler-protected users receive an explicit reveal surface
 * rather than winner/rank/points leaking through decorative metadata.
 */
export function V3ResultsScreen({
  editionLabel,
  showLabel,
  official,
  spoilersHidden = false,
  podium = [],
  ownResult = null,
  exploreResult = [],
  moreAnalysis = [],
}: V3ResultsScreenProps) {
  return (
    <V3Screen>
      <V3ScreenHeader
        kicker={editionLabel}
        title="Results"
        description={`${showLabel} · Official outcome first, analysis second.`}
        editorial
      />

      <V3Section
        title={showLabel}
        meta={
          <V3StatusChip tone={official ? "success" : "progress"}>
            {official ? "Official" : "Preparing"}
          </V3StatusChip>
        }
      >
        {spoilersHidden ? (
          <V3Surface level="raised" className="p-5">
            <p className="v3-kicker">Spoiler protection</p>
            <h2 className="mt-2 text-[1.55rem] font-bold leading-[1.02] tracking-[-0.045em]">
              Results are available
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/52">
              Winner, ranking and points stay hidden until you choose to reveal them.
            </p>
            <div className="mt-4">
              <V3ActionCard
                title="Reveal results"
                description="Open the official result"
                tone="neutral"
                to="/results"
              />
            </div>
          </V3Surface>
        ) : podium.length ? (
          <V3Surface level="raised" className="p-5">
            <p className="v3-kicker">Podium</p>
            <div className="mt-4 grid gap-2">
              {podium.slice(0, 3).map((standing) => (
                <div
                  key={`${standing.rank}:${standing.country}`}
                  className="flex items-center justify-between gap-4 rounded-[16px] border border-white/[0.07] bg-white/[0.025] px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{standingLabel(standing)}</p>
                    {standing.detail ? (
                      <p className="mt-1 text-xs text-white/45">{standing.detail}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-white">
                    {standing.points}
                  </span>
                </div>
              ))}
            </div>
          </V3Surface>
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">No published result yet</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Solaris will show the official outcome here when publication is complete.
            </p>
          </V3Surface>
        )}
      </V3Section>

      {!spoilersHidden && ownResult ? (
        <V3Section title="Your result">
          <V3Surface level="raised" className="p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="v3-kicker">Your delegation</p>
                <h2 className="mt-2 text-2xl font-bold tracking-[-0.04em]">{ownResult.country}</h2>
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold tabular-nums">#{ownResult.rank}</div>
                <div className="mt-1 text-xs tabular-nums text-white/48">{ownResult.points} points</div>
              </div>
            </div>
          </V3Surface>
        </V3Section>
      ) : null}

      {!spoilersHidden && exploreResult.length ? (
        <V3Section title="Explore this result">
          <div className="v3-preview-grid">
            {exploreResult.slice(0, 4).map((item) => (
              <V3ActionCard
                key={item.id}
                title={item.title}
                description={item.description}
                tone="neutral"
                to={item.to}
              />
            ))}
          </div>
        </V3Section>
      ) : null}

      {!spoilersHidden && moreAnalysis.length ? (
        <V3Section title="More analysis" meta="Power tools">
          <div className="v3-preview-grid">
            {moreAnalysis.slice(0, 8).map((item) => (
              <V3ActionCard
                key={item.id}
                title={item.title}
                description={item.description}
                tone="neutral"
                to={item.to}
              />
            ))}
          </div>
        </V3Section>
      ) : null}
    </V3Screen>
  );
}
