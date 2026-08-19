import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import type { Country, JuryVote } from "@/lib/data";
import { buildPointFlow } from "@/lib/stats";

/** Deterministic circular voting network: nodes = countries, edges weighted by points. */
export function NetworkGraph({
  countries,
  jury,
  limit = 12,
  minEdgeShare = 0.16,
}: {
  countries: Country[];
  jury: JuryVote[];
  limit?: number;
  minEdgeShare?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
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

  const maxVal = Math.max(1, ...links.map((link) => link.value));
  const strongLinks = useMemo(
    () =>
      links.filter(
        (link) =>
          nodeIds.includes(link.source) &&
          nodeIds.includes(link.target) &&
          link.value / maxVal >= minEdgeShare,
      ),
    [links, nodeIds, maxVal, minEdgeShare],
  );
  const strongest = useMemo(
    () => [...strongLinks].sort((a, b) => b.value - a.value).slice(0, 5),
    [strongLinks],
  );

  if (!nodeIds.length) {
    return <p className="text-sm text-muted-foreground">Not enough voting data yet.</p>;
  }

  const size = 460;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 56;
  const pos = new Map(
    nodeIds.map((id, index) => {
      const angle = (index / nodeIds.length) * Math.PI * 2 - Math.PI / 2;
      return [id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }];
    }),
  );
  const hoveredCountry = hover ? cMap.get(hover) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/70 bg-surface/65 p-3 sm:p-4">
        <p className="text-xs font-semibold text-foreground">How to read this</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Each dot is a country. An arrow points from the country giving points to the country
          receiving them. Thicker lines mean more points. Hover a country to isolate only its
          strongest connections.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-muted-foreground">
          <span><strong className="text-foreground">Arrow</strong> = points given</span>
          <span><strong className="text-foreground">Thickness</strong> = amount of support</span>
          <span><strong className="text-foreground">Colour</strong> = giving country</span>
        </div>
      </div>

      {hoveredCountry && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2.5 text-xs">
          <span className="font-semibold text-foreground">{hoveredCountry.name}</span>
          <span className="ml-2 text-muted-foreground">Showing only connections involving this country.</span>
        </div>
      )}

      <div className="rounded-xl border border-border/60 bg-background/25 p-2 sm:p-4">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          preserveAspectRatio="xMidYMid meet"
          className="mx-auto block aspect-square w-full max-w-[720px]"
          role="img"
          aria-label="Voting network showing the strongest point flows between countries"
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
            </marker>
          </defs>

          {strongLinks.map((link, index) => {
            const p1 = pos.get(link.source)!;
            const p2 = pos.get(link.target)!;
            const dim = hover && hover !== link.source && hover !== link.target;
            return (
              <line
                key={`${link.source}-${link.target}-${index}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={cMap.get(link.source)?.accent_color ?? "var(--jury)"}
                strokeWidth={Math.max(1, (link.value / maxVal) * 5.5)}
                opacity={dim ? 0.035 : hover ? 0.8 : 0.46}
                markerEnd="url(#arrow)"
                className="transition-opacity"
              >
                <title>{cMap.get(link.source)?.name} → {cMap.get(link.target)?.name}: {link.value} pts</title>
              </line>
            );
          })}

          {nodeIds.map((id) => {
            const country = cMap.get(id);
            const point = pos.get(id)!;
            const connected =
              !hover ||
              hover === id ||
              strongLinks.some(
                (link) =>
                  (link.source === hover && link.target === id) ||
                  (link.target === hover && link.source === id),
              );
            return (
              <g key={id} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} className="cursor-pointer" opacity={connected ? 1 : 0.18}>
                <title>{country?.name ?? "Unknown country"}</title>
                <circle cx={point.x} cy={point.y} r={hover === id ? 12 : 10} fill={country?.accent_color ?? "var(--jury)"} stroke="var(--background)" strokeWidth={3} />
                <Link to="/countries/$code" params={{ code: country?.short_code ?? "" }}>
                  <text x={point.x} y={point.y - 15} fontSize={hover === id ? 12 : 10} fontWeight={hover === id ? 700 : 500} textAnchor="middle" className="fill-foreground">
                    {country?.short_code ?? "?"}
                  </text>
                </Link>
              </g>
            );
          })}
        </svg>
      </div>

      <div>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-foreground">Strongest visible connections</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">A readable summary of the same lines shown above.</p>
          </div>
          <span className="text-[10px] text-muted-foreground">{strongLinks.length} shown</span>
        </div>

        {strongest.length ? (
          <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-surface/45 px-3">
            {strongest.map((link, index) => {
              const source = cMap.get(link.source);
              const target = cMap.get(link.target);
              return (
                <div key={`${link.source}-${link.target}-summary`} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                  <span className="numeric text-[10px] text-muted-foreground">#{index + 1}</span>
                  <p className="truncate text-xs font-medium">{source?.name ?? "?"} → {target?.name ?? "?"}</p>
                  <span className="numeric text-xs font-semibold">{link.value} pts</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No strong connections for the current filters.</p>
        )}
      </div>
    </div>
  );
}
