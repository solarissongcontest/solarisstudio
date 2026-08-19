import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import type { Country, JuryVote } from "@/lib/data";
import { buildPointFlow } from "@/lib/stats";

type Ribbon = { a: string; b: string; value: number };

export function ChordDiagram({
  countries,
  jury,
  limit = 10,
}: {
  countries: Country[];
  jury: JuryVote[];
  limit?: number;
}) {
  const [active, setActive] = useState<string | null>(null);
  const cMap = new Map(countries.map((country) => [country.id, country]));
  const links = useMemo(() => buildPointFlow(jury, 1), [jury]);

  const nodeIds = useMemo(() => {
    const totals = new Map<string, number>();
    links.forEach((link) => {
      totals.set(link.source, (totals.get(link.source) ?? 0) + link.value);
      totals.set(link.target, (totals.get(link.target) ?? 0) + link.value);
    });
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  }, [links, limit]);

  const ribbons: Ribbon[] = useMemo(() => {
    const set = new Set(nodeIds);
    const pairs = new Map<string, number>();
    links.forEach((link) => {
      if (!set.has(link.source) || !set.has(link.target) || link.source === link.target) return;
      const key = [link.source, link.target].sort().join("|");
      pairs.set(key, (pairs.get(key) ?? 0) + link.value);
    });
    return [...pairs.entries()].map(([key, value]) => {
      const [a, b] = key.split("|");
      return { a, b, value };
    });
  }, [links, nodeIds]);

  if (!nodeIds.length) {
    return <p className="text-sm text-muted-foreground">Not enough voting data yet.</p>;
  }

  const size = 460;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 60;
  const angleFor = (index: number) => (index / nodeIds.length) * Math.PI * 2 - Math.PI / 2;
  const pos = new Map(
    nodeIds.map((id, index) => [
      id,
      {
        x: cx + radius * Math.cos(angleFor(index)),
        y: cy + radius * Math.sin(angleFor(index)),
      },
    ]),
  );
  const maxVal = Math.max(1, ...ribbons.map((ribbon) => ribbon.value));

  return (
    <div className="rounded-xl border border-border/60 bg-background/20 p-2 sm:p-4">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block aspect-square w-full max-w-[720px]"
        role="img"
        aria-label="Relationship chord diagram showing the strongest two-way voting connections"
      >
        {ribbons.map((ribbon, index) => {
          const p1 = pos.get(ribbon.a)!;
          const p2 = pos.get(ribbon.b)!;
          const dim = active && active !== ribbon.a && active !== ribbon.b;
          const country = cMap.get(ribbon.a);
          return (
            <path
              key={`${ribbon.a}-${ribbon.b}-${index}`}
              d={`M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`}
              fill="none"
              stroke={country?.accent_color ?? "var(--jury)"}
              strokeWidth={Math.max(1, (ribbon.value / maxVal) * 10)}
              opacity={dim ? 0.06 : active ? 0.68 : 0.45}
              className="transition-opacity"
            >
              <title>{cMap.get(ribbon.a)?.name} ↔ {cMap.get(ribbon.b)?.name}: {ribbon.value} pts</title>
            </path>
          );
        })}

        {nodeIds.map((id) => {
          const country = cMap.get(id);
          const point = pos.get(id)!;
          const angle = Math.atan2(point.y - cy, point.x - cx);
          const labelX = cx + (radius + 22) * Math.cos(angle);
          const labelY = cy + (radius + 22) * Math.sin(angle);
          return (
            <g key={id} onMouseEnter={() => setActive(id)} onMouseLeave={() => setActive(null)} className="cursor-pointer">
              <circle
                cx={point.x}
                cy={point.y}
                r={active === id ? 10 : 8}
                fill={country?.accent_color ?? "var(--jury)"}
                stroke="var(--background)"
                strokeWidth={2}
              />
              <Link to="/countries/$code" params={{ code: country?.short_code ?? "" }}>
                <text x={labelX} y={labelY} fontSize={active === id ? 12 : 10} fontWeight={active === id ? 700 : 500} textAnchor="middle" className="fill-foreground">
                  {country?.short_code ?? "?"}
                </text>
              </Link>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
