import { useMemo } from "react";
import { CountryPicker } from "@/components/CountryPicker";
import { FlagChip } from "@/components/FlagChip";
import type { Country, JuryVote, Televote } from "@/lib/data";
import type { VotingConfig } from "@/lib/voting";
import { cn } from "@/lib/utils";

/**
 * High-speed jury ballot entry: one row per point value, type-ahead country
 * search, duplicate/self-vote protection and live ballot completeness.
 */
export function FastJuryEntry({
  countries,
  order,
  voting,
  votes,
  activeVoter,
  onVoterChange,
  onAssign,
  onClear,
}: {
  countries: Country[];
  order: string[];
  voting: VotingConfig;
  votes: JuryVote[];
  activeVoter: string;
  onVoterChange: (id: string) => void;
  onAssign: (voter: string, receiver: string, points: number) => void;
  onClear: (voter: string, points: number) => void;
}) {
  const cMap = useMemo(() => new Map(countries.map((c) => [c.id, c])), [countries]);
  const pool = order.map((id) => cMap.get(id)).filter(Boolean) as Country[];
  const ballot = votes.filter((v) => v.voter_country_id === activeVoter);
  const byPoints = new Map(ballot.map((v) => [v.points, v.receiving_country_id]));

  const completeness = useMemo(() => {
    const need = voting.juryPoints.length;
    return order.map((id) => ({
      id,
      given: votes.filter((v) => v.voter_country_id === id).length,
      need,
    }));
  }, [order, votes, voting.juryPoints.length]);

  const usedReceivers = new Set(ballot.map((v) => v.receiving_country_id));

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-[11px] uppercase tracking-widest text-muted-foreground">Voting country</p>
        <div className="scroll-slim flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {completeness.map((c) => {
            const country = cMap.get(c.id);
            if (!country) return null;
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
                <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="sm" />
                <span className="max-w-[9rem] truncate">{country.name}</span>
                <span className="numeric opacity-60">
                  {c.given}/{c.need}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {activeVoter ? (
        <ul className="space-y-1.5">
          {voting.juryPoints.map((pts) => {
            const receiver = byPoints.get(pts) ?? null;
            const exclude = new Set(
              [...usedReceivers].filter((id) => id !== receiver),
            );
            if (!voting.allowSelfVote) exclude.add(activeVoter);
            return (
              <li key={pts} className="flex items-center gap-2">
                <span className="numeric w-12 shrink-0 rounded-lg bg-surface-strong px-2 py-1.5 text-center text-sm font-semibold">
                  {pts}
                </span>
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

/** Televote entry — free totals per entry, sorted live. */
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
