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
      {
        title:
          "Terra Solaris countries — Solaris Scoreboard Studio",
      },
      {
        name: "description",
        content:
          "Every Terra Solaris nation competing in the Solaris Song Contest, with participations, wins, average placement, points and qualification rate on record.",
      },
      {
        property: "og:title",
        content:
          "Terra Solaris countries — Solaris Scoreboard Studio",
      },
      {
        property: "og:description",
        content:
          "Sortable, filterable statistics for all Terra Solaris delegations.",
      },
    ],
  }),
  component: CountriesPage,
});

type Row = {
  country: NonNullable<
    ReturnType<typeof useCountries>["data"]
  >[number];
  stats: CountryStats;
};

type SortKey =
  | "name"
  | "participations"
  | "wins"
  | "avgPlacement"
  | "points"
  | "qualPct";

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: "participations", label: "Participations" },
  { value: "wins", label: "Wins" },
  { value: "avgPlacement", label: "Average placement" },
  { value: "points", label: "Average points" },
  { value: "qualPct", label: "Qualification %" },
  { value: "name", label: "Country name" },
];

const TABLE_COLUMNS: Array<{ value: SortKey; label: string }> = [
  { value: "name", label: "Country" },
  { value: "participations", label: "Participations" },
  { value: "wins", label: "Wins" },
  { value: "avgPlacement", label: "Avg. placement" },
  { value: "points", label: "Avg. points" },
  { value: "qualPct", label: "Qualification %" },
];

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
  const [sortKey, setSortKey] =
    useState<SortKey>("participations");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(
    "desc",
  );
  const [selected, setSelected] = useState<string[]>([]);

  const regions = useMemo(
    () =>
      [
        ...new Set((countries ?? []).map((country) => country.region)),
      ].sort(),
    [countries],
  );

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

    return countries.map((country) => ({
      country,
      stats: computeCountryStats(country.id, opts),
    }));
  }, [
    countries,
    editions,
    shows,
    participants,
    results,
    jury,
    televote,
  ]);

  const filtered = useMemo(() => {
    let out = rows;

    if (region !== "all") {
      out = out.filter(
        (row) => row.country.region === region,
      );
    }

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      out = out.filter(
        (row) =>
          row.country.name.toLowerCase().includes(query) ||
          row.country.short_code
            .toLowerCase()
            .includes(query),
      );
    }

    const dir = sortDir === "asc" ? 1 : -1;

    const value = (row: Row): number => {
      switch (sortKey) {
        case "name":
          return 0;
        case "participations":
          return row.stats.participations;
        case "wins":
          return row.stats.wins;
        case "avgPlacement":
          return (
            row.stats.avgCombinedPlacement ??
            Number.POSITIVE_INFINITY
          );
        case "points":
          return row.stats.avgPointsPerParticipation ?? 0;
        case "qualPct":
          return row.stats.qualificationPct ?? -1;
      }
    };

    return [...out].sort((a, b) => {
      if (sortKey === "name") {
        return (
          dir *
          a.country.name.localeCompare(b.country.name)
        );
      }

      return dir * (value(a) - value(b));
    });
  }, [rows, region, search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
      return;
    }

    setSortKey(key);
    setSortDir(key === "avgPlacement" ? "asc" : "desc");
  };

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id);
      }

      if (current.length >= 2) {
        return [current[1], id];
      }

      return [...current, id];
    });
  };

  const compareHref = useMemo(() => {
    if (selected.length !== 2) return null;

    const [a, b] = selected
      .map(
        (id) =>
          (countries ?? []).find(
            (country) => country.id === id,
          )?.short_code,
      )
      .filter(Boolean);

    if (!a || !b) return null;

    return `/compare?a=${a}&b=${b}`;
  }, [selected, countries]);

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
              className="bg-aurora col-span-2 flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-medium text-primary-foreground sm:col-span-1"
            >
              Compare selected
            </a>
          ) : undefined
        }
      />

      <Panel className="mb-4 sm:mb-6">
        <div className="space-y-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search country or code…"
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
          />

          {/* Mobile filters */}
          <div className="grid grid-cols-2 gap-2 md:hidden">
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Region
              </span>
              <select
                value={region}
                onChange={(event) =>
                  setRegion(event.target.value)
                }
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
              >
                <option value="all">All regions</option>
                {regions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Sort
              </span>
              <select
                value={sortKey}
                onChange={(event) =>
                  setSortKey(event.target.value as SortKey)
                }
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
              >
                {SORT_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-2 md:hidden">
            <button
              type="button"
              onClick={() =>
                setSortDir((direction) =>
                  direction === "asc" ? "desc" : "asc",
                )
              }
              className="min-h-10 rounded-lg border border-border px-3 text-xs"
            >
              {sortDir === "asc"
                ? "Ascending ↑"
                : "Descending ↓"}
            </button>

            <span className="text-xs text-muted-foreground">
              {filtered.length} countries
            </span>
          </div>

          {/* Desktop region chips */}
          <div className="hidden flex-wrap gap-1 md:flex">
            <button
              type="button"
              onClick={() => setRegion("all")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                region === "all"
                  ? "bg-surface-strong text-foreground"
                  : "text-muted-foreground hover:bg-surface",
              )}
            >
              All regions
            </button>

            {regions.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRegion(item)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                  region === item
                    ? "bg-surface-strong text-foreground"
                    : "text-muted-foreground hover:bg-surface",
                )}
              >
                {item}
              </button>
            ))}

            {selected.length > 0 && (
              <span className="ml-auto self-center text-xs text-muted-foreground">
                {selected.length}/2 selected
              </span>
            )}
          </div>
        </div>
      </Panel>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {filtered.map(({ country, stats }) => {
          const isSelected = selected.includes(country.id);

          return (
            <article
              key={country.id}
              className={cn(
                "glass min-w-0 p-3",
                isSelected &&
                  "ring-1 ring-primary/60",
              )}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={() => toggleSelect(country.id)}
                  className={cn(
                    "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-surface text-muted-foreground",
                  )}
                  aria-label={`Select ${country.name} for comparison`}
                >
                  {isSelected ? "✓" : "+"}
                </button>

                <Link
                  to="/countries/$code"
                  params={{ code: country.short_code }}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <FlagChip
                    code={country.short_code}
                    color={country.accent_color}
                    image={country.flag_image}
                    size="sm"
                  />

                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">
                      {country.name}
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      {country.short_code} · {country.region}
                    </p>
                  </div>
                </Link>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-border pt-3 text-xs">
                <Metric
                  label="Participations"
                  value={stats.participations}
                />
                <Metric label="Wins" value={stats.wins} />
                <Metric
                  label="Avg. placement"
                  value={
                    stats.avgCombinedPlacement != null
                      ? stats.avgCombinedPlacement.toFixed(1)
                      : "—"
                  }
                />
                <Metric
                  label="Avg. points"
                  value={
                    stats.avgPointsPerParticipation != null
                      ? stats.avgPointsPerParticipation.toFixed(1)
                      : "—"
                  }
                />
                <Metric
                  label="Qualification"
                  value={
                    stats.qualificationPct != null
                      ? `${stats.qualificationPct.toFixed(0)}%`
                      : "—"
                  }
                />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link
                  to="/countries/$code"
                  params={{ code: country.short_code }}
                  className="flex min-h-10 items-center justify-center rounded-lg border border-border text-xs font-medium"
                >
                  Profile
                </Link>

                <a
                  href={`/compare?a=${country.short_code}`}
                  className="flex min-h-10 items-center justify-center rounded-lg bg-surface text-xs font-medium"
                >
                  Compare
                </a>
              </div>
            </article>
          );
        })}

        {!filtered.length && (
          <div className="glass p-6 text-center text-sm text-muted-foreground">
            No countries match your filters.
          </div>
        )}
      </div>

      {/* Desktop table */}
      <Panel className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-8 px-2 py-2" />
              {TABLE_COLUMNS.map((column) => (
                <th key={column.value} className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort(column.value)}
                    className={cn(
                      "flex items-center gap-1 transition-colors hover:text-foreground",
                      sortKey === column.value &&
                        "text-foreground",
                    )}
                  >
                    {column.label}
                    {sortKey === column.value && (
                      <span>
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 text-right">
                Links
              </th>
            </tr>
          </thead>

          <tbody>
            {filtered.map(({ country, stats }) => (
              <tr
                key={country.id}
                className="border-b border-border/60 hover:bg-surface/60"
              >
                <td className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(country.id)}
                    onChange={() => toggleSelect(country.id)}
                    aria-label={`Select ${country.name} for comparison`}
                  />
                </td>

                <td className="px-3 py-2">
                  <Link
                    to="/countries/$code"
                    params={{ code: country.short_code }}
                    className="flex items-center gap-3"
                  >
                    <FlagChip
                      code={country.short_code}
                      color={country.accent_color}
                      image={country.flag_image}
                      size="sm"
                    />
                    <span className="font-medium">
                      {country.name}
                    </span>
                  </Link>
                </td>

                <td className="numeric px-3 py-2">
                  {stats.participations}
                </td>
                <td className="numeric px-3 py-2">
                  {stats.wins}
                </td>
                <td className="numeric px-3 py-2">
                  {stats.avgCombinedPlacement != null
                    ? stats.avgCombinedPlacement.toFixed(1)
                    : "—"}
                </td>
                <td className="numeric px-3 py-2">
                  {stats.avgPointsPerParticipation != null
                    ? stats.avgPointsPerParticipation.toFixed(1)
                    : "—"}
                </td>
                <td className="numeric px-3 py-2">
                  {stats.qualificationPct != null
                    ? `${stats.qualificationPct.toFixed(0)}%`
                    : "—"}
                </td>

                <td className="px-3 py-2 text-right text-xs">
                  <Link
                    to="/countries/$code"
                    params={{ code: country.short_code }}
                    className="text-primary hover:underline"
                  >
                    Profile
                  </Link>
                  <span className="mx-1 text-muted-foreground">
                    ·
                  </span>
                  <a
                    href={`/compare?a=${country.short_code}`}
                    className="text-primary hover:underline"
                  >
                    Compare
                  </a>
                </td>
              </tr>
            ))}

            {!filtered.length && (
              <tr>
                <td
                  colSpan={TABLE_COLUMNS.length + 2}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
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

function Metric({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">
        {label}
      </span>
      <span className="numeric font-semibold">{value}</span>
    </div>
  );
}
