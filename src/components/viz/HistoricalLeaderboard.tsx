import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Country, Edition, ResultRow } from "@/lib/data";
import { editionLabel } from "@/lib/data";
import { cn } from "@/lib/utils";

export function HistoricalLeaderboard({
  countries,
  editions,
  results,
  limit = 8,
}: {
  countries: Country[];
  editions: Edition[];
  results: ResultRow[];
  limit?: number;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const cMap = new Map(countries.map((c) => [c.id, c]));

  const sortedEditions = useMemo(
    () => [...editions].filter((e) => e.year != null).sort((a, b) => (a.year ?? 0) - (b.year ?? 0)),
    [editions],
  );

  const rankedResults = results.filter((r) => r.final_rank != null);

  const topIds = useMemo(() => {
    const counts = new Map<string, number>();
    rankedResults.forEach((r) => counts.set(r.country_id, (counts.get(r.country_id) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  }, [rankedResults, limit]);

  const data = useMemo(
    () =>
      sortedEditions.map((e) => {
        const row: Record<string, number | string | null> = { label: editionLabel(e), year: e.year };
        topIds.forEach((id) => {
          const r = rankedResults.find((rr) => rr.edition_id === e.id && rr.country_id === id);
          row[id] = r?.final_rank ?? null;
        });
        return row;
      }),
    [sortedEditions, topIds, rankedResults],
  );

  if (!topIds.length || !sortedEditions.length)
    return <p className="text-sm text-muted-foreground">Not enough historical data yet.</p>;

  const maxRank = Math.max(1, ...rankedResults.filter((r) => topIds.includes(r.country_id)).map((r) => r.final_rank ?? 1));

  return (
    <div>
      <div style={{ width: "100%", height: 380 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} />
            <YAxis reversed domain={[1, maxRank]} stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "var(--foreground)" }}
              formatter={(value: any, key: any) => [value ?? "—", cMap.get(String(key))?.name ?? key]}
            />
            {topIds.map((id) => {
              const c = cMap.get(id);
              const dim = hoverId && hoverId !== id;
              return (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  name={c?.name ?? id}
                  stroke={c?.accent_color ?? "var(--jury)"}
                  strokeWidth={hoverId === id ? 3 : 1.75}
                  strokeOpacity={dim ? 0.15 : 1}
                  dot={{ r: 2 }}
                  connectNulls
                  isAnimationActive
                  animationDuration={800}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {topIds.map((id) => {
          const c = cMap.get(id);
          if (!c) return null;
          return (
            <Link
              key={id}
              to="/countries/$code"
              params={{ code: c.short_code }}
              onMouseEnter={() => setHoverId(id)}
              onMouseLeave={() => setHoverId(null)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition-colors",
                hoverId === id ? "bg-surface-strong" : "bg-surface",
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: c.accent_color }} />
              {c.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
