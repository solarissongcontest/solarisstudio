import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { cn } from "@/lib/utils";
import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data";
import { computeCountryStats, type CountryStats } from "@/lib/stats";

export const Route = createFileRoute("/countries/")({
  head: () => ({
    meta: [
      { title: "Terra Solaris countries — Solaris Scoreboard Studio" },
      {
        name: "description",
        content:
          "Every Terra Solaris nation competing in the Solaris Song Contest, with participations, wins, average placement, points and qualification rate on record.",
      },
      { property: "og:title", content: "Terra Solaris countries — Solaris Scoreboard Studio" },
      { property: "og:description", content: "Sortable, filterable statistics for all Terra Solaris delegations." },
    ],
  }),
  component: CountriesPage,
});

type Row = { country: NonNullable<ReturnType<typeof useCountries>["data"]>[number]; stats: CountryStats };

type SortKey = "name" | "participations" | "wins" | "avgPlacement" | "points" | "qualPct";

function CountriesPage() {
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: jury } = useAllJuryVotes();
  const { data: televote } = useAllTelevotes();

  const [search, setSearch] = useState("");
  const [region, setRegion] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("participations");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<string[]>([]);

  const regions = useMemo(() => [...new Set((countries ?? []).map((c) => c.region))].sort(), [countries]);

  const rows: Row[] = useMemo(() => {
    if (!countries) return [];
    const opts = {
      editions: editions ?? [],
      shows: shows ?? [],
      participants: participants ?? [],
      results: results ?? [],
      jury: jury ?? [],
      televote: televote ?? [],
    };
    return countries.map((country) => ({ country, stats: computeCountryStats(country.id, opts) }));
  }, [countries, editions, shows, participants, results, jury, televote]);

  const filtered = useMemo(() => {
    let out = rows;
    if (region !== "all") out = out.filter((r) => r.country.region === region);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) => r.country.name.toLowerCase().includes(q) || r.country.short_code.toLowerCase().includes(q),
      );
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (r: Row): number => {
      switch (sortKey) {
        case "name":
          return 0;
        case "participations":
          return r.stats.participations;
        case "wins":
          return r.stats.wins;
        case "avgPlacement":
          return r.stats.avgCombinedPlacement ?? Number.POSITIVE_INFINITY;
        case "points":
          return r.stats.avgPointsPerParticipation ?? 0;
        case "qualPct":
          return r.stats.qualificationPct ?? -1;
      }
    };
    out = [...out].sort((a, b) => {
      if (sortKey === "name") return dir * a.country.name.localeCompare(b.country.name);
      // avgPlacement: lower is better, so invert default sort feel is fine — keep numeric sort by dir
      return dir * (val(a) - val(b));
    });
    return out;
  }, [rows, region, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "avgPlacement" ? "asc" : "desc");
    }
  }

  function toggleSelect(id: string) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 2) return [cur[1], id];
      return [...cur, id];
    });
  }

  const compareHref = useMemo(() => {
    if (selected.length !== 2) return null;
    const [a, b] = selected.map((id) => (countries ?? []).find((c) => c.id === id)?.short_code).filter(Boolean);
    if (!a || !b) return null;
    return `/compare?a=${a}&b=${b}`;
  }, [selected, countries]);

  const columns: { key: SortKey; label: string }[] = [
    { key: "name", label: "Country" },
    { key: "participations", label: "Participations" },
    { key: "wins", label: "Wins" },
    { key: "avgPlacement", label: "Avg. placement" },
    { key: "points", label: "Avg. points" },
    { key: "qualPct", label: "Qualification %" },
  ];

  return (
    <AppShell>
      <PageHeader
        eyebrow="Delegations"
        title="Terra Solaris countries"
        description="Sortable, filterable statistics for every participating nation. Pick two to compare head-to-head."
        actions={
          compareHref ? (
            <a
              href={compareHref}
              className="bg-aurora rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Compare selected →
            </a>
          ) : undefined
        }
      />

      <Panel className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search country or code…"
            className="w-full max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary sm:w-auto"
          />
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setRegion("all")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                region === "all" ? "bg-surface-strong text-foreground" : "text-muted-foreground hover:bg-surface",
              )}
            >
              All regions
            </button>
            {regions.map((r) => (
              <button
                key={r}
                onClick={() => setRegion(r)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  region === r ? "bg-surface-strong text-foreground" : "text-muted-foreground hover:bg-surface",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          {selected.length > 0 && (
            <span className="ml-auto text-xs text-muted-foreground">
              {selected.length}/2 selected for comparison
            </span>
          )}
        </div>
      </Panel>

      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-8 px-2 py-2" />
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2">
                  <button
                    onClick={() => toggleSort(col.key)}
                    className={cn(
                      "flex items-center gap-1 transition-colors hover:text-foreground",
                      sortKey === col.key && "text-foreground",
                    )}
                  >
                    {col.label}
                    {sortKey === col.key && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 text-right">Links</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ country: c, stats }) => (
              <tr key={c.id} className="border-b border-border/60 hover:bg-surface/60">
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    aria-label={`Select ${c.name} for comparison`}
                  />
                </td>
                <td className="px-3 py-2">
                  <Link to="/countries/$code" params={{ code: c.short_code }} className="flex items-center gap-3">
                    <FlagChip code={c.short_code} color={c.accent_color} image={c.flag_image} size="sm" />
                    <span className="font-medium">{c.name}</span>
                  </Link>
                </td>
                <td className="numeric px-3 py-2">{stats.participations}</td>
                <td className="numeric px-3 py-2">{stats.wins}</td>
                <td className="numeric px-3 py-2">
                  {stats.avgCombinedPlacement != null ? stats.avgCombinedPlacement.toFixed(1) : "—"}
                </td>
                <td className="numeric px-3 py-2">
                  {stats.avgPointsPerParticipation != null ? stats.avgPointsPerParticipation.toFixed(1) : "—"}
                </td>
                <td className="numeric px-3 py-2">
                  {stats.qualificationPct != null ? `${stats.qualificationPct.toFixed(0)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-right text-xs">
                  <Link to="/countries/$code" params={{ code: c.short_code }} className="text-primary hover:underline">
                    Profile
                  </Link>
                  <span className="mx-1 text-muted-foreground">·</span>
                  <a href={`/compare?a=${c.short_code}`} className="text-primary hover:underline">
                    Compare
                  </a>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={columns.length + 2} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No countries match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </AppShell>
  );
}
