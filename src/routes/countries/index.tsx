import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, SlidersHorizontal, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { computeCanonicalCountryStats } from "@/lib/canonical-country-stats";
import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data";

export const Route = createFileRoute("/countries/")({
  head: () => ({
    meta: [
      { title: "Countries — Solaris Song Contest" },
      {
        name: "description",
        content: "Browse every Terra Solaris delegation and its Solaris Song Contest record.",
      },
    ],
  }),
  component: CountriesPage,
});

type SortKey = "name" | "participations" | "wins" | "placement";

type CountryRow = {
  country: any;
  stats: ReturnType<typeof computeCanonicalCountryStats>;
};

const DIRECTORY_PAGE_SIZE = 18;

function CountriesPage() {
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();
  const showsQuery = useAllShows();
  const participantsQuery = useAllParticipants();
  const resultsQuery = useAllResults();
  const juryQuery = useAllJuryVotes();
  const televoteQuery = useAllTelevotes();
  const { data: countries } = countriesQuery;
  const { data: editions } = editionsQuery;
  const { data: shows } = showsQuery;
  const { data: participants } = participantsQuery;
  const { data: results } = resultsQuery;
  const { data: jury } = juryQuery;
  const { data: televote } = televoteQuery;

  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [visibleCount, setVisibleCount] = useState(DIRECTORY_PAGE_SIZE);

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

  const allRows = useMemo<CountryRow[]>(
    () =>
      (countries ?? []).map((country) => ({
        country,
        stats: computeCanonicalCountryStats(country.id, opts),
      })),
    [countries, opts],
  );

  const participantSearchTerms = useMemo(() => {
    const byCountry = new Map<string, string[]>();

    for (const participant of participants ?? []) {
      const terms = [participant.artist, participant.song]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

      if (!terms.length) continue;
      byCountry.set(participant.country_id, [
        ...(byCountry.get(participant.country_id) ?? []),
        ...terms,
      ]);
    }

    return byCountry;
  }, [participants]);

  const regions = useMemo(
    () => [...new Set((countries ?? []).map((country) => country.region).filter(Boolean))].sort(),
    [countries],
  );

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();

    const list = allRows
      .filter(({ country }) => region === "all" || country.region === region)
      .filter(({ country }) => {
        if (!query) return true;

        return (
          country.name.toLowerCase().includes(query) ||
          country.short_code.toLowerCase().includes(query) ||
          (country.native_name ?? "").toLowerCase().includes(query) ||
          (participantSearchTerms.get(country.id) ?? []).some((term) => term.includes(query))
        );
      });

    return [...list].sort((a, b) => {
      if (sort === "name") return a.country.name.localeCompare(b.country.name);
      if (sort === "participations") return b.stats.participations - a.stats.participations;
      if (sort === "wins") {
        const winDifference = b.stats.wins - a.stats.wins;
        return winDifference || b.stats.participations - a.stats.participations;
      }
      return (
        (a.stats.avgCombinedPlacement ?? Number.POSITIVE_INFINITY) -
        (b.stats.avgCombinedPlacement ?? Number.POSITIVE_INFINITY)
      );
    });
  }, [allRows, search, region, sort, participantSearchTerms]);

  const leaders = useMemo(
    () =>
      [...allRows]
        .filter(({ stats }) => stats.wins > 0)
        .sort(
          (a, b) =>
            b.stats.wins - a.stats.wins ||
            b.stats.participations - a.stats.participations,
        )
        .slice(0, 3),
    [allRows],
  );

  const totalWins = useMemo(
    () => allRows.reduce((sum, row) => sum + row.stats.wins, 0),
    [allRows],
  );
  const totalParticipations = useMemo(
    () => allRows.reduce((sum, row) => sum + row.stats.participations, 0),
    [allRows],
  );
  const activeFilters =
    (search.trim() ? 1 : 0) +
    (region !== "all" ? 1 : 0) +
    (sort !== "name" ? 1 : 0);
  const visibleRows = rows.slice(0, visibleCount);

  useEffect(() => setVisibleCount(DIRECTORY_PAGE_SIZE), [search, region, sort]);

  const archiveQueries = [countriesQuery, editionsQuery, showsQuery, participantsQuery, resultsQuery, juryQuery, televoteQuery];
  if (archiveIsLoading(...archiveQueries)) {
    return <AppShell><PageHeader eyebrow="Delegation directory" title="Countries" description="Browse every Solaris delegation, or search an artist or song to find the country that sent it." /><ArchiveDataLoading label="Loading countries and contest history…" /></AppShell>;
  }
  if (archiveHasError(...archiveQueries)) {
    return <AppShell><PageHeader eyebrow="Delegation directory" title="Countries" description="Browse every Solaris delegation, or search an artist or song to find the country that sent it." /><ArchiveDataError /></AppShell>;
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Delegation directory"
        title="Countries"
        description="Browse every Solaris delegation, or search an artist or song to find the country that sent it."
        className="directory-page-hero countries-library-hero"
        actions={
          <Link
            to="/compare"
            className="inline-flex min-h-11 items-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
          >
            Compare countries
          </Link>
        }
      />

      <section className="directory-stat-strip mb-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-4">
        <DirectoryStat label="Delegations" value={allRows.length} />
        <DirectoryStat label="Regions" value={regions.length} />
        <DirectoryStat label="Total entries" value={totalParticipations} />
        <DirectoryStat label="Recorded wins" value={totalWins} />
      </section>

      {leaders.length > 0 && (
        <details className="directory-secondary group mb-5 sm:mb-8">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between rounded-2xl border border-border/60 bg-surface/35 px-4 text-sm font-semibold lg:hidden [&::-webkit-details-marker]:hidden">
            Most successful delegations
            <span className="text-xs text-primary"><span className="group-open:hidden">Show ↓</span><span className="hidden group-open:inline">Hide ↑</span></span>
          </summary>
          <section className="directory-secondary-content mt-3 lg:mt-0">
          <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary">Record desk</p>
              <h2 className="mt-1 font-display text-xl font-black tracking-[-0.035em] sm:text-2xl">
                Most successful delegations
              </h2>
            </div>
            <Link
              to="/records"
              className="shrink-0 text-[9px] font-black uppercase tracking-[0.13em] text-primary sm:text-[10px]"
            >
              All records →
            </Link>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {leaders.map((row, index) => (
              <LeaderCard key={row.country.id} row={row} rank={index + 1} />
            ))}
          </div>
          </section>
        </details>
      )}

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary">Directory</p>
            <h2 className="mt-1 font-display text-xl font-black tracking-[-0.035em] sm:text-2xl">
              Find a delegation or entry
            </h2>
          </div>
          <p className="numeric text-xs text-muted-foreground">
            {rows.length} of {allRows.length}
          </p>
        </div>

        <div className="directory-page-filter mt-3 rounded-2xl border p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground sm:hidden">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters{activeFilters ? ` · ${activeFilters} active` : ""}
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_190px]">
            <label className="relative block min-w-0">
              <span className="sr-only">Search countries, artists or songs</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Country, artist or song…"
                className="min-h-11 w-full rounded-xl border border-border bg-background/45 pl-10 pr-3 text-sm outline-none transition focus:border-primary/55"
              />
            </label>

            <label>
              <span className="sr-only">Filter by region</span>
              <select
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-background/45 px-3 text-sm outline-none focus:border-primary/55"
              >
                <option value="all">All regions</option>
                {regions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="sr-only">Sort countries</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                className="min-h-11 w-full rounded-xl border border-border bg-background/45 px-3 text-sm outline-none focus:border-primary/55"
              >
                <option value="name">A–Z</option>
                <option value="participations">Most participations</option>
                <option value="wins">Most wins</option>
                <option value="placement">Best avg. placement</option>
              </select>
            </label>
          </div>

          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            Artist and song search uses entry information currently available in the Solaris archive.
          </p>
        </div>

        <div className="country-directory-grid mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visibleRows.map((row) => (
            <CountryCard key={row.country.id} row={row} />
          ))}

          {!rows.length && (
            <div className="rounded-2xl border border-border/70 bg-surface p-7 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">
              No countries or archived entries match those filters.
            </div>
          )}
        </div>

        {visibleRows.length < rows.length && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + DIRECTORY_PAGE_SIZE)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
            >
              Show {DIRECTORY_PAGE_SIZE} more · {rows.length - visibleRows.length} remaining
            </button>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function LeaderCard({ row, rank }: { row: CountryRow; rank: number }) {
  const { country, stats } = row;

  return (
    <Link
      to="/countries/$code"
      params={{ code: country.short_code }}
      className="directory-country-card group relative min-w-0 overflow-hidden rounded-2xl border p-4 transition duration-200"
      style={{ "--country-card-accent": country.accent_color } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <FlagChip
            code={country.short_code}
            color={country.accent_color}
            image={country.flag_image}
            size="lg"
          />
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[0.14em] text-primary">Archive rank #{rank}</p>
            <h3 className="truncate font-display text-xl font-black tracking-[-0.035em]">{country.name}</h3>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{country.region || "Terra Solaris"}</p>
          </div>
        </div>
        <Trophy className="h-4 w-4 shrink-0 text-primary" />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-border/55 pt-3">
        <MiniStat label="Wins" value={stats.wins} emphasis />
        <MiniStat label="Entries" value={stats.participations} />
        <MiniStat label="Avg. rank" value={stats.avgCombinedPlacement?.toFixed(1) ?? "—"} />
      </div>
    </Link>
  );
}

function CountryCard({ row }: { row: CountryRow }) {
  const { country, stats } = row;

  return (
    <Link
      to="/countries/$code"
      params={{ code: country.short_code }}
      className="directory-country-card group min-w-0 rounded-2xl border p-4 transition duration-200"
      style={{ "--country-card-accent": country.accent_color } as React.CSSProperties}
    >
      <div className="flex min-w-0 items-center gap-3">
        <FlagChip
          code={country.short_code}
          color={country.accent_color}
          image={country.flag_image}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold sm:text-base">{country.name}</h3>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground sm:text-xs">
            {country.short_code} · {country.region || "Region not set"}
          </p>
        </div>
        <span className="shrink-0 text-sm text-primary transition-transform group-hover:translate-x-1">→</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/50 pt-3">
        <MiniStat label="Entries" value={stats.participations} />
        <MiniStat label="Wins" value={stats.wins} emphasis={stats.wins > 0} />
        <MiniStat label="Avg. rank" value={stats.avgCombinedPlacement?.toFixed(1) ?? "—"} />
      </div>
    </Link>
  );
}

function DirectoryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface px-4 py-4 sm:px-5">
      <p className="text-[8px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="numeric mt-1.5 text-xl font-black tracking-[-0.03em] sm:text-2xl">{value}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string | number;
  emphasis?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[8px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={`numeric mt-1 text-sm font-black ${emphasis ? "text-primary" : ""}`}>{value}</p>
    </div>
  );
}
