import { useEffect, useMemo, useRef, useState } from "react";

import {
  scatterAxisBounds,
  scatterPlotCoordinate,
  scatterPointRadius,
} from "@/lib/scatter-plot-geometry";

export type JuryTelevoteScatterDatum = {
  id: string;
  name: string;
  code: string;
  color: string;
  jury: number;
  televote: number;
  n: number;
};

type Dimensions = { width: number; height: number };

export function NativeJuryTelevoteScatter({
  data,
  hoverId,
  onHover,
}: {
  data: readonly JuryTelevoteScatterDatum[];
  hoverId: string | null;
  onHover: (id: string | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The SSR and hydration starting size deliberately agree.
  const [size, setSize] = useState<Dimensions>({ width: 560, height: 360 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const bounds = host.getBoundingClientRect();
      if (bounds.width < 1 || bounds.height < 1) return;
      const next = { width: Math.round(bounds.width), height: Math.round(bounds.height) };
      setSize((previous) =>
        previous.width === next.width && previous.height === next.height ? previous : next,
      );
    };
    update();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(update);
      observer.observe(host);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const xBounds = useMemo(() => scatterAxisBounds(data.map((point) => point.jury)), [data]);
  const yBounds = useMemo(() => scatterAxisBounds(data.map((point) => point.televote)), [data]);
  const appearances = data.map((point) => point.n);
  const lowCount = Math.min(...appearances);
  const highCount = Math.max(...appearances);

  const left = 62;
  const top = 14;
  const plotWidth = Math.max(1, size.width - left - 22);
  const plotHeight = Math.max(1, size.height - top - 55);
  const xFor = (value: number) => scatterPlotCoordinate(value, xBounds, left, plotWidth);
  const yFor = (value: number) => scatterPlotCoordinate(value, yBounds, top, plotHeight, true);
  const ticks = [0, 1, 2, 3, 4];
  const hovered = data.find((point) => point.id === hoverId);

  return (
    <div ref={hostRef} className="relative h-full w-full" data-native-jury-televote-scatter="">
      <svg
        aria-label="Average jury points by average televote points. Dot area indicates appearances."
        role="img"
        className="block h-full w-full"
        viewBox={`0 0 ${size.width} ${size.height}`}
      >
        {ticks.map((index) => {
          const amount = index / 4;
          const x = left + amount * plotWidth;
          const y = top + amount * plotHeight;
          return (
            <g key={index}>
              <line x1={x} x2={x} y1={top} y2={top + plotHeight} stroke="var(--border)" strokeDasharray="3 3" />
              <line x1={left} x2={left + plotWidth} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 3" />
              <text x={x} y={top + plotHeight + 17} fill="var(--muted-foreground)" fontSize="11" textAnchor="middle">
                {(xBounds.min + amount * (xBounds.max - xBounds.min)).toFixed(1)}
              </text>
              <text x={left - 9} y={y + 4} fill="var(--muted-foreground)" fontSize="11" textAnchor="end">
                {(yBounds.max - amount * (yBounds.max - yBounds.min)).toFixed(1)}
              </text>
            </g>
          );
        })}
        <text x={left + plotWidth / 2} y={size.height - 8} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)">
          Average jury points
        </text>
        <text
          transform={`translate(14 ${top + plotHeight / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize="11"
          fill="var(--muted-foreground)"
        >
          Average televote points
        </text>
        {data.map((point) => {
          const active = point.id === hoverId;
          return (
            <circle
              key={point.id}
              cx={xFor(point.jury)}
              cy={yFor(point.televote)}
              r={scatterPointRadius(point.n, lowCount, highCount) + (active ? 3 : 0)}
              fill={point.color}
              fillOpacity={active ? 0.95 : 0.78}
              stroke={active ? "var(--gold)" : "rgba(255,255,255,.22)"}
              strokeWidth={active ? 2.5 : 1}
              className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              role="button"
              tabIndex={0}
              aria-label={`${point.name}: jury ${point.jury.toFixed(1)}, televote ${point.televote.toFixed(1)}, ${point.n} appearances`}
              onMouseEnter={() => onHover(point.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(point.id)}
              onBlur={() => onHover(null)}
              onClick={() => onHover(point.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onHover(point.id);
                }
              }}
            />
          );
        })}
      </svg>
      {hovered ? (
        <div
          className="glass pointer-events-none absolute z-10 min-w-40 p-3 text-xs shadow-xl"
          aria-hidden="true"
          style={{
            left: Math.max(4, Math.min(size.width - 176, xFor(hovered.jury) + 12)),
            top: Math.max(4, Math.min(size.height - 108, yFor(hovered.televote) - 110)),
          }}
        >
          <p className="font-semibold">{hovered.name}</p>
          <p className="mt-1">Avg jury: {hovered.jury.toFixed(1)}</p>
          <p>Avg televote: {hovered.televote.toFixed(1)}</p>
          <p className="mt-1 text-muted-foreground">{hovered.n} appearances</p>
        </div>
      ) : null}
    </div>
  );
}
