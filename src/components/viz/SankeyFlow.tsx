import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { buildPointFlow } from "@/lib/stats";
import type { Country, JuryVote } from "@/lib/data";

export function SankeyFlow({
  countries,
  jury,
  limit = 12,
}: {
  countries: Country[];
  jury: JuryVote[];
  limit?: number;
}) {
  const [hoverSide, setHoverSide] = useState<{ side: "left" | "right"; id: string } | null>(null);
  const cMap = new Map(countries.map((c) => [c.id, c]));

  const links = useMemo(() => buildPointFlow(jury, 1), [jury]);

  const { givers, receivers } = useMemo(() => {
    const givenTotals = new Map<string, number>();
    const receivedTotals = new Map<string, number>();
    links.forEach((l) => {
      givenTotals.set(l.source, (givenTotals.get(l.source) ?? 0) + l.value);
      receivedTotals.set(l.target, (receivedTotals.get(l.target) ?? 0) + l.value);
    });
    const givers = [...givenTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
    const receivers = [...receivedTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
    return { givers, receivers };
  }, [links, limit]);

  const filteredLinks = useMemo(
    () => links.filter((l) => givers.includes(l.source) && receivers.includes(l.target)),
    [links, givers, receivers],
  );

  if (!givers.length || !receivers.length)
    return <p className="text-sm text-muted-foreground">Not enough voting data yet.</p>;

  const width = 640;
  const height = Math.max(givers.length, receivers.length) * 34 + 20;
  const colW = 130;
  const leftX = colW;
  const rightX = width - colW;
  const maxVal = Math.max(1, ...filteredLinks.map((l) => l.value));

  const leftY = new Map(givers.map((id, i) => [id, 20 + i * ((height - 40) / Math.max(1, givers.length - 1 || 1))]));
  const rightY = new Map(receivers.map((id, i) => [id, 20 + i * ((height - 40) / Math.max(1, receivers.length - 1 || 1))]));

  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} className="mx-auto block">
        {filteredLinks.map((l, i) => {
          const y1 = leftY.get(l.source) ?? 20;
          const y2 = rightY.get(l.target) ?? 20;
          const dim =
            hoverSide && !((hoverSide.side === "left" && hoverSide.id === l.source) || (hoverSide.side === "right" && hoverSide.id === l.target));
          const c = cMap.get(l.source);
          return (
            <path
              key={i}
              d={`M ${leftX} ${y1} C ${(leftX + rightX) / 2} ${y1}, ${(leftX + rightX) / 2} ${y2}, ${rightX} ${y2}`}
              fill="none"
              stroke={c?.accent_color ?? "var(--jury)"}
              strokeWidth={Math.max(1, (l.value / maxVal) * 8)}
              opacity={dim ? 0.05 : 0.5}
              className="transition-opacity"
            >
              <title>
                {cMap.get(l.source)?.name} → {cMap.get(l.target)?.name}: {l.value} pts
              </title>
            </path>
          );
        })}
        {givers.map((id) => {
          const c = cMap.get(id);
          const y = leftY.get(id) ?? 0;
          return (
            <g key={id} onMouseEnter={() => setHoverSide({ side: "left", id })} onMouseLeave={() => setHoverSide(null)}>
              <circle cx={leftX} cy={y} r={5} fill={c?.accent_color ?? "var(--jury)"} />
              <Link to="/countries/$code" params={{ code: c?.short_code ?? "" }}>
                <text x={leftX - 10} y={y + 3} fontSize={10} textAnchor="end" className="fill-foreground hover:fill-primary">
                  {c?.name ?? "?"}
                </text>
              </Link>
            </g>
          );
        })}
        {receivers.map((id) => {
          const c = cMap.get(id);
          const y = rightY.get(id) ?? 0;
          return (
            <g key={id} onMouseEnter={() => setHoverSide({ side: "right", id })} onMouseLeave={() => setHoverSide(null)}>
              <circle cx={rightX} cy={y} r={5} fill={c?.accent_color ?? "var(--televote)"} />
              <Link to="/countries/$code" params={{ code: c?.short_code ?? "" }}>
                <text x={rightX + 10} y={y + 3} fontSize={10} textAnchor="start" className="fill-foreground hover:fill-primary">
                  {c?.name ?? "?"}
                </text>
              </Link>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
