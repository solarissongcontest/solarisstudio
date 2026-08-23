import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { editionLabel, type Country, type Edition, type ResultRow, type Show } from "@/lib/data";
import { cn } from "@/lib/utils";

export function HistoricalLeaderboard({
  countries,
  editions,
  results,
  shows,
  limit = 8,
}: {
  countries: Country[];
  editions: Edition[];
  results: ResultRow[];
  shows: Show[];
  limit?: number;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const countryMap = new Map(countries.map((country) => [country.id, country]));
  const showMap = useMemo(() => new Map(shows.map((show) => [show.id, show])), [shows]);

  const sortedEditions = useMemo(
    () =>
      [...editions]
        .filter((edition) => edition.edition_number != null)
        .sort((a, b) => (a.edition_number ?? 0) - (b.edition_number ?? 0)),
    [editions],
  );

  // One public historical point per country per edition. If both a semi-final
  // and Grand Final result exist, the Grand Final is the edition result.
  const rankedResults = useMemo(() => {
    const canonical = new Map<string, ResultRow>();
    for (const result of results) {
      if (result.final_rank == null) continue;
      const key = `${result.country_id}:${result.edition_id}`;
      const current = canonical.get(key);
      if (!current) {
        canonical.set(key, result);
        continue;
      }

      const currentKind = showMap.get(current.show_id ?? "")?.kind;
      const resultKind = showMap.get(result.show_id ?? "")?.kind;
      const currentFinal = currentKind === "grand-final" || currentKind === "final";
      const resultFinal = resultKind === "grand-final" || resultKind === "final";

      if (resultFinal && !currentFinal) {
        canonical.set(key, result);
      } else if (
        resultFinal === currentFinal &&
        (result.final_rank ?? Number.MAX_SAFE_INTEGER) <
          (current.final_rank ?? Number.MAX_SAFE_INTEGER)
      ) {
        canonical.set(key, result);
      }
    }
    return [...canonical.values()];
  }, [results, showMap]);

  const topIds = useMemo(() => {
    const appearances = new Map<string, number>();
    const points = new Map<string, number>();
    for (const result of rankedResults) {
      appearances.set(result.country_id, (appearances.get(result.country_id) ?? 0) + 1);
      points.set(result.country_id, (points.get(result.country_id) ?? 0) + result.total_points);
    }
    return [...appearances.keys()]
      .sort(
        (a, b) =>
          (points.get(b) ?? 0) - (points.get(a) ?? 0) ||
          (appearances.get(b) ?? 0) - (appearances.get(a) ?? 0),
      )
      .slice(0, limit);
  }, [rankedResults, limit]);

  const data = useMemo(
    () =>
      sortedEditions.map((edition) => {
        const row: Record<string, number | string | null> = {
          label: editionLabel(edition),
          editionNumber: edition.edition_number,
        };
        for (const id of topIds) {
          const result = rankedResults.find(
            (candidate) => candidate.edition_id === edition.id && candidate.country_id === id,
          );
          row[id] = result?.final_rank ?? null;
        }
        return row;
      }),
    [sortedEditions, topIds, rankedResults],
  );

  if (!topIds.length || !sortedEditions.length) {
    return <p className="text-sm text-muted-foreground">Not enough historical data yet.</p>;
  }

  const maxRank = Math.max(
    1,
    ...rankedResults
      .filter((result) => topIds.includes(result.country_id))
      .map((result) => result.final_rank ?? 1),
  );

  return (
    <div className="min-w-0">
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        <GuideItem
          number="01"
          title="Each line is a country"
          text="The chart follows the selected countries across the editions included by the filters above."
        />
        <GuideItem
          number="02"
          title="Higher is better"
          text="The vertical axis is finishing position, so #1 is at the top and lower placements appear farther down."
        />
        <GuideItem
          number="03"
          title="One result per edition"
          text="A finalist uses its Grand Final result, not a second semi-final result. Missing editions remain blank."
        />
      </div>

      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
        This view is about <strong className="text-foreground">placement history</strong>, not cumulative points.
        Hover or tap a country label below to isolate its line. Archive gaps will disappear automatically as more historical data is added.
      </p>

      <div className="h-[380px] w-full md:h-[460px] xl:h-[520px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} />
            <YAxis
              reversed
              domain={[1, maxRank]}
              stroke="var(--muted-foreground)"
              fontSize={11}
              allowDecimals={false}
              tickFormatter={(value) => `#${value}`}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--foreground)" }}
              formatter={(value: unknown, key: unknown) => [
                value == null ? "No archived result" : `#${String(value)}`,
                countryMap.get(String(key))?.name ?? String(key),
              ]}
            />

            {topIds.map((id) => {
              const country = countryMap.get(id);
              const dim = Boolean(hoverId && hoverId !== id);
              return (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  name={country?.name ?? id}
                  stroke={country?.accent_color ?? "var(--jury)"}
                  strokeWidth={hoverId === id ? 3 : 1.75}
                  strokeOpacity={dim ? 0.15 : 1}
                  dot={{ r: 2 }}
                  connectNulls={false}
                  isAnimationActive
                  animationDuration={800}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {topIds.map((id) => {
          const country = countryMap.get(id);
          if (!country) return null;
          return (
            <Link
              key={id}
              to="/countries/$code"
              params={{ code: country.short_code }}
              onMouseEnter={() => setHoverId(id)}
              onMouseLeave={() => setHoverId(null)}
              onFocus={() => setHoverId(id)}
              onBlur={() => setHoverId(null)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs transition-colors",
                hoverId === id ? "bg-surface-strong" : "bg-surface",
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: country.accent_color }} />
              {country.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function GuideItem({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-surface p-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">{number}</p>
      <p className="mt-1 text-xs font-semibold">{title}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}
