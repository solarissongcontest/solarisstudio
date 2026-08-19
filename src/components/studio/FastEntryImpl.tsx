import { useMemo } from "react";
import { CountryPicker } from "@/components/CountryPicker";
import { FlagChip } from "@/components/FlagChip";
import { matchVoterKey, type Country, type JuryVote, type Televote, type VoterOption } from "@/lib/data";
import type { VotingConfig } from "@/lib/voting";
import { cn } from "@/lib/utils";

type JuryStanding = {
  country: Country;
  points: number;
  rank: number;
  originalOrder: number;
};

/**
 * High-speed jury ballot entry: one row per point value, type-ahead country
 * search, duplicate/self-vote protection, live ballot completeness and a
 * continuously updating jury-result preview.
 */
export function FastJuryEntry({
  voters,
  receivers,
  voting,
  votes,
  activeVoter,
  onVoterChange,
  onAssign,
  onClear,
  didNotVoteVoterKeys = new Set<string>(),
  onDidNotVoteChange,
}: {
  voters: VoterOption[];
  receivers: Country[];
  voting: VotingConfig;
  votes: JuryVote[];
  activeVoter: string;
  onVoterChange: (key: string) => void;
  onAssign: (voterKey: string, receiver: string, points: number) => void;
  onClear: (voterKey: string, points: number) => void;
  didNotVoteVoterKeys?: ReadonlySet<string>;
  onDidNotVoteChange?: (voterKey: string, didNotVote: boolean) => void;
}) {
  const vMap = useMemo(() => new Map(voters.map((v) => [v.key, v])), [voters]);
  const pool = receivers;
  const keyOf = useMemo(() => {
    const cache = new Map<string, string>();
    return (v: JuryVote) => {
      const cacheKey = `${v.voter_id ?? ""}|${v.voter_entity_id ?? ""}|${v.voter_country_id ?? ""}`;
      let k = cache.get(cacheKey);
      if (k === undefined) {
        k = matchVoterKey(v, voters);
        cache.set(cacheKey, k);
      }
      return k;
    };
  }, [voters]);

  const ballot = votes.filter((v) => keyOf(v) === activeVoter);
  const byPoints = new Map(ballot.map((v) => [v.points, v.receiving_country_id]));
  const activeVoterCountry = vMap.get(activeVoter)?.countryId ?? null;
  const activeDidNotVote = didNotVoteVoterKeys.has(activeVoter);

  const completeness = useMemo(() => {
    const need = voting.juryPoints.length;
    return voters.map((v) => ({
      id: v.key,
      given: votes.filter((vote) => keyOf(vote) === v.key).length,
      need,
      didNotVote: didNotVoteVoterKeys.has(v.key),
    }));
  }, [voters, votes, voting.juryPoints.length, keyOf, didNotVoteVoterKeys]);

  const resolvedCount = completeness.filter((item) => item.didNotVote || item.given >= item.need).length;
  const totalAwardedPoints = votes.reduce((sum, vote) => sum + vote.points, 0);
  const standings = useMemo<JuryStanding[]>(() => {
    const totals = new Map(receivers.map((country) => [country.id, 0]));
    votes.forEach((vote) => {
      totals.set(vote.receiving_country_id, (totals.get(vote.receiving_country_id) ?? 0) + vote.points);
    });

    const sorted = receivers
      .map((country, originalOrder) => ({
        country,
        originalOrder,
        points: totals.get(country.id) ?? 0,
      }))
      .sort((a, b) => b.points - a.points || a.originalOrder - b.originalOrder);

    let previousPoints: number | null = null;
    let previousRank = 0;
    return sorted.map((row, index) => {
      const rank = previousPoints === row.points ? previousRank : index + 1;
      previousPoints = row.points;
      previousRank = rank;
      return { ...row, rank };
    });
  }, [receivers, votes]);

  const usedReceivers = new Set(ballot.map((v) => v.receiving_country_id));

  return (
    <div className="admin-jury-entry">
      <details className="sticky top-20 z-30 mb-4 overflow-hidden rounded-xl border border-sky-200/15 bg-background/95 shadow-xl backdrop-blur lg:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3 py-2 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300/45" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-300" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-100/80">Live jury standings</p>
            <MobileLeaderSummary standings={standings} totalAwardedPoints={totalAwardedPoints} />
          </div>
          <span className="numeric shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] text-muted-foreground">
            {resolvedCount}/{voters.length}
          </span>
        </summary>
        <div className="border-t border-white/[0.07] p-2">
          <p className="mb-2 px-1 text-[10px] leading-4 text-muted-foreground">Current jury points only. The order updates after every saved score.</p>
          <JuryStandingsRows standings={standings} maxHeightClass="max-h-[48dvh]" />
        </div>
      </details>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <div className="admin-jury-voters">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Voting entity</p>
              <p className="text-[11px] text-muted-foreground">Complete or DNV resolves a jury</p>
            </div>
            <div className="admin-jury-voter-list scroll-slim flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {completeness.map((c) => {
                const voterOpt = vMap.get(c.id);
                if (!voterOpt) return null;
                const done = c.given >= c.need;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onVoterChange(c.id)}
                    className={cn(
                      "admin-jury-voter-button flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition",
                      activeVoter === c.id
                        ? "border-primary bg-primary/15"
                        : done || c.didNotVote
                          ? "border-border bg-surface"
                          : "border-destructive/40 bg-surface text-muted-foreground",
                    )}
                  >
                    <FlagChip code={voterOpt.short_code ?? "??"} color={voterOpt.accent_color} image={voterOpt.flag_image} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-left">{voterOpt.name}</span>
                    <span className={cn("numeric opacity-70", c.didNotVote && "text-amber-200")}>{c.didNotVote ? "DNV" : `${c.given}/${c.need}`}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeVoter ? (
            <div className="admin-jury-ballot min-w-0 space-y-3">
              {activeDidNotVote ? (
                <div className="rounded-xl border border-amber-200/20 bg-amber-200/[0.06] p-4">
                  <p className="text-sm font-semibold text-foreground">This jury is marked “did not vote”</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">It is treated as intentionally absent, so it no longer creates an incomplete-ballot warning. No jury points are fabricated.</p>
                  {onDidNotVoteChange ? (
                    <button type="button" onClick={() => onDidNotVoteChange(activeVoter, false)} className="mt-3 min-h-10 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-foreground hover:bg-white/[0.07]">
                      Restore jury ballot
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">Point allocations</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Scores save immediately. The live standings stay beside the ballot on desktop and in the compact bar above on mobile.</p>
                    </div>
                    {onDidNotVoteChange ? (
                      <button
                        type="button"
                        disabled={ballot.length > 0}
                        onClick={() => onDidNotVoteChange(activeVoter, true)}
                        className="min-h-10 shrink-0 rounded-xl border border-amber-200/20 bg-amber-200/[0.06] px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-200/[0.1] disabled:cursor-not-allowed disabled:opacity-45"
                        title={ballot.length ? "Clear saved jury points before marking this jury as did not vote." : undefined}
                      >
                        Mark did not vote
                      </button>
                    ) : null}
                  </div>

                  <ul className="admin-jury-point-grid grid gap-2 md:grid-cols-2">
                    {voting.juryPoints.map((pts) => {
                      const receiver = byPoints.get(pts) ?? null;
                      const exclude = new Set([...usedReceivers].filter((id) => id !== receiver));
                      if (!voting.allowSelfVote && activeVoterCountry) exclude.add(activeVoterCountry);
                      return (
                        <li key={pts} className="flex min-w-0 items-center gap-2">
                          <span className="numeric w-12 shrink-0 rounded-lg bg-surface-strong px-2 py-1.5 text-center text-sm font-semibold">{pts}</span>
                          <CountryPicker
                            className="min-w-0 flex-1"
                            countries={pool}
                            value={receiver}
                            exclude={exclude}
                            onChange={(id) => (id ? onAssign(activeVoter, id, pts) : onClear(activeVoter, pts))}
                            placeholder={`Who gets ${pts}?`}
                          />
                          {receiver && (
                            <button
                              type="button"
                              onClick={() => onClear(activeVoter, pts)}
                              className="min-h-10 rounded-lg border border-border px-2 text-xs text-muted-foreground"
                              aria-label={`Clear ${pts} points`}
                            >
                              ✕
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Add participants to this show first.</p>
          )}
        </div>

        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-24 overflow-hidden rounded-2xl border border-sky-200/15 bg-white/[0.025] shadow-lg">
            <div className="border-b border-white/[0.07] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="relative flex size-2 shrink-0">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-300/45" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-300" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sky-100/80">Live results</p>
                    <p className="truncate text-sm font-semibold text-foreground">Jury standings</p>
                  </div>
                </div>
                <span className="numeric rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] text-muted-foreground">{resolvedCount}/{voters.length}</span>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Current jury points only. Every saved award immediately changes this table.</p>
            </div>
            <div className="p-2">
              <JuryStandingsRows standings={standings} maxHeightClass="max-h-[calc(100dvh-15rem)]" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MobileLeaderSummary({ standings, totalAwardedPoints }: { standings: JuryStanding[]; totalAwardedPoints: number }) {
  if (!standings.length) return <p className="truncate text-xs font-semibold text-foreground">No entries in show</p>;
  if (!totalAwardedPoints) return <p className="truncate text-xs font-semibold text-foreground">No jury points entered yet</p>;

  const leadingPoints = standings[0]?.points ?? 0;
  const leaders = standings.filter((row) => row.points === leadingPoints);
  return (
    <p className="truncate text-xs font-semibold text-foreground">
      {leaders.length > 1 ? `${leaders.length} countries tied · ${leadingPoints} pts` : `${leaders[0]?.country.name ?? "Leader"} · ${leadingPoints} pts`}
    </p>
  );
}

function JuryStandingsRows({ standings, maxHeightClass }: { standings: JuryStanding[]; maxHeightClass: string }) {
  const leaderPoints = standings[0]?.points ?? 0;

  if (!standings.length) {
    return <p className="px-2 py-6 text-center text-xs text-muted-foreground">Add entries to see live standings.</p>;
  }

  return (
    <ol className={cn("scroll-slim space-y-1 overflow-y-auto pr-0.5", maxHeightClass)}>
      {standings.map((row) => {
        const leading = leaderPoints > 0 && row.rank === 1;
        const width = leaderPoints > 0 ? Math.max(3, (row.points / leaderPoints) * 100) : 0;
        return (
          <li
            key={row.country.id}
            className={cn(
              "relative overflow-hidden rounded-xl border px-2 py-1.5 transition-all duration-300",
              leading ? "border-sky-200/20 bg-sky-200/[0.07]" : "border-white/[0.055] bg-white/[0.018]",
            )}
          >
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-white/[0.035]">
              <div className="h-full bg-sky-200/30 transition-[width] duration-300" style={{ width: `${width}%` }} />
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("numeric w-6 shrink-0 text-center text-xs font-semibold", leading ? "text-sky-100" : "text-muted-foreground")}>{row.rank}</span>
              <FlagChip code={row.country.short_code} color={row.country.accent_color} image={row.country.flag_image} size="sm" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{row.country.name}</span>
              <span className={cn("numeric shrink-0 text-xs font-bold tabular-nums", leading ? "text-sky-100" : "text-foreground")}>{row.points}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function TelevoteEntry({
  countries,
  order,
  votes,
  onSet,
}: {
  countries: Country[];
  order: string[];
  votes: Televote[];
  onSet: (countryId: string, points: number) => void;
}) {
  const cMap = new Map(countries.map((c) => [c.id, c]));
  const value = new Map(votes.map((v) => [v.country_id, v.points]));

  return (
    <ul className="space-y-1.5">
      {order.map((id) => {
        const c = cMap.get(id);
        if (!c) return null;
        return (
          <li key={id} className="flex items-center gap-2 rounded-lg bg-surface px-2 py-1.5">
            <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
            <input
              type="number"
              min={0}
              defaultValue={value.get(id) ?? 0}
              onBlur={(e) => onSet(id, Number(e.target.value) || 0)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="numeric w-24 rounded-lg border border-border bg-background px-2 py-1 text-right text-sm outline-none focus:border-primary/60"
            />
          </li>
        );
      })}
    </ul>
  );
}
