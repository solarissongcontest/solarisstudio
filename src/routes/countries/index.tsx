import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { SolarisStarFlag } from "@/components/SolarisStarFlag";
import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data";
import { computeCountryStats } from "@/lib/stats";

export const Route = createFileRoute("/countries/")({
  head: () => ({
    meta: [
      { title: "Countries — Solaris Studio" },
      {
        name: "description",
        content: "Browse every Terra Solaris delegation and its Solaris Song Contest record.",
      },
    ],
  }),
  component: CountriesPage,
});

type SortKey = "name" | "participations" | "wins" | "placement";

function CountriesPage() {
  const { data: countries } = useCountries();
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: participants } = useAllParticipants();
  const { data: results } = useAllResults();
  const { data: jury } = useAllJuryVotes();
  const { data: televote } = useAllTelevotes();

  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");

  const opts = useMemo(
    () => ({
      editions: editions ?? [],
      shows: shows ?? [],
      participants: participants ?? [],
      results: results ?? [],
      jury: jury ?? [],
      televote: televote ?? [],
    }),
    [editions, shows, participants, results, jury, televote],
  );

  const regions = useMemo(
    () => [...new Set((countries ?? []).map((country) => country.region).filter(Boolean))].sort(),
    [countries],
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();

    const list = (countries ?? [])
      .map((country) => ({
        country,
        stats: computeCountryStats(country.id, opts),
      }))
      .filter(({ country }) => region === "all" || country.region === region)
      .filter(
        ({ country }) =>
          !query ||
          country.name.toLowerCase().includes(query) ||
          country.short_code.toLowerCase().includes(query),
      );

    return list.sort((a, b) => {
      if (sort === "name") return a.country.name.localeCompare(b.country.name);
      if (sort === "participations") return b.stats.participations - a.stats.participations;
      if (sort === "wins") return b.stats.wins - a.stats.wins;
      return (
        (a.stats.avgCombinedPlacement ?? Number.POSITIVE_INFINITY) -
        (b.stats.avgCombinedPlacement ?? Number.POSITIVE_INFINITY)
      );
    });
  }, [countries, opts, search, region, sort]);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Delegations"
        title="Countries"
        description="Find a country, open its profile, and get the important history without wading through an aircraft cockpit of filters."
        actions={
          <Link
            to="/compare"
            className="rounded-xl border border-border bg-surface px-4 py-2.5 text-sm"
          >
            Compare two countries
          </Link>
        }
      />

      <Panel className="mb-5">
        <div className="grid gap-2 sm:grid-cols-[1fr_180px_180px]">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search country or code…"
            className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none"
          />
          <select
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          >
            <option value="all">All regions</option>
            {regions.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          >
            <option value="name">A–Z</option>
            <option value="participations">Most participations</option>
            <option value="wins">Most wins</option>
            <option value="placement">Best avg. placement</option>
          </select>
        </div>
      </Panel>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{rows.length} countries</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ country, stats }) => (
          <Link
            key={country.id}
            to="/countries/$code"
            params={{ code: country.short_code }}
            className="glass group block p-4 transition-transform hover:-translate-y-0.5"
          >
            <div className="flex items-center gap-3">
              <SolarisStarFlag
                name={country.name}
                color={country.accent_color}
                image={country.flag_image}
                size="xl"
                fit="display"
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold">{country.name}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {country.short_code} · {country.region}
                </p>
              </div>
              <span className="text-sm text-primary">→</span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/60 pt-3">
              <MiniStat label="Entries" value={stats.participations} />
              <MiniStat label="Wins" value={stats.wins} />
              <MiniStat
                label="Avg. rank"
                value={stats.avgCombinedPlacement?.toFixed(1) ?? "—"}
              />
            </div>
          </Link>
        ))}

        {!rows.length && (
          <div className="glass p-6 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
            No countries match those filters.
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="numeric mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
