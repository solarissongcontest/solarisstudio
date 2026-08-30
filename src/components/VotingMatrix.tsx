import { useState } from "react";
import {
  matchVoterKey,
  voterOptionsFromVoters,
  type Country,
  type JuryVote,
  type Voter,
  type VoterOption,
} from "@/lib/data";

import { cn } from "@/lib/utils";

/**
 * Interactive voting matrix — rows receive, columns give.
 * Hovering a cell highlights the row/column and shows full country names.
 * Columns are keyed by voting entity ("v:<voterId>" or "c:<countryId>") so
 * custom juries display correctly alongside legacy country-only ballots.
 */
export function VotingMatrix({
  votes,
  countries,
  order,
  topPoint = 12,
  voters,
}: {
  votes: JuryVote[];
  countries: Map<string, Country>;
  order: string[];
  topPoint?: number;
  /** Optional voter roster; when provided, columns resolve to these entities instead of plain countries. */
  voters?: Voter[];
}) {
  const [hover, setHover] = useState<{ from: string; to: string } | null>(null);

  /*
   * Use the same canonical voter resolver as the organizer/editor surfaces.
   * Historical custom nations are keyed by contest_entity_id rather than a
   * global country_id. Building this map from country_id alone made those
   * ballots land under `c:<entityId>` while their visible scorechart column was
   * `v:<voterId>`, so the cells looked empty even though row totals counted the
   * points. SSC7 Zenryah is one real archive example of that mismatch.
   */
  const voterList: VoterOption[] = voterOptionsFromVoters(
    voters ?? [],
    [...countries.values()],
  );
  const voterMap = new Map(voterList.map((voter) => [voter.key, voter]));

  const displayFor = (colKey: string): VoterOption | undefined => {
    if (voterMap.has(colKey)) return voterMap.get(colKey);
    const id = colKey.startsWith("c:") ? colKey.slice(2) : colKey;
    const c = countries.get(id);
    return c
      ? {
          key: `c:${c.id}`,
          voterId: null,
          countryId: c.id,
          name: c.name,
          short_code: c.short_code,
          flag_image: c.flag_image,
          accent_color: c.accent_color,
        }
      : undefined;
  };

  const colKeyOf = (vote: JuryVote) => matchVoterKey(vote, voterList);

  const cell = new Map<string, number>();
  votes.forEach((vote) => {
    const key = `${colKeyOf(vote)}>${vote.receiving_country_id}`;
    cell.set(key, (cell.get(key) ?? 0) + vote.points);
  });

  const totals = new Map<string, number>();
  votes.forEach((vote) =>
    totals.set(
      vote.receiving_country_id,
      (totals.get(vote.receiving_country_id) ?? 0) + vote.points,
    ),
  );

  const columns = voterList.length
    ? voterList.map((voter) => voter.key)
    : order.map((id) => `c:${id}`);
  const rows = [...order].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));

  if (!order.length) return <p className="text-sm text-muted-foreground">No votes yet.</p>;

  return (
    <div className="scroll-slim overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 bg-background/90 px-2 py-2 text-left font-medium backdrop-blur">
              Receiving ↓ / Voting →
            </th>
            {columns.map((colKey) => {
              const c = displayFor(colKey);
              return (
                <th
                  key={colKey}
                  className={cn(
                    "px-1 py-2 text-center align-bottom font-medium transition-colors",
                    hover?.from === colKey && "bg-surface-strong",
                  )}
                  title={c?.name}
                >
                  <span className="flex flex-col items-center gap-1">
                    {c?.flag_image ? (
                      <img
                        src={c.flag_image}
                        alt={c.name}
                        loading="lazy"
                        decoding="async"
                        className="h-4 w-6 rounded-[2px] object-cover"
                      />
                    ) : null}
                    <span className="numeric max-w-[4.5rem] truncate text-[10px] text-muted-foreground">
                      {c?.short_code ?? c?.name}
                    </span>
                  </span>
                </th>
              );
            })}
            <th className="px-2 py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((to) => {
            const rc = countries.get(to);
            return (
              <tr key={to} className={cn(hover?.to === to && "bg-surface/60")}>
                <th className="sticky left-0 z-10 max-w-44 truncate bg-background/90 px-2 py-1 text-left font-normal backdrop-blur">
                  <span className="flex items-center gap-2">
                    {rc?.flag_image ? (
                      <img
                        src={rc.flag_image}
                        alt={rc.name}
                        loading="lazy"
                        decoding="async"
                        className="h-4 w-6 rounded-[2px] object-cover"
                      />
                    ) : null}
                    <span className="truncate">{rc?.name}</span>
                  </span>
                </th>
                {columns.map((from) => {
                  const val = cell.get(`${from}>${to}`);
                  const isTop = val === topPoint;
                  const fromDisplay = displayFor(from);
                  const isSelf = fromDisplay?.countryId === to;
                  return (
                    <td
                      key={from}
                      onMouseEnter={() => setHover({ from, to })}
                      onMouseLeave={() => setHover(null)}
                      title={
                        val
                          ? `${fromDisplay?.name} → ${rc?.name}: ${val}`
                          : `${fromDisplay?.name} → ${rc?.name}`
                      }
                      className={cn(
                        "numeric border border-border/40 px-1 py-1 text-center transition-colors",
                        isSelf && "bg-muted/40",
                        hover?.from === from && "bg-surface-strong",
                        isTop && "font-bold text-[var(--gold)]",
                      )}
                      style={
                        val && !isTop
                          ? {
                              background: `color-mix(in oklab, var(--jury) ${Math.min(val * 6, 55)}%, transparent)`,
                            }
                          : undefined
                      }
                    >
                      {val ?? ""}
                    </td>
                  );
                })}
                <td className="numeric px-2 py-1 text-right font-semibold">
                  {totals.get(to) ?? 0}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
