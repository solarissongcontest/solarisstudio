import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { NativeJuryTelevoteScatter } from "./NativeJuryTelevoteScatter";

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

  const strongestSplits = [...data]
    .sort((a, b) => Math.abs(b.jury - b.televote) - Math.abs(a.jury - a.televote))
    .slice(0, 6);

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
      <div className="space-y-2 sm:hidden">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
          Biggest jury–televote gaps
        </p>
        {strongestSplits.map((point) => (
          <Link
            key={point.id}
            to="/countries/$code"
            params={{ code: point.code }}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface/45 px-3 py-2.5"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{point.name}</span>
              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                Jury {point.jury.toFixed(1)} · Televote {point.televote.toFixed(1)}
              </span>
            </span>
            <span className="numeric shrink-0 text-xs font-bold">
              Δ {Math.abs(point.jury - point.televote).toFixed(1)}
            </span>
          </Link>
        ))}
      </div>

      <details className="mt-3 rounded-xl border border-border/70 bg-surface/35 sm:hidden">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-semibold [&::-webkit-details-marker]:hidden">
          Open scatter plot
        </summary>
        <div className="border-t border-border/60 p-2">
      <div className="h-[360px] w-full">
        <NativeJuryTelevoteScatter data={data} hoverId={hoverId} onHover={setHoverId} />
      </div>
        </div>
      </details>

      <div className="hidden sm:block">
      <div className="h-[360px] w-full sm:h-[440px] lg:h-[520px]">
        <NativeJuryTelevoteScatter data={data} hoverId={hoverId} onHover={setHoverId} />
      </div>
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
