import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { buildHeatmapMatrix } from "@/lib/stats";
import type { Country, JuryVote } from "@/lib/data";
import { cn } from "@/lib/utils";

export function VotingHeatmap({
  countries,
  jury,
  limit = 18,
}: {
  countries: Country[];
  jury: JuryVote[];
  limit?: number;
}) {
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);

  const topIds = useMemo(() => {
    const totals = new Map<string, number>();
    jury.forEach((v) => {
      totals.set(v.voter_country_id, (totals.get(v.voter_country_id) ?? 0) + v.points);
      totals.set(v.receiving_country_id, (totals.get(v.receiving_country_id) ?? 0) + v.points);
    });
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  }, [jury, limit]);

  const topCountries = useMemo(
    () => topIds.map((id) => countries.find((c) => c.id === id)).filter((c): c is Country => !!c),
    [topIds, countries],
  );

  const { ids, matrix } = useMemo(() => buildHeatmapMatrix(topCountries, jury), [topCountries, jury]);
  const max = useMemo(() => Math.max(1, ...matrix.flat()), [matrix]);

  if (!ids.length) return <p className="text-sm text-muted-foreground">Not enough voting data yet.</p>;

  const cell = 26;
  const labelW = 96;
  const cMap = new Map(countries.map((c) => [c.id, c]));

  return (
    <div className="min-w-0">
      <div className="mb-4 rounded-xl border border-border/70 bg-surface/70 p-3">
        <p className="text-xs font-semibold text-foreground">How to read this</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          Read from the country on the left toward the country at the top. A stronger square means more jury points flowed in that direction across the selected archive. This shows accumulated support, not a claim that countries deliberately vote for friends.
        </p>
        <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>Less support</span>
          <div className="flex h-3 flex-1 overflow-hidden rounded-full border border-border/60">
            {[0.08, 0.2, 0.4, 0.65, 0.9].map((opacity) => (
              <span key={opacity} className="h-full flex-1 bg-[var(--jury)]" style={{ opacity }} />
            ))}
          </div>
          <span>More support</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg
          width={labelW + ids.length * cell + 8}
          height={labelW + ids.length * cell + 8}
          role="img"
          aria-label="Jury support heat map. Rows give points to columns. Stronger cells mean more accumulated points."
        >
          {/* column labels */}
          {ids.map((id, j) => {
            const c = cMap.get(id);
            return (
              <text
                key={`col-${id}`}
                x={labelW + j * cell + cell / 2}
                y={labelW - 8}
                transform={`rotate(-60 ${labelW + j * cell + cell / 2} ${labelW - 8})`}
                fontSize={9}
                fill="currentColor"
                className="text-muted-foreground"
                textAnchor="start"
              >
                {c?.short_code ?? "?"}
              </text>
            );
          })}
          {/* rows */}
          {ids.map((rowId, i) => {
            const c = cMap.get(rowId);
            return (
              <g key={`row-${rowId}`}>
                <Link to="/countries/$code" params={{ code: c?.short_code ?? "" }}>
                  <text
                    x={labelW - 8}
                    y={labelW + i * cell + cell / 2 + 3}
                    fontSize={9}
                    textAnchor="end"
                    className="fill-foreground hover:fill-primary"
                  >
                    {c?.name ?? "?"}
                  </text>
                </Link>
                {ids.map((colId, j) => {
                  const value = matrix[i][j];
                  const isHover = hover && (hover.i === i || hover.j === j);
                  const opacity = i === j ? 0 : Math.max(0.06, value / max);
                  return (
                    <rect
                      key={`${rowId}-${colId}`}
                      x={labelW + j * cell}
                      y={labelW + i * cell}
                      width={cell - 2}
                      height={cell - 2}
                      rx={4}
                      fill="var(--jury)"
                      opacity={i === j ? 0.03 : opacity}
                      stroke={hover && hover.i === i && hover.j === j ? "var(--gold)" : "transparent"}
                      strokeWidth={2}
                      className={cn(isHover && "cursor-pointer")}
                      onMouseEnter={() => setHover({ i, j })}
                      onMouseLeave={() => setHover(null)}
                    >
                      <title>
                        {cMap.get(rowId)?.name} → {cMap.get(colId)?.name}: {value} pts
                      </title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
        </svg>
        {hover && (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{cMap.get(ids[hover.i])?.name}</span> →{" "}
            <span className="font-medium text-foreground">{cMap.get(ids[hover.j])?.name}</span>:{" "}
            <span className="numeric">{matrix[hover.i][hover.j]}</span> pts
          </p>
        )}
      </div>
    </div>
  );
}
