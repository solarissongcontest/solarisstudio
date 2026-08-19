import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import type { Country, ResultRow } from "@/lib/data";

export function JuryVsTelevote({ countries, results }: { countries: Country[]; results: ResultRow[] }) {
  const cMap = useMemo(() => new Map(countries.map((country) => [country.id, country])), [countries]);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const data = useMemo(() => {
    const totals = new Map<string, { jury: number; televote: number; n: number }>();

    results.forEach((row) => {
      const jury = Number(row.jury_points);
      const televote = Number(row.televote_points);
      if (!row.country_id || !Number.isFinite(jury) || !Number.isFinite(televote)) return;

      const current = totals.get(row.country_id) ?? { jury: 0, televote: 0, n: 0 };
      current.jury += jury;
      current.televote += televote;
      current.n += 1;
      totals.set(row.country_id, current);
    });

    return [...totals.entries()]
      .map(([id, value]) => ({
        id,
        name: cMap.get(id)?.name ?? "Unknown country",
        code: cMap.get(id)?.short_code ?? "",
        color: cMap.get(id)?.accent_color || "var(--jury)",
        jury: value.n ? value.jury / value.n : 0,
        televote: value.n ? value.televote / value.n : 0,
        n: value.n,
      }))
      .filter(
        (row) =>
          row.n > 0 &&
          Number.isFinite(row.jury) &&
          Number.isFinite(row.televote),
      );
  }, [results, cMap]);

  if (!data.length) {
    return (
      <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-border/70 bg-surface/30 px-4 text-center">
        <div>
          <p className="text-sm font-semibold text-foreground">No comparable jury and televote data</p>
          <p className="mt-1 text-xs text-muted-foreground">Publish result rows with both components to populate this chart.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="h-[360px] w-full sm:h-[440px] lg:h-[520px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <ScatterChart margin={{ top: 12, right: 22, bottom: 20, left: 4 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="jury"
              name="Avg jury points"
              stroke="var(--muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              label={{ value: "Average jury points", position: "insideBottom", offset: -12 }}
            />
            <YAxis
              type="number"
              dataKey="televote"
              name="Avg televote points"
              stroke="var(--muted-foreground)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={42}
              label={{ value: "Average televote points", angle: -90, position: "insideLeft" }}
            />
            <ZAxis type="number" dataKey="n" range={[70, 280]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as (typeof data)[number];
                return (
                  <div className="glass min-w-40 p-3 text-xs shadow-xl">
                    <p className="font-semibold">{point.name}</p>
                    <p className="mt-1">Avg jury: {point.jury.toFixed(1)}</p>
                    <p>Avg televote: {point.televote.toFixed(1)}</p>
                    <p className="mt-1 text-muted-foreground">{point.n} appearances</p>
                  </div>
                );
              }}
            />
            <Scatter
              data={data}
              onMouseEnter={(point: any) => setHoverId(point.id)}
              onMouseLeave={() => setHoverId(null)}
              shape={(props: any) => {
                const point = props.payload as (typeof data)[number];
                const isHover = hoverId === point.id;
                const size = Number(props.size);
                const baseRadius = Number.isFinite(size) && size > 0 ? Math.sqrt(size / Math.PI) : 7;
                const radius = isHover ? baseRadius + 3 : baseRadius;

                return (
                  <circle
                    cx={Number(props.cx) || 0}
                    cy={Number(props.cy) || 0}
                    r={radius}
                    fill={point.color}
                    fillOpacity={isHover ? 0.95 : 0.78}
                    stroke={isHover ? "var(--gold)" : "rgba(255,255,255,.22)"}
                    strokeWidth={isHover ? 2.5 : 1}
                    className="cursor-pointer transition-opacity"
                  />
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <p>Each dot is one country; dot size reflects the number of result appearances.</p>
        {hoverId && cMap.get(hoverId) ? (
          <Link
            to="/countries/$code"
            params={{ code: cMap.get(hoverId)?.short_code ?? "" }}
            className="font-semibold text-primary hover:underline"
          >
            View {cMap.get(hoverId)?.name} profile →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
