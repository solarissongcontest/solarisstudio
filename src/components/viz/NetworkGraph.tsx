import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { buildPointFlow } from "@/lib/stats";
import type { Country, JuryVote } from "@/lib/data";

/** Deterministic circular voting network: nodes = countries, edges weighted by points. */
export function NetworkGraph({
  countries,
  jury,
  limit = 16,
  minEdgeShare = 0.12,
}: {
  countries: Country[];
  jury: JuryVote[];
  limit?: number;
  minEdgeShare?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const cMap = new Map(countries.map((c) => [c.id, c]));

  const links = useMemo(() => buildPointFlow(jury, 1), [jury]);

  const nodeIds = useMemo(() => {
    const totals = new Map<string, number>();
    links.forEach((l) => {
      totals.set(l.source, (totals.get(l.source) ?? 0) + l.value);
      totals.set(l.target, (totals.get(l.target) ?? 0) + l.value);
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  }, [links, limit]);

  const maxVal = Math.max(1, ...links.map((l) => l.value));
  const strongLinks = useMemo(
    () =>
      links.filter(
        (l) => nodeIds.includes(l.source) && nodeIds.includes(l.target) && l.value / maxVal >= minEdgeShare,
      ),
    [links, nodeIds, maxVal, minEdgeShare],
  );

  if (!nodeIds.length) return <p className="text-sm text-muted-foreground">Not enough voting data yet.</p>;

  const size = 460;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 56;
  const pos = new Map(
    nodeIds.map((id, i) => {
      const a = (i / nodeIds.length) * Math.PI * 2 - Math.PI / 2;
      return [id, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }];
    }),
  );

  return (
    <div className="overflow-x-auto">
      <svg width={size} height={size} className="mx-auto block">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
          </marker>
        </defs>
        {strongLinks.map((l, i) => {
          const p1 = pos.get(l.source)!;
          const p2 = pos.get(l.target)!;
          const dim = hover && hover !== l.source && hover !== l.target;
          return (
            <line
              key={i}
              x1={p1.x}
              y1={p1.y}
              x2={p2.x}
              y2={p2.y}
              stroke={cMap.get(l.source)?.accent_color ?? "var(--jury)"}
              strokeWidth={Math.max(0.5, (l.value / maxVal) * 5)}
              opacity={dim ? 0.05 : 0.4}
              markerEnd="url(#arrow)"
              className="transition-opacity"
            >
              <title>
                {cMap.get(l.source)?.name} → {cMap.get(l.target)?.name}: {l.value} pts
              </title>
            </line>
          );
        })}
        {nodeIds.map((id) => {
          const c = cMap.get(id);
          const p = pos.get(id)!;
          const connected =
            !hover || hover === id || strongLinks.some((l) => (l.source === hover && l.target === id) || (l.target === hover && l.source === id));
          return (
            <g
              key={id}
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover(null)}
              className="cursor-pointer"
              opacity={connected ? 1 : 0.25}
            >
              <circle cx={p.x} cy={p.y} r={9} fill={c?.accent_color ?? "var(--jury)"} stroke="var(--background)" strokeWidth={2} />
              <Link to="/countries/$code" params={{ code: c?.short_code ?? "" }}>
                <text x={p.x} y={p.y - 13} fontSize={10} textAnchor="middle" className="fill-foreground">
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
