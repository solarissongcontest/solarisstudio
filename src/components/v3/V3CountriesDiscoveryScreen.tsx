import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  AppEmptyState,
  AppSectionHeader,
} from "@/components/app/AppPrimitives";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { ArchiveDataError, ArchiveDataLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { FlagFrame } from "@/components/FlagMedia";
import type { CountryDirectoryPresentation } from "@/lib/country-directory-presentation";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { type Country, useCountries, useEditions } from "@/lib/data";
import { countryDirectoryRegionOptions, effectiveParticipatingScope, filterCountryDirectory } from "@/lib/v3-country-directory-filters";
import { publishedCountryStatusMap, type PublishedCountryStatus } from "@/lib/v3-country-published-status";
import { directoryCountLabel } from "@/lib/v3-directory-count";
import { usePublicEditionParticipants } from "@/lib/public-participants";
import {
  buildCountryDiscovery,
  resolveActivePublicEdition,
} from "@/lib/v3-discovery-entities";
import "@/styles/v3-countries-discovery.css";

const BROWSE_PAGE_SIZE = 24;

export function V3CountriesDiscoveryScreen({
  presentation = "installed-app",
}: {
  presentation?: CountryDirectoryPresentation;
}) {
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();
  const activeEdition = useMemo(
    () => resolveActivePublicEdition(editionsQuery.data ?? []),
    [editionsQuery.data],
  );
  const participantsQuery = usePublicEditionParticipants(activeEdition?.id);
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
  const [participatingOnly, setParticipatingOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(BROWSE_PAGE_SIZE);

  const discovery = useMemo(
    () =>
      buildCountryDiscovery({
        countries: countriesQuery.data ?? [],
        editions: editionsQuery.data ?? [],
        currentParticipants: participantsQuery.data ?? [],
      }),
    [countriesQuery.data, editionsQuery.data, participantsQuery.data],
  );

  const participatingCountryIds = useMemo(
    () => new Set(discovery.participating.map((country) => country.id)),
    [discovery.participating],
  );
  const pendingCurrentParticipants = Boolean(activeEdition?.id) && participantsQuery.isLoading;
  const currentLineupReady = Boolean(activeEdition?.id) && participantsQuery.isSuccess;
  // An unavailable optional lineup must never strand the visitor on its selected scope.
  const selectedParticipatingOnly = effectiveParticipatingScope(participatingOnly, currentLineupReady);
  const publishedStatuses = useMemo(
    () => publishedCountryStatusMap(discovery, currentLineupReady),
    [discovery, currentLineupReady],
  );
  useEffect(() => {
    if (participatingOnly && participantsQuery.isError) setParticipatingOnly(false);
  }, [participatingOnly, participantsQuery.isError]);
  const regionOptions = useMemo(
    () => countryDirectoryRegionOptions(countriesQuery.data ?? [], {
      participatingOnly: selectedParticipatingOnly,
      participatingCountryIds,
    }),
    [countriesQuery.data, selectedParticipatingOnly, participatingCountryIds],
  );
  const collectionCount = selectedParticipatingOnly
    ? discovery.participating.length
    : countriesQuery.data?.length ?? 0;
  const filtered = useMemo(
    () =>
      filterCountryDirectory(countriesQuery.data ?? [], {
        search,
        region,
        participatingOnly: selectedParticipatingOnly,
        participatingCountryIds,
      }),
    [countriesQuery.data, region, search, selectedParticipatingOnly, participatingCountryIds],
  );

  // All-country browsing remains available even if the optional lineup is loading or fails.
  if (countriesQuery.isLoading) {
    return <ArchiveDataLoading label="Loading country discovery…" />;
  }
  if (countriesQuery.isError) {
    return <ArchiveDataError />;
  }

  // The active contest is a small, finite lineup: show every published participant.
  // Keep progressive loading only for the larger all-country archive.
  const visible = selectedParticipatingOnly ? filtered : filtered.slice(0, visibleCount);
  const movementGroups = [
    { label: "Debuting", countries: discovery.debuting },
    { label: "Withdrawn", countries: discovery.withdrawn },
    { label: "Disqualified", countries: discovery.disqualified },
  ].filter((group) => group.countries.length > 0);

  return (
    <div className="v3-countries-discovery space-y-6" data-country-directory-experience={presentation}>
      {presentation !== "installed-app" ? (
        <h2 id="countries-page-title" className="sr-only">Browse all countries</h2>
      ) : (
      <header className="v3-countries-intro">
        <p className="v3-countries-kicker">
          {discovery.currentEdition
            ? `SSC ${discovery.currentEdition.edition_number ?? "current"} · CURRENT EDITION`
            : "TERRA SOLARIS · COUNTRY ARCHIVE"}
        </p>
        <h2 id="countries-page-title" className="v3-countries-title">
          {presentation === "installed-app" ? "Countries" : "Country explorer"}
        </h2>
        <p className="v3-countries-lead">
          {discovery.currentEdition
            ? `Browse the current SSC ${discovery.currentEdition.edition_number ?? ""} lineup or discover all Terra Solaris countries.`
            : "Discover the countries of Terra Solaris, their regions and their histories."}
        </p>
      </header>
      )}

      <section
        id="countries-browse-all"
        aria-labelledby="countries-page-title"
        className="v3-countries-browser scroll-mt-24"
      >
        {discovery.currentEdition ? (
          <div className="v3-countries-collections grid grid-cols-2 gap-2" role="group" aria-label="Country collections">
            <button
              type="button"
              aria-pressed={selectedParticipatingOnly}
              aria-label={currentLineupReady
                ? `SSC ${discovery.currentEdition.edition_number ?? "current"}: ${discovery.participating.length} participating countries`
                : `SSC ${discovery.currentEdition.edition_number ?? "current"} lineup ${pendingCurrentParticipants ? "loading" : "unavailable"}`}
              disabled={!currentLineupReady}
              onClick={() => {
                setParticipatingOnly(true);
                setRegion("all");
                setVisibleCount(BROWSE_PAGE_SIZE);
              }}
              className={`v3-countries-scope-button min-w-0 rounded-xl border font-semibold transition-colors ${selectedParticipatingOnly ? "is-selected" : ""}`}
            >
              {selectedParticipatingOnly ? <Check size={16} aria-hidden="true" /> : null}
              <span>SSC {discovery.currentEdition.edition_number ?? "current"} · {currentLineupReady ? discovery.participating.length : pendingCurrentParticipants ? "Loading…" : "Unavailable"}</span>
            </button>
            <button
              type="button"
              aria-pressed={!selectedParticipatingOnly}
              aria-label={`All ${countriesQuery.data?.length ?? 0} countries`}
              onClick={() => {
                setParticipatingOnly(false);
                setRegion("all");
                setVisibleCount(BROWSE_PAGE_SIZE);
              }}
              className={`v3-countries-scope-button min-w-0 rounded-xl border font-semibold transition-colors ${!selectedParticipatingOnly ? "is-selected" : ""}`}
            >
              {!selectedParticipatingOnly ? <Check size={16} aria-hidden="true" /> : null}
              <span>All countries · {countriesQuery.data?.length ?? 0}</span>
            </button>
          </div>
        ) : null}
        {activeEdition && participantsQuery.isError ? (
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground" role="status">
            <span>Current-edition lineup unavailable. You can still browse all countries.</span>
            <button type="button" className="min-h-11 rounded-lg border border-border px-3 font-semibold text-foreground"
              onClick={() => void participantsQuery.refetch()}>Retry lineup</button>
          </div>
        ) : null}
        <div className={presentation === "desktop-web" ? "v3-countries-workspace v3-countries-workspace--desktop" : "v3-countries-workspace"}>
          {presentation === "desktop-web" ? (
            <aside className="v3-countries-region-rail" aria-label="Browse by region">
              <h3>Regions</h3>
              <button type="button" aria-pressed={region === "all"}
                className={region === "all" ? "is-selected" : undefined}
                onClick={() => { setRegion("all"); setVisibleCount(BROWSE_PAGE_SIZE); }}>
                <span>All regions</span><span>{collectionCount}</span>
              </button>
              {regionOptions.map((item) => (
                <button key={item.name} type="button" aria-pressed={region === item.name}
                  className={region === item.name ? "is-selected" : undefined}
                  onClick={() => { setRegion(item.name); setVisibleCount(BROWSE_PAGE_SIZE); }}>
                  <span>{item.name}</span><span>{item.count}</span>
                </button>
              ))}
            </aside>
          ) : null}
          <div className="v3-countries-list-pane">
        <div className="v3-countries-controls solaris-app-directory-tools">
          <SolarisSearchField
            value={search}
            onChange={(value) => {
              setSearch(value);
              setVisibleCount(BROWSE_PAGE_SIZE);
            }}
            label="Search countries"
            className={presentation === "installed-app" ? undefined : "v3-countries-web-search"}
            placeholder="Search countries…"
          />
          <div className="solaris-app-directory-filterbar">
            {presentation === "installed-app" ? (
            <Sheet>
              <SheetTrigger asChild>
                <button type="button" className="solaris-app-filter-chip">
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  <span>{region === "all" ? "All regions" : region}</span>
                </button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                aria-label="Filter countries by region"
                className="solaris-app-filter-sheet"
              >
                <div className="solaris-app-filter-sheet-heading">
                  <p>Countries</p>
                  <h2>Filter by region</h2>
                </div>
                <div className="mt-3">
                  {["all", ...regionOptions.map((item) => item.name)].map((item) => {
                    const active = region === item;
                    return (
                      <SheetClose key={item} asChild>
                        <button
                          type="button"
                          onClick={() => {
                            setRegion(item);
                            setVisibleCount(BROWSE_PAGE_SIZE);
                          }}
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
            ) : presentation === "mobile-web" ? (
              <label className="v3-countries-web-region">
                <span className="sr-only">Filter by region</span>
                <select aria-label="Filter by region" value={region}
                  onChange={(event) => { setRegion(event.target.value); setVisibleCount(BROWSE_PAGE_SIZE); }}>
                  <option value="all">All regions</option>
                  {regionOptions.map((item) => (
                    <option key={item.name} value={item.name}>{item.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <span className="solaris-app-directory-count" aria-live="polite" role="status">
              {directoryCountLabel({ available: collectionCount, matches: filtered.length, rendered: visible.length, noun: "countries" })}
            </span>
          </div>
        </div>

        <div
          className={presentation === "installed-app"
            ? "v3-countries-grid grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4"
            : presentation === "mobile-web"
              ? "v3-countries-web-list"
              : "v3-countries-desktop-grid grid grid-cols-2 gap-4 xl:grid-cols-3"}
          aria-label="Countries"
        >
          {visible.map((country) => (
            <CountryTile key={country.id} country={country} presentation={presentation}
              status={selectedParticipatingOnly ? undefined : publishedStatuses.get(country.id)} />
          ))}
        </div>

        {!filtered.length ? (
          <AppEmptyState
            className="my-3"
            title="No countries found"
            description="No country matches the current search and region filters."
            action={
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setRegion("all");
                  setParticipatingOnly(false);
                  setVisibleCount(BROWSE_PAGE_SIZE);
                }}
                className="solaris-app-empty-action"
              >
                Clear filters
              </button>
            }
          />
        ) : null}

        {visible.length < filtered.length ? (
          <button
            type="button"
            onClick={() => setVisibleCount((count) => count + BROWSE_PAGE_SIZE)}
            className="mt-3 min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
          >
            Show more · {filtered.length - visible.length} remaining
          </button>
        ) : null}
          </div>
        </div>
      </section>


      {movementGroups.length > 0 ? (
        <section className="v3-countries-secondary" aria-labelledby="countries-current-movement">
          <AppSectionHeader
            eyebrow="Current movement"
            title="What changed this edition"
            id="countries-current-movement"
          />
          <div className="space-y-4">
            {movementGroups.map((group) => (
              <div key={group.label}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold">{group.label}</h3>
                  <span className="text-xs text-muted-foreground">{group.countries.length}</span>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {group.countries.map((country) => (
                    <Link
                      key={country.id}
                      to="/countries/$code"
                      params={{ code: country.short_code }}
                      className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
                    >
                      <FlagChip
                        code={country.short_code}
                        color={country.accent_color}
                        image={country.flag_image}
                        size="sm"
                      />
                      {country.name}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}


      {presentation === "installed-app" && regionOptions.length > 0 ? (
        <section className="v3-countries-secondary" aria-labelledby="countries-regions">
          <AppSectionHeader
            eyebrow="Explore by region"
            title="Terra Solaris"
            id="countries-regions"
          />
          <div className="v3-countries-regions grid grid-cols-2 gap-3 sm:grid-cols-3">
            {regionOptions.map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => {
                  setRegion(item.name);
                  setVisibleCount(BROWSE_PAGE_SIZE);
                  document.getElementById("countries-browse-all")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="min-h-16 rounded-2xl border border-border bg-surface px-4 py-3 text-left"
              >
                <span className="block text-sm font-semibold">{item.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {item.count} countr{item.count === 1 ? "y" : "ies"}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

    </div>
  );
}

function CountryTile({
  country,
  presentation,
  status,
}: {
  country: Country;
  presentation: CountryDirectoryPresentation;
  status?: PublishedCountryStatus;
}) {
  if (presentation === "mobile-web") {
    return (
      <Link to="/countries/$code" params={{ code: country.short_code }}
        className="v3-country-web-row group flex min-h-[86px] min-w-0 items-center gap-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <FlagFrame image={country.flag_image} alt={`Flag of ${country.name}`}
          fallback={country.short_code} className="block aspect-[3/2] w-[82px] shrink-0 overflow-hidden rounded-lg border border-border/70"
          imageClassName="block h-full w-full" />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-base font-semibold leading-5">{country.name}</span>
          {country.native_name && country.native_name !== country.name ? (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{country.native_name}</span>
          ) : null}
          <span className="mt-1 block truncate text-xs text-muted-foreground">{country.region || country.short_code}</span>
          {status ? <CountryStatusNote status={status} /> : null}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    );
  }

  if (presentation === "desktop-web") {
    return (
      <Link to="/countries/$code" params={{ code: country.short_code }}
        className="v3-country-desktop-item group min-w-0 rounded-xl p-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <FlagFrame image={country.flag_image} alt={`Flag of ${country.name}`}
          fallback={country.short_code} className="block aspect-[3/2] w-full overflow-hidden rounded-lg border border-border/70"
          imageClassName="block h-full w-full" />
        <span className="mt-3 flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block break-words text-sm font-bold leading-5">{country.name}</span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">{country.region || country.short_code}</span>
            {status ? <CountryStatusNote status={status} /> : null}
          </span>
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </Link>
    );
  }

  return (
    <Link to="/countries/$code" params={{ code: country.short_code }}
      className="group relative flex min-h-[116px] min-w-0 flex-col justify-between gap-3 rounded-2xl border border-border/70 bg-surface/65 p-3 transition-colors hover:border-primary/40 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <FlagChip code={country.short_code} color={country.accent_color} image={country.flag_image} size="md" />
      <span className="block min-w-0 pr-3">
        <span className="block break-words text-sm font-semibold leading-5">{country.name}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{country.region || country.short_code}</span>
        {status ? <CountryStatusNote status={status} /> : null}
      </span>
      <ChevronRight className="absolute bottom-4 right-2.5 size-4 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

const PUBLISHED_STATUS_LABELS: Record<PublishedCountryStatus, string> = {
  participating: "Participating",
  withdrawn: "Withdrawn",
  disqualified: "Disqualified",
};

function CountryStatusNote({ status }: { status: PublishedCountryStatus }) {
  return (
    <span data-country-current-status={status} className="mt-1 block text-xs font-medium text-muted-foreground">
      Current edition · {PUBLISHED_STATUS_LABELS[status]}
    </span>
  );
}
