import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AppEmptyState,
  AppGroupedList,
  AppSectionHeader,
} from "@/components/app/AppPrimitives";
import { SolarisSearchField } from "@/components/app/SolarisSearchField";
import { ArchiveDataError, ArchiveDataLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useCountries, useEditions } from "@/lib/data";
import { usePublicEditionParticipants } from "@/lib/public-participants";
import {
  buildCountryDiscovery,
  resolveActivePublicEdition,
} from "@/lib/v3-discovery-entities";

const BROWSE_PAGE_SIZE = 24;

export function V3CountriesDiscoveryScreen() {
  const countriesQuery = useCountries();
  const editionsQuery = useEditions();
  const activeEdition = useMemo(
    () => resolveActivePublicEdition(editionsQuery.data ?? []),
    [editionsQuery.data],
  );
  const participantsQuery = usePublicEditionParticipants(activeEdition?.id);
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("all");
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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...(countriesQuery.data ?? [])]
      .filter((country) => region === "all" || country.region === region)
      .filter(
        (country) =>
          !query ||
          country.name.toLowerCase().includes(query) ||
          country.short_code.toLowerCase().includes(query) ||
          (country.native_name ?? "").toLowerCase().includes(query),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [countriesQuery.data, region, search]);

  const pendingCurrentParticipants = Boolean(activeEdition?.id) && participantsQuery.isLoading;
  if (countriesQuery.isLoading || editionsQuery.isLoading || pendingCurrentParticipants) {
    return <ArchiveDataLoading label="Loading country discovery…" />;
  }
  if (countriesQuery.isError || editionsQuery.isError || participantsQuery.isError) {
    return <ArchiveDataError />;
  }

  const visible = filtered.slice(0, visibleCount);
  const movementGroups = [
    { label: "Debuting", countries: discovery.debuting },
    { label: "Withdrawn", countries: discovery.withdrawn },
    { label: "Disqualified", countries: discovery.disqualified },
  ].filter((group) => group.countries.length > 0);

  return (
    <div className="space-y-7">
      <section aria-labelledby="countries-current-edition">
        <AppSectionHeader
          eyebrow={discovery.currentEdition ? "Current edition" : "Between editions"}
          title={
            discovery.currentEdition
              ? discovery.currentEdition.edition_number == null
                ? discovery.currentEdition.name
                : `SSC ${discovery.currentEdition.edition_number}`
              : "Solaris countries"
          }
          id="countries-current-edition"
        />

        {discovery.currentEdition ? (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {discovery.participating.length} published delegation{discovery.participating.length === 1 ? "" : "s"} currently participating.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {discovery.participating.slice(0, 9).map((country) => (
                <CountryTile key={country.id} country={country} />
              ))}
            </div>
            {discovery.participating.length > 9 ? (
              <a href="#countries-browse-all" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary">
                Browse all participating countries →
              </a>
            ) : null}
          </div>
        ) : (
          <AppEmptyState
            title="No active edition"
            description="Browse the country archive while Solaris is between active editions."
            action={
              <Link to="/editions" className="solaris-app-empty-action">
                Browse editions
              </Link>
            }
          />
        )}
      </section>

      {movementGroups.length > 0 ? (
        <section aria-labelledby="countries-current-movement">
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
                <div className="flex gap-2 overflow-x-auto pb-1">
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

      {discovery.regions.length > 0 ? (
        <section aria-labelledby="countries-regions">
          <AppSectionHeader
            eyebrow="Explore by region"
            title="Terra Solaris"
            id="countries-regions"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {discovery.regions.map((item) => (
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
                  {item.countries.length} countr{item.countries.length === 1 ? "y" : "ies"}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section id="countries-browse-all" aria-labelledby="countries-browse-title" className="scroll-mt-24">
        <AppSectionHeader
          eyebrow="Browse all"
          title="Country directory"
          id="countries-browse-title"
        />

        <div className="solaris-app-directory-tools">
          <SolarisSearchField
            value={search}
            onChange={(value) => {
              setSearch(value);
              setVisibleCount(BROWSE_PAGE_SIZE);
            }}
            label="Search countries"
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
                aria-label="Filter countries by region"
                className="solaris-app-filter-sheet"
              >
                <div className="solaris-app-filter-sheet-heading">
                  <p>Countries</p>
                  <h2>Filter by region</h2>
                </div>
                <div className="mt-3">
                  {["all", ...discovery.regions.map((item) => item.name)].map((item) => {
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
            <span className="solaris-app-directory-count">{filtered.length} countries</span>
          </div>
        </div>

        <AppGroupedList>
          {visible.map((country) => (
            <Link
              key={country.id}
              to="/countries/$code"
              params={{ code: country.short_code }}
              className="solaris-app-country-row"
            >
              <FlagChip
                code={country.short_code}
                color={country.accent_color}
                image={country.flag_image}
                size="md"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{country.name}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {country.short_code} · {country.region || "Terra Solaris"}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </AppGroupedList>

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
      </section>
    </div>
  );
}

function CountryTile({ country }: { country: NonNullable<ReturnType<typeof buildCountryDiscovery>["participating"]>[number] }) {
  return (
    <Link
      to="/countries/$code"
      params={{ code: country.short_code }}
      className="min-w-0 rounded-2xl border border-border bg-surface p-3"
    >
      <FlagChip
        code={country.short_code}
        color={country.accent_color}
        image={country.flag_image}
        size="md"
      />
      <span className="mt-2 block truncate text-sm font-semibold">{country.name}</span>
      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{country.region || country.short_code}</span>
    </Link>
  );
}
