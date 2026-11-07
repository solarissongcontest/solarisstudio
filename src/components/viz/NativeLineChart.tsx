import { useEffect, useMemo, useRef, useState } from "react";

import "./native-line-chart.css";

export type NativeLineSeries = {
  key: string;
  name: string;
  stroke: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  connectNulls?: boolean;
  dots?: boolean;
};

type ChartSize = { width: number; height: number };
type Point = { x: number; y: number; value: number; index: number };

/** Cubic Hermite slopes keep the path monotone where the source points are monotone. */
function monotonePath(points: readonly Point[]): string {
  if (!points.length) return "";
  const start = "M " + points[0].x + " " + points[0].y;
  if (points.length === 1) return start;

  const delta = points.slice(1).map((point, index) => {
    const previous = points[index];
    return (point.y - previous.y) / (point.x - previous.x || 1);
  });
  const tangent = points.map((_point, index) => {
    if (index === 0) return delta[0];
    if (index === points.length - 1) return delta[delta.length - 1];
    const before = delta[index - 1];
    const after = delta[index];
    return before * after <= 0 ? 0 : 2 / (1 / before + 1 / after);
  });

  let path = start;
  for (let index = 1; index < points.length; index++) {
    const from = points[index - 1];
    const to = points[index];
    const dx = to.x - from.x;
    path += " C " + (from.x + dx / 3) + " " + (from.y + tangent[index - 1] * dx / 3)
      + " " + (to.x - dx / 3) + " " + (to.y - tangent[index] * dx / 3)
      + " " + to.x + " " + to.y;
  }
  return path;
}

function numeric(row: object, key: string): number | null {
  const raw = (row as Record<string, unknown>)[key];
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export function NativeLineChart({
  data,
  xKey,
  series,
  reversed = false,
  yDomain,
  yTickFormatter,
  valueFormatter,
  gridColor = "var(--border)",
  axisColor = "var(--muted-foreground)",
  tooltipBackground = "var(--popover)",
  tooltipBorder = "var(--border)",
  ariaLabel = "Historical line chart",
}: {
  data: readonly object[];
  xKey: string;
  series: readonly NativeLineSeries[];
  reversed?: boolean;
  yDomain?: readonly [number, number];
  yTickFormatter?: (value: number) => string;
  valueFormatter?: (value: number, key: string) => string;
  gridColor?: string;
  axisColor?: string;
  tooltipBackground?: string;
  tooltipBorder?: string;
  ariaLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<ChartSize>({ width: 640, height: 280 });
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const read = () => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };
    read();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(read);
      observer.observe(element);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  const domain = useMemo((): readonly [number, number] => {
    if (yDomain) return yDomain;
    const values = data.flatMap((row) =>
      series.map((line) => numeric(row, line.key)).filter((value): value is number => value !== null),
    );
    if (!values.length) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return min === max ? [min - 1, max + 1] : [min, max];
  }, [data, series, yDomain]);

  const left = 52;
  const top = 14;
  const right = 20;
  const bottom = 45;
  const width = Math.max(1, size.width - left - right);
  const height = Math.max(1, size.height - top - bottom);
  const x = (index: number) =>
    left + (data.length === 1 ? width / 2 : (index / Math.max(1, data.length - 1)) * width);
  const y = (value: number) =>
    top + (reversed
      ? (value - domain[0]) / (domain[1] - domain[0] || 1)
      : 1 - (value - domain[0]) / (domain[1] - domain[0] || 1)) * height;

  const labels = data.map((row) => String((row as Record<string, unknown>)[xKey] ?? ""));
  const maxXTicks = Math.max(2, Math.floor(width / 75));
  const tickCount = Math.min(data.length, maxXTicks);
  const xTicks = [...new Set(Array.from({ length: tickCount }, (_item, index) =>
    Math.round(index * (data.length - 1) / Math.max(1, tickCount - 1)),
  ))];
  const yTicks = [0, 1, 2, 3, 4];
  const lines = series.map((line) => {
    const segments: Point[][] = [];
    let current: Point[] = [];
    data.forEach((row, index) => {
      const value = numeric(row, line.key);
      if (value === null) {
        if (!line.connectNulls && current.length) {
          segments.push(current);
          current = [];
        }
      } else {
        current.push({ x: x(index), y: y(value), index, value });
      }
    });
    if (current.length) segments.push(current);
    return { line, segments };
  });
  const activeRow = activeIndex !== null ? data[activeIndex] : undefined;
  const selected = activeRow ? series.map((line) => ({
    name: line.name,
    stroke: line.stroke,
    key: line.key,
    value: numeric(activeRow, line.key),
  })).filter((line) => line.value !== null) : [];

  return (
    <div ref={host} className="relative h-full w-full" data-native-line-chart="">
      <svg role="group" aria-label={ariaLabel} className="block h-full w-full" viewBox={`0 0 ${size.width} ${size.height}`}>
        {yTicks.map((index) => {
          const fraction = index / 4;
          const yy = top + fraction * height;
          const value = domain[0] + (reversed ? fraction : 1 - fraction) * (domain[1] - domain[0]);
          return (
            <g key={index}>
              <line x1={left} x2={left + width} y1={yy} y2={yy} stroke={gridColor} strokeDasharray="3 3" />
              <text x={left - 8} y={yy + 4} fontSize="11" textAnchor="end" fill={axisColor}>
                {yTickFormatter ? yTickFormatter(value) : Number(value.toFixed(1)).toString()}
              </text>
            </g>
          );
        })}
        {xTicks.map((index) => (
          <g key={index}>
            <line x1={x(index)} x2={x(index)} y1={top} y2={top + height} stroke={gridColor} strokeDasharray="3 3" />
            <text x={x(index)} y={top + height + 19} textAnchor="middle" fontSize="10" fill={axisColor}>{labels[index]}</text>
          </g>
        ))}
        {lines.map(({ line, segments }) => (
          <g key={line.key}>
            {segments.map((segment, index) => (
              <path
                key={index}
                d={monotonePath(segment)}
                pathLength={1}
                className="solaris-native-line-chart-path"
                fill="none"
                stroke={line.stroke}
                strokeWidth={line.strokeWidth ?? 2}
                strokeOpacity={line.strokeOpacity ?? 1}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {line.dots !== false && segments.flat().map((point) => (
              <circle key={point.index} cx={point.x} cy={point.y} r={2.5} fill={line.stroke} fillOpacity={line.strokeOpacity ?? 1} />
            ))}
          </g>
        ))}
        {activeIndex !== null ? (
          <line x1={x(activeIndex)} x2={x(activeIndex)} y1={top} y2={top + height} stroke={axisColor} strokeDasharray="3 3" />
        ) : null}
        {data.map((row, index) => (
          <rect
            key={index}
            x={x(index) - width / Math.max(2, (data.length - 1) * 2)}
            y={top}
            width={width / Math.max(1, data.length - 1)}
            height={height}
            fill="transparent"
            role="button"
            tabIndex={0}
            className="cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            aria-label={labels[index] + ": " + series.map((line) =>
              line.name + " " + (numeric(row, line.key) ?? "unavailable"),
            ).join(", ")}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
            onFocus={() => setActiveIndex(index)}
            onBlur={() => setActiveIndex(null)}
            onClick={() => setActiveIndex(index)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveIndex(index);
              }
            }}
          />
        ))}
      </svg>
      {activeIndex !== null && selected.length ? (
        <div
          className="pointer-events-none absolute z-10 min-w-36 rounded-lg border p-3 text-xs shadow-xl"
          style={{
            background: tooltipBackground,
            borderColor: tooltipBorder,
            top: 12,
            left: Math.max(4, Math.min(size.width - 185, x(activeIndex) + 10)),
          }}
          aria-hidden="true"
        >
          <p className="mb-1 font-semibold">{labels[activeIndex]}</p>
          {selected.map((line) => (
            <p key={line.key} className="flex items-center gap-2 py-0.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: line.stroke }} />
              {line.name}: {valueFormatter ? valueFormatter(line.value!, line.key) : line.value}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
