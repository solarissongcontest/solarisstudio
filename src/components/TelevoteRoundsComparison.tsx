import { Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import type { ResultRow } from "@/lib/data";
import type { EntityDisplay } from "@/lib/entities";
import { parseTelevoteComponents, type TelevoteRound } from "@/lib/voting";

type MultiRoundResult = ResultRow & {
  televote_components?: unknown;
};

type RoundStanding = {
  countryId: string;
  points: number;
  rawVotes: number | null;
  percentage: number | null;
  rank: number;
  finalRank: number | null;
};

function standingsForRound(results: MultiRoundResult[], round: TelevoteRound): RoundStanding[] {
  const sorted = results
    .map((result) => {
      const component = parseTelevoteComponents(result.televote_components).find(
        (item) => item.round_id === round.id,
      );

      return {
        countryId: result.country_id,
        points: component?.points ?? 0,
        rawVotes: component?.raw_votes ?? null,
        percentage: component?.percentage ?? null,
        finalRank: result.final_rank,
      };
    })
    .sort((a, b) => b.points - a.points || (a.finalRank ?? 9999) - (b.finalRank ?? 9999));

  let previousPoints: number | null = null;
  let previousRank = 0;

  return sorted.map((row, index) => {
    const rank = previousPoints !== null && row.points === previousPoints ? previousRank : index + 1;
    previousPoints = row.points;
    previousRank = rank;
    return { ...row, rank };
  });
}

export function TelevoteRoundsComparison({
  results,
  rounds,
  countries,
}: {
  results: MultiRoundResult[];
  rounds: TelevoteRound[];
  countries: Map<string, EntityDisplay>;
}) {
  const roundData = rounds.map((round) => ({
    round,
    standings: standingsForRound(results, round),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {roundData.map(({ round, standings }) => {
        const total = standings.reduce((sum, row) => sum + row.points, 0);
        const hasRawVotes = standings.some((row) => row.rawVotes != null);
        const hasPercentages = standings.some((row) => row.percentage != null);

        return (
          <Panel
            key={round.id}
            title={`${round.label} · ${round.weight}%`}
            description={`${total.toLocaleString()} points in this public-vote round.`}
          >
            <div className="divide-y divide-border/60">
              {standings.map((standing) => {
                const country = countries.get(standing.countryId);
                if (!country) return null;

                return (
                  <div
                    key={standing.countryId}
                    className="grid grid-cols-[34px_42px_1fr_auto] items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="numeric text-xs text-muted-foreground">#{standing.rank}</span>
                    <FlagChip
                      code={country.short_code}
                      color={country.accent_color}
                      image={country.flag_image}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{country.name}</p>
                      {(hasRawVotes || hasPercentages) && (
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {[
                            hasRawVotes && standing.rawVotes != null
                              ? `${standing.rawVotes} ${standing.rawVotes === 1 ? "vote" : "votes"}`
                              : null,
                            hasPercentages && standing.percentage != null
                              ? `${standing.percentage.toFixed(2).replace(/\.00$/, "")}%`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className="numeric text-sm font-bold text-foreground">{standing.points}</span>
                  </div>
                );
              })}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
