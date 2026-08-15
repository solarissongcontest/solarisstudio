import { useMemo } from "react";
import { CountryPicker } from "@/components/CountryPicker";
import { FlagChip } from "@/components/FlagChip";
import { matchVoterKey, type Country, type JuryVote, type Televote, type VoterOption } from "@/lib/data";
import type { VotingConfig } from "@/lib/voting";
import { cn } from "@/lib/utils";

/**
 * High-speed jury ballot entry: one row per point value, type-ahead country
 * search, duplicate/self-vote protection and live ballot completeness.
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
}: {
  voters: VoterOption[];
  receivers: Country[];
  voting: VotingConfig;
  votes: JuryVote[];
  activeVoter: string;
  onVoterChange: (key: string) => void;
  onAssign: (voterKey: string, receiver: string, points: number) => void;
  onClear: (voterKey: string, points: number) => void;
}) {
  const vMap = useMemo(() => new Map(voters.map((v) => [v.key, v])), [voters]);
  const pool = receivers;
  const keyOf = useMemo(() => {
    const cache = new Map<string, string>();
    return (v: JuryVote) => {
      const cacheKey = `${v.voter_id ?? ""}|${v.voter_country_id ?? ""}`;
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

  const completeness = useMemo(() => {
    const need = voting.juryPoints.length;
    return voters.map((v) => ({
      id: v.key,
      given: votes.filter((vote) => keyOf(vote) === v.key).length,
      need,
    }));
  }, [voters, votes, voting.juryPoints.length, keyOf]);

  const usedReceivers = new Set(ballot.map((v) => v.receiving_country_id));

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">Voting entity</p>
        <div className="scroll-slim flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
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
                  "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition",
                  activeVoter === c.id
                    ? "border-primary bg-primary/15"
                    : done
                      ? "border-border bg-surface"
                      : "border-destructive/40 bg-surface text-muted-foreground",
                )}
              >
                <FlagChip code={voterOpt.short_code ?? "??"} color={voterOpt.accent_color} image={voterOpt.flag_image} size="sm" />
                <span className="max-w-[9rem] truncate">{voterOpt.name}</span>
                <span className="numeric opacity-60">{c.given}/{c.need}</span>
              </button>
            );
          })}
        </div>
      </div>

      {activeVoter ? (
        <ul className="space-y-1.5">
          {voting.juryPoints.map((pts) => {
            const receiver = byPoints.get(pts) ?? null;
            const exclude = new Set([...usedReceivers].filter((id) => id !== receiver));
            if (!voting.allowSelfVote && activeVoterCountry) exclude.add(activeVoterCountry);
            return (
              <li key={pts} className="flex items-center gap-2">
                <span className="numeric w-12 shrink-0 rounded-lg bg-surface-strong px-2 py-1.5 text-center text-sm font-semibold">{pts}</span>
                <CountryPicker
                  className="flex-1"
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
                    className="rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground"
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Add participants to this show first.</p>
      )}
    </div>
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
