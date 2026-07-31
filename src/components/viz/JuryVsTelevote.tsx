import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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
  const cMap = new Map(countries.map((c) => [c.id, c]));
  const [hoverId, setHoverId] = useState<string | null>(null);

  const data = useMemo(() => {
    const totals = new Map<string, { jury: number; televote: number; n: number }>();
    results.forEach((r) => {
      const cur = totals.get(r.country_id) ?? { jury: 0, televote: 0, n: 0 };
      cur.jury += r.jury_points;
      cur.televote += r.televote_points;
      cur.n += 1;
      totals.set(r.country_id, cur);
    });
    return [...totals.entries()]
      .map(([id, v]) => ({
        id,
        name: cMap.get(id)?.name ?? "?",
        code: cMap.get(id)?.short_code ?? "?",
        color: cMap.get(id)?.accent_color ?? "var(--jury)",
        jury: v.n ? v.jury / v.n : 0,
        televote: v.n ? v.televote / v.n : 0,
        n: v.n,
      }))
      .filter((d) => d.n > 0);
  }, [results, countries]);

  if (!data.length) return <p className="text-sm text-muted-foreground">Not enough result data yet.</p>;

  return (
    <div style={{ width: "100%", height: 420 }}>
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis type="number" dataKey="jury" name="Avg jury points" stroke="var(--muted-foreground)" fontSize={11} />
          <YAxis type="number" dataKey="televote" name="Avg televote points" stroke="var(--muted-foreground)" fontSize={11} />
          <ZAxis type="number" dataKey="n" range={[60, 260]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return (
                <div className="glass p-2 text-xs">
                  <p className="font-semibold">{d.name}</p>
                  <p>Avg jury: {d.jury.toFixed(1)}</p>
                  <p>Avg televote: {d.televote.toFixed(1)}</p>
                  <p className="text-muted-foreground">{d.n} appearances</p>
                </div>
              );
            }}
          />
          <Scatter
            data={data}
            onMouseEnter={(d: any) => setHoverId(d.id)}
            onMouseLeave={() => setHoverId(null)}
            shape={(props: any) => {
              const d = props.payload as (typeof data)[number];
              const isHover = hoverId === d.id;
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={isHover ? props.r + 3 : props.r}
                  fill={d.color}
                  fillOpacity={0.75}
                  stroke={isHover ? "var(--gold)" : "transparent"}
                  strokeWidth={2}
                  className="cursor-pointer"
                />
              );
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
      {hoverId && (
        <p className="mt-1 text-center text-xs text-muted-foreground">
          <Link to="/countries/$code" params={{ code: cMap.get(hoverId)?.short_code ?? "" }} className="text-primary hover:underline">
            View {cMap.get(hoverId)?.name} profile →
          </Link>
        </p>
      )}
    </div>
  );
}
