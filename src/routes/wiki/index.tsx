import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { ArchiveDataError, ArchiveDataLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useCountries } from "@/lib/data";

export const Route = createFileRoute("/wiki/")({
  head: () => ({
    meta: [
      { title: "Terra Solaris Wiki — Solaris Studio" },
      {
        name: "description",
        content: "Browse Terra Solaris country profiles and national information.",
      },
    ],
  }),
  component: WikiIndexPage,
});

const DIRECTORY_PAGE_SIZE = 18;

function WikiIndexPage() {
  const { isAppMode } = useSolarisApp();
  return isAppMode ? <AppWikiIndexPage /> : <WebWikiIndexPage />;
}

function AppWikiIndexPage() {
  const countriesQuery = useCountries();
  const { data: countries } = countriesQuery;
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");

  const regions = useMemo(
    () => [...new Set((countries ?? []).map((country) => country.region).filter(Boolean))].sort(),
    [countries],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...(countries ?? [])]
      .filter((country) => region === "all" || country.region === region)
      .filter((country) =>
        !query ||
        country.name.toLowerCase().includes(query) ||
        country.short_code.toLowerCase().includes(query) ||
        (country.native_name ?? "").toLowerCase().includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, region, search]);

  if (countriesQuery.isLoading) return <AppShell><ArchiveDataLoading label="Loading the Wiki…" /></AppShell>;
  if (countriesQuery.isError) return <AppShell><ArchiveDataError /></AppShell>;

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="solaris-app-directory-tools">
          <SolarisSearchField
            value={search}
            onChange={setSearch}
            label="Search the Wiki"
            placeholder="Search countries…"
          />

          <div className="solaris-app-directory-filterbar">
            <Sheet>
              <SheetTrigger asChild>
                <button type="button" className="solaris-app-filter-chip">
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  <span>{region === "all" ? "All regions" : region}</span>
                </button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                aria-label="Filter Wiki by region"
                className="solaris-app-filter-sheet"
              >
                <div className="solaris-app-filter-sheet-heading">
                  <p>Wiki</p>
                  <h2>Filter countries</h2>
                </div>
                <div className="mt-3">
                  {["all", ...regions].map((item) => {
                    const active = region === item;
                    return (
                      <SheetClose key={item} asChild>
                        <button
                          type="button"
                          onClick={() => setRegion(item)}
                          className={`solaris-app-filter-option${active ? " is-active" : ""}`}
                          aria-pressed={active}
                        >
                          <span>{item === "all" ? "All regions" : item}</span>
                          {active ? <Check className="size-4" aria-hidden="true" /> : null}
                        </button>
                      </SheetClose>
                    );
                  })}
                </div>
              </SheetContent>
            </Sheet>
            <span className="solaris-app-directory-count">{filtered.length} articles</span>
          </div>
        </div>

        <section aria-label="Terra Solaris Wiki">
          <div className="solaris-app-directory-list-v6">
            {filtered.map((country) => (
              <Link
                key={country.id}
                to="/wiki/$code"
                params={{ code: country.short_code }}
                className="solaris-app-country-row"
              >
                <FlagChip
                  code={country.short_code}
                  color={country.accent_color}
                  image={country.flag_image}
                  size="md"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{country.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {country.region || "Terra Solaris"} · {country.short_code}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
          </div>

          {!filtered.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No Wiki article matches those filters.</p>
          ) : null}
        </section>
      </div>
    </AppShell>
  );
}

function WebWikiIndexPage() {
  const countriesQuery = useCountries();
  const { data: countries } = countriesQuery;
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [letter, setLetter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(DIRECTORY_PAGE_SIZE);
  const [hydrated, setHydrated] = useState(false);

  const regions = useMemo(
    () => [...new Set((countries ?? []).map((country) => country.region).filter(Boolean))].sort(),
    [countries],
  );

  const letters = useMemo(
    () => [...new Set((countries ?? []).map((country) => country.name.slice(0, 1).toUpperCase()))].sort(),
    [countries],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...(countries ?? [])]
      .filter((country) =>
        (region === "all" || country.region === region) &&
        (letter === "all" || country.name.toUpperCase().startsWith(letter)) &&
        (!query ||
          country.name.toLowerCase().includes(query) ||
          country.short_code.toLowerCase().includes(query) ||
          (country.native_name ?? "").toLowerCase().includes(query)),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [countries, search, region, letter]);

  const visibleCountries = filtered.slice(0, visibleCount);
  useEffect(() => setVisibleCount(DIRECTORY_PAGE_SIZE), [search, region, letter]);
  useEffect(() => setHydrated(true), []);

  if (!hydrated || countriesQuery.isLoading) return <AppShell><PageHeader eyebrow="Terra Solaris" title="Wiki" description="Browse national profiles and country histories." /><ArchiveDataLoading label="Loading the Wiki library…" /></AppShell>;
  if (countriesQuery.isError) return <AppShell><PageHeader eyebrow="Terra Solaris" title="Wiki" description="Browse national profiles and country histories." /><ArchiveDataError /></AppShell>;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris"
        title="Wiki"
        description="Browse national profiles, country information and Solaris Song Contest history."
        className="directory-page-hero wiki-library-hero"
        actions={
          <Link
            to="/countries"
            className="directory-page-action w-full rounded-xl border px-3 py-2 text-center text-sm font-semibold sm:w-auto"
          >
            SSC country directory →
          </Link>
        }
      />

      <section className="directory-page-filter mb-5 rounded-2xl border p-3 sm:p-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="relative block min-w-0">
          <span className="sr-only">Search the Wiki</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search country or code…"
            className="min-h-11 w-full rounded-xl border border-border bg-background/45 pl-10 pr-3 text-sm outline-none transition focus:border-primary/55"
          />
        </label>
        <label>
          <span className="sr-only">Filter Wiki by region</span>
          <select
            value={region}
            onChange={(event) => setRegion(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-border bg-background/45 px-3 text-sm outline-none transition focus:border-primary/55"
          >
            <option value="all">All regions</option>
            {regions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        </div>

        <div className="scroll-slim mt-3 flex gap-1 overflow-x-auto pb-1" aria-label="Filter Wiki by first letter">
          <button
            type="button"
            onClick={() => setLetter("all")}
            aria-pressed={letter === "all"}
            className={`min-h-9 shrink-0 rounded-lg px-3 text-xs font-semibold ${letter === "all" ? "bg-primary/12 text-primary" : "bg-background/35 text-muted-foreground"}`}
          >
            All
          </button>
          {letters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setLetter(item)}
              aria-pressed={letter === item}
              className={`min-h-9 min-w-9 shrink-0 rounded-lg px-2 text-xs font-semibold ${letter === item ? "bg-primary/12 text-primary" : "bg-background/35 text-muted-foreground"}`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Country articles</p>
            <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">Browse the Wiki</h2>
          </div>
          <span className="numeric text-xs text-muted-foreground">{filtered.length}</span>
        </div>

        <div className="wiki-library-grid grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCountries.map((country) => (
            <Link
              key={country.id}
              to="/wiki/$code"
              params={{ code: country.short_code }}
              className="directory-country-card group flex min-w-0 items-center gap-3 rounded-2xl border p-4 transition"
              style={{ "--country-card-accent": country.accent_color } as React.CSSProperties}
            >
              <FlagChip
                code={country.short_code}
                color={country.accent_color}
                image={country.flag_image}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{country.name}</p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {country.region || "Terra Solaris"} · {country.short_code}
                </p>
              </div>
              <span className="shrink-0 text-primary transition-transform group-hover:translate-x-1">→</span>
            </Link>
          ))}

          {!filtered.length && (
            <div className="rounded-2xl border border-border/70 bg-surface p-7 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
              No Wiki country matches that search.
            </div>
          )}
        </div>

        {visibleCountries.length < filtered.length && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + DIRECTORY_PAGE_SIZE)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary"
            >
              Show {DIRECTORY_PAGE_SIZE} more · {filtered.length - visibleCountries.length} remaining
            </button>
          </div>
        )}
      </section>
    </AppShell>
  );
}
