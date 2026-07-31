import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { buildPointFlow } from "@/lib/stats";
import type { Country, JuryVote } from "@/lib/data";

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
  const cMap = new Map(countries.map((c) => [c.id, c]));

  const links = useMemo(() => buildPointFlow(jury, 1), [jury]);

  const nodeIds = useMemo(() => {
    const totals = new Map<string, number>();
    links.forEach((l) => {
      totals.set(l.source, (totals.get(l.source) ?? 0) + l.value);
      totals.set(l.target, (totals.get(l.target) ?? 0) + l.value);
    });
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
  }, [links, limit]);

  const ribbons: Ribbon[] = useMemo(() => {
    const set = new Set(nodeIds);
    const pairs = new Map<string, number>();
    links.forEach((l) => {
      if (!set.has(l.source) || !set.has(l.target) || l.source === l.target) return;
      const key = [l.source, l.target].sort().join("|");
      pairs.set(key, (pairs.get(key) ?? 0) + l.value);
    });
    return [...pairs.entries()].map(([key, value]) => {
      const [a, b] = key.split("|");
      return { a, b, value };
    });
  }, [links, nodeIds]);

  if (!nodeIds.length) return <p className="text-sm text-muted-foreground">Not enough voting data yet.</p>;

  const size = 460;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 60;
  const angleFor = (i: number) => (i / nodeIds.length) * Math.PI * 2 - Math.PI / 2;
  const pos = new Map(nodeIds.map((id, i) => [id, { x: cx + r * Math.cos(angleFor(i)), y: cy + r * Math.sin(angleFor(i)) }]));

  const maxVal = Math.max(1, ...ribbons.map((r) => r.value));

  return (
    <div className="overflow-x-auto">
      <svg width={size} height={size} className="mx-auto block">
        {ribbons.map((rb, i) => {
          const p1 = pos.get(rb.a)!;
          const p2 = pos.get(rb.b)!;
          const dim = active && active !== rb.a && active !== rb.b;
          const c = cMap.get(rb.a);
          return (
            <path
              key={i}
              d={`M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`}
              fill="none"
              stroke={c?.accent_color ?? "var(--jury)"}
              strokeWidth={Math.max(1, (rb.value / maxVal) * 10)}
              opacity={dim ? 0.06 : 0.45}
              className="transition-opacity"
            >
              <title>
                {cMap.get(rb.a)?.name} ↔ {cMap.get(rb.b)?.name}: {rb.value} pts
              </title>
            </path>
          );
        })}
        {nodeIds.map((id) => {
          const c = cMap.get(id);
          const p = pos.get(id)!;
          const labelX = cx + (r + 22) * Math.cos(Math.atan2(p.y - cy, p.x - cx));
          const labelY = cy + (r + 22) * Math.sin(Math.atan2(p.y - cy, p.x - cx));
          return (
            <g
              key={id}
              onMouseEnter={() => setActive(id)}
              onMouseLeave={() => setActive(null)}
              className="cursor-pointer"
            >
              <circle cx={p.x} cy={p.y} r={8} fill={c?.accent_color ?? "var(--jury)"} stroke="var(--background)" strokeWidth={2} />
              <Link to="/countries/$code" params={{ code: c?.short_code ?? "" }}>
                <text x={labelX} y={labelY} fontSize={10} textAnchor="middle" className="fill-foreground">
                  {c?.short_code ?? "?"}
                </text>
              </Link>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
