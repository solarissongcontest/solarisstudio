import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, PageHeader, Panel } from "@/components/AppShell";
import { AppScreen } from "@/components/app/AppPrimitives";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { ArchiveDataError, ArchiveDataLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { FlagFrame } from "@/components/FlagMedia";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { type Country, useCountries } from "@/lib/data";
import { countryDirectoryRegionOptions, filterCountryDirectory } from "@/lib/v3-country-directory-filters";
import { useV3DirectoryPresentation, type V3DirectoryPresentation } from "@/lib/v3-directory-presentation";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";
import "@/styles/v3-directory-family.css";
import "@/styles/v3-voting-dna-directory.css";

const PAGE_SIZE = 24;
const NO_PARTICIPATION_FILTER = new Set<string>();

/**
 * A specialist country directory: all three experiences share the published
 * country list and rollout gate, not separate voting statistics or authority.
 */
export function V3VotingDnaDirectoryScreen() {
  const { platformResolved } = useSolarisApp();
  const presentation = useV3DirectoryPresentation();
  const countriesQuery = useCountries();
  const feature = useQuery({
    queryKey: ["studio2-feature", "country_voting_dna"],
    queryFn: () => isStudio2FeatureEnabled("country_voting_dna"),
    staleTime: 30_000,
  });
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const countries = countriesQuery.data ?? [];
  const regions = useMemo(
    () => countryDirectoryRegionOptions(countries, {
      participatingOnly: false,
      participatingCountryIds: NO_PARTICIPATION_FILTER,
    }),
    [countriesQuery.data],
  );
  const filtered = useMemo(
    () => filterCountryDirectory(countries, {
      search,
      region,
      participatingOnly: false,
      participatingCountryIds: NO_PARTICIPATION_FILTER,
    }),
    [countriesQuery.data, search, region],
  );
  const visible = filtered.slice(0, visibleCount);

  const selectRegion = (value: string) => {
    setRegion(value);
    setVisibleCount(PAGE_SIZE);
  };
  const updateSearch = (value: string) => {
    setSearch(value);
    setVisibleCount(PAGE_SIZE);
  };
  const reset = () => {
    setSearch("");
    selectRegion("all");
  };

  if (!platformResolved) {
    return <div data-voting-dna-directory-boot="" role="status" aria-label="Opening Voting DNA directory" className="min-h-20" />;
  }

  const header = presentation === "installed-app" ? (
    <header className="v3-directory-app-heading">
      <p className="v3-directory-eyebrow">PUBLISHED ANALYSIS</p>
      <h1>Country Voting DNA</h1>
      <p>Choose a country to explore published voting patterns, not an integrity verdict.</p>
    </header>
  ) : presentation === "mobile-web" ? (
    <header className="v3-directory-mobile-header" data-directory-mobile-header="">
      <Link to="/countries" className="v3-directory-back">Countries / Voting DNA</Link>
      <p className="v3-directory-eyebrow">VOTING PROFILES</p>
      <h1>Country Voting DNA</h1>
      <p>Find a country and explore its published jury and televote patterns.</p>
    </header>
  ) : (
    <PageHeader
      eyebrow="Published analysis"
      title="Country Voting DNA"
      description="Explore published jury relationships and jury/televote result profiles. Descriptive analysis, not an integrity verdict."
    />
  );

  const content = feature.isLoading || countriesQuery.isLoading ? (
    <ArchiveDataLoading label="Loading country voting profiles…" />
  ) : feature.isError || feature.data !== true ? (
    <Panel title="Voting DNA is not enabled yet">
      <p className="text-sm text-muted-foreground">
        The product remains behind its rollout flag during verification.
      </p>
    </Panel>
  ) : countriesQuery.isError ? (
    <ArchiveDataError />
  ) : (
    <div className="v3-voting-dna-browser">
      <div className="v3-directory-workspace">
        {presentation === "desktop-web" ? (
          <aside className="v3-directory-desktop-rail" aria-label="Filter Voting DNA by region">
            <h2>Regions</h2>
            <button type="button" aria-pressed={region === "all"} onClick={() => selectRegion("all")}>
              <span>All regions</span><span>{countries.length}</span>
            </button>
            {regions.map((item) => (
              <button key={item.name} type="button" aria-pressed={region === item.name} onClick={() => selectRegion(item.name)}>
                <span>{item.name}</span><span>{item.count}</span>
              </button>
            ))}
          </aside>
        ) : null}
        <div className="v3-directory-results">
          <div className="v3-directory-controls">
            {presentation === "installed-app" ? (
              <SolarisSearchField value={search} onChange={updateSearch} label="Search Voting DNA countries" placeholder="Search countries or regions…" />
            ) : (
              <label className="v3-directory-search">
                <Search size={18} aria-hidden="true" />
                <span className="sr-only">Search Voting DNA countries</span>
                <input type="search" aria-label="Search Voting DNA countries" value={search}
                  placeholder="Search countries or regions…" onChange={(event) => updateSearch(event.target.value)} />
              </label>
            )}
            {presentation === "mobile-web" ? (
              <label className="v3-directory-area-select">
                <span className="sr-only">Filter Voting DNA by region</span>
                <select value={region} aria-label="Filter Voting DNA by region" onChange={(event) => selectRegion(event.target.value)}>
                  <option value="all">All regions ({countries.length})</option>
                  {regions.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.count})</option>)}
                </select>
              </label>
            ) : null}
            {presentation === "installed-app" ? (
              <Sheet>
                <SheetTrigger asChild>
                  <button type="button" className="v3-directory-sheet-trigger" aria-label="Filter Voting DNA by region">
                    <SlidersHorizontal size={18} aria-hidden="true" />
                    <span>{region === "all" ? "All regions" : region}</span>
                    <span className="v3-directory-count">{filtered.length}</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" aria-label="Filter Voting DNA by region" className="max-h-[80dvh] overflow-y-auto">
                  <h2 className="mb-3 text-lg font-bold">Filter by region</h2>
                  <div className="v3-directory-sheet-options">
                    <SheetClose asChild><button type="button" aria-pressed={region === "all"} onClick={() => selectRegion("all")}>
                      All regions <span>{countries.length}</span>
                    </button></SheetClose>
                    {regions.map((item) => (
                      <SheetClose asChild key={item.name}>
                        <button type="button" aria-pressed={region === item.name} onClick={() => selectRegion(item.name)}>
                          {item.name} <span>{item.count}</span>
                        </button>
                      </SheetClose>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            ) : null}
          </div>
          <p className="v3-directory-results-count" role="status">{filtered.length} matching countries</p>
          {filtered.length ? (
            <div className={presentation === "mobile-web" ? "v3-directory-mobile-list" : "v3-voting-dna-grid"}>
              {visible.map((country) => (
                <VotingDnaCountryCard key={country.id} country={country} presentation={presentation} />
              ))}
            </div>
          ) : (
            <div className="v3-voting-dna-empty" role="status">
              <h2>No matching countries</h2>
              <p>Try a different name or region.</p>
              <button type="button" onClick={reset} className="solaris-app-empty-action">Clear filters</button>
            </div>
          )}
          {visible.length < filtered.length ? (
            <button type="button" className="v3-voting-dna-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
              Show more countries
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <AppShell>
      <div className="v3-directory-family v3-voting-dna-directory" data-directory-experience={presentation}>
        {presentation === "installed-app" ? (
          <AppScreen>{header}{content}</AppScreen>
        ) : (
          <>{header}{content}</>
        )}
      </div>
    </AppShell>
  );
}

function VotingDnaCountryCard({ country, presentation }: {
  country: Country;
  presentation: V3DirectoryPresentation;
}) {
  const detail = (
    <span className="min-w-0 flex-1">
      <strong className="v3-voting-dna-name">{country.name}</strong>
      <span className="v3-voting-dna-meta">{country.region?.trim() || "Other"} · {country.short_code}</span>
    </span>
  );

  return (
    <Link
      to="/voting-dna/$code"
      params={{ code: country.short_code }}
      className={presentation === "mobile-web"
        ? "v3-directory-mobile-row v3-voting-dna-row"
        : presentation === "desktop-web"
          ? "v3-voting-dna-card v3-voting-dna-card--desktop"
          : "v3-voting-dna-card v3-voting-dna-card--app"}
    >
      {presentation === "installed-app" ? (
        <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="md" />
      ) : (
        <FlagFrame image={country.flag_image} alt={"Flag of " + country.name} fallback={country.short_code}
          className="v3-voting-dna-flag block aspect-[3/2] shrink-0 overflow-hidden rounded-lg border border-border/70"
          imageClassName="block h-full w-full" />
      )}
      {detail}
      <ChevronRight className="v3-voting-dna-chevron shrink-0" size={18} aria-hidden="true" />
    </Link>
  );
}
