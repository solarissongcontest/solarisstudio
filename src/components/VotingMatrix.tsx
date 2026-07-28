import { useState } from "react";
import type { Country, JuryVote } from "@/lib/data";
import { cn } from "@/lib/utils";

/**
 * Interactive voting matrix — rows receive, columns give.
 * Hovering a cell highlights the row/column and shows full country names.
 */
export function VotingMatrix({
  votes,
  countries,
  order,
  topPoint = 12,
}: {
  votes: JuryVote[];
  countries: Map<string, Country>;
  order: string[];
  topPoint?: number;
}) {
  const [hover, setHover] = useState<{ from: string; to: string } | null>(null);
  const cell = new Map<string, number>();
  votes.forEach((v) =>
    cell.set(
      `${v.voter_country_id}>${v.receiving_country_id}`,
      (cell.get(`${v.voter_country_id}>${v.receiving_country_id}`) ?? 0) + v.points,
    ),
  );
  const totals = new Map<string, number>();
  votes.forEach((v) =>
    totals.set(v.receiving_country_id, (totals.get(v.receiving_country_id) ?? 0) + v.points),
  );
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
            {order.map((id) => {
              const c = countries.get(id);
              return (
                <th
                  key={id}
                  className={cn(
                    "px-1 py-2 text-center align-bottom font-medium transition-colors",
                    hover?.from === id && "bg-surface-strong",
                  )}
                  title={c?.name}
                >
                  <span className="flex flex-col items-center gap-1">
                    {c?.flag_image ? (
                      <img src={c.flag_image} alt={c.name} className="h-4 w-6 rounded-[2px] object-cover" />
                    ) : null}
                    <span className="numeric text-[10px] text-muted-foreground">{c?.short_code}</span>
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
                      <img src={rc.flag_image} alt={rc.name} className="h-4 w-6 rounded-[2px] object-cover" />
                    ) : null}
                    <span className="truncate">{rc?.name}</span>
                  </span>
                </th>
                {order.map((from) => {
                  const val = cell.get(`${from}>${to}`);
                  const isTop = val === topPoint;
                  return (
                    <td
                      key={from}
                      onMouseEnter={() => setHover({ from, to })}
                      onMouseLeave={() => setHover(null)}
                      title={
                        val
                          ? `${countries.get(from)?.name} → ${rc?.name}: ${val}`
                          : `${countries.get(from)?.name} → ${rc?.name}`
                      }
                      className={cn(
                        "numeric border border-border/40 px-1 py-1 text-center transition-colors",
                        from === to && "bg-muted/40",
                        hover?.from === from && "bg-surface-strong",
                        isTop && "font-bold text-[var(--gold)]",
                      )}
                      style={
                        val && !isTop
                          ? { background: `color-mix(in oklab, var(--jury) ${Math.min(val * 6, 55)}%, transparent)` }
                          : undefined
                      }
                    >
                      {val ?? ""}
                    </td>
                  );
                })}
                <td className="numeric px-2 py-1 text-right font-semibold">{totals.get(to) ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
