import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Globe2, Landmark, Search, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { AppShell } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  fetchWorldCountrySearchPage,
  fetchWorldOrganizationSearchPage,
  verifiedWorldSearchTerm,
  WORLD_UNIFIED_SEARCH_LIMIT,
  WORLD_UNIFIED_SEARCH_MAX_PAGE,
  worldPublicQueryVerified,
  verifiedWorldFeaturedOrganizations,
  type WorldSearchCountry,
  type WorldSearchCategory,
} from "@/lib/terra-world-unified-search";
import { fetchFeaturedWorldOrganizations, type WorldOrganization } from "@/lib/terra-world-public";

type Props = {
  term: string;
  countryPage: number;
  organizationPage: number;
  category: WorldSearchCategory;
  onSearch: (term: string) => void;
  onCategoryChange: (category: WorldSearchCategory) => void;
  onPagesChange: (countryPage: number, organizationPage: number, replace?: boolean) => void;
};

function CountryRow({ country }: { country: WorldSearchCountry }) {
  return (
    <Link
      to="/countries/$code"
      params={{ code: country.code }}
      className="group flex min-h-16 items-center gap-3 border-b border-border/70 py-3 last:border-0 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <FlagChip code={country.code} image={country.flagImage} color={country.accentColor} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground group-hover:underline">{country.name}</span>
        <span className="block text-xs text-muted-foreground">{country.region || "Terra Solaris"} · {country.code}</span>
      </span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function OrganizationRow({ organization }: { organization: WorldOrganization }) {
  return (
    <Link
      to="/world/organizations/$slug"
      params={{ slug: organization.slug }}
      search={{ tab: "overview" }}
      className="group flex min-h-16 items-center gap-3 border-b border-border/70 py-3 last:border-0 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted" aria-hidden="true">
        <Landmark className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground group-hover:underline">{organization.shortName}</span>
        <span className="block text-xs leading-5 text-muted-foreground">{organization.officialName}</span>
        {["historical", "dissolved", "suspended"].includes(organization.status) ? (
          <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
            {organization.status}
          </span>
        ) : null}
      </span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function ResultPager({
  label, page, total, onPageChange,
}: {
  label: string;
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.ceil(total / WORLD_UNIFIED_SEARCH_LIMIT);
  if (pages <= 1 || page >= pages) return null;
  return (
    <nav aria-label={label + " result pages"}
      className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <button type="button" disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
        className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
        Previous
      </button>
      <span role="status" className="text-xs tabular-nums text-muted-foreground">
        Page {page + 1} of {pages} · {page * WORLD_UNIFIED_SEARCH_LIMIT + 1}–{Math.min((page + 1) * WORLD_UNIFIED_SEARCH_LIMIT, total)} of {total}
      </span>
      <button type="button" disabled={page >= pages - 1 || page >= WORLD_UNIFIED_SEARCH_MAX_PAGE}
        onClick={() => onPageChange(page + 1)}
        className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
        Next
      </button>
    </nav>
  );
}

export function WorldUnifiedSearchPage({
  term, countryPage, organizationPage, category, onSearch, onCategoryChange, onPagesChange,
}: Props) {
  const [draft, setDraft] = useState(term);

  useEffect(() => {
    setDraft(term);
  }, [term]);

  const normalized = verifiedWorldSearchTerm(term);
  const canSearch = normalized.length >= 2;
  const showCountries = category !== "organizations";
  const showOrganizations = category !== "countries";
  // Reuse World Landing's same featured query cache; only load it while
  // browsing an empty search. This avoids another copy of the GUARD/UNITY list.
  const featured = useQuery({
    queryKey: ["world", "public", "featured"],
    queryFn: fetchFeaturedWorldOrganizations,
    enabled: !canSearch && showOrganizations,
    staleTime: 90_000,
    // Recheck publication when revisiting this result page, not just on cache expiry.
    refetchOnMount: "always",
    retry: false,
  });
  // Separate caches mean paging countries does not trigger an unnecessary
  // organization request, or vice versa. Both readers remain RLS-authorized.
  const countryQuery = useQuery({
    queryKey: ["world", "public", "country-search", normalized, countryPage],
    queryFn: ({ signal }) => fetchWorldCountrySearchPage(normalized, countryPage, signal),
    enabled: canSearch && showCountries,
    staleTime: 90_000,
    // Recheck publication when revisiting this result page, not just on cache expiry.
    refetchOnMount: "always",
    retry: false,
  });
  const organizationQuery = useQuery({
    queryKey: ["world", "public", "organization-search", normalized, organizationPage],
    queryFn: ({ signal }) => fetchWorldOrganizationSearchPage(normalized, organizationPage, signal),
    enabled: canSearch && showOrganizations,
    staleTime: 90_000,
    // Recheck publication when revisiting this result page, not just on cache expiry.
    refetchOnMount: "always",
    retry: false,
  });
  const verifiedFeatured = !canSearch && showOrganizations && worldPublicQueryVerified(featured)
    ? verifiedWorldFeaturedOrganizations(featured.data ?? [])
    : [];
  const visible = canSearch &&
    (!showCountries || worldPublicQueryVerified(countryQuery)) &&
    (!showOrganizations || worldPublicQueryVerified(organizationQuery))
    ? {
      term: normalized,
      countries: showCountries ? countryQuery.data!.countries : [],
      countryTotal: showCountries ? countryQuery.data!.countryTotal : 0,
      organizations: showOrganizations ? organizationQuery.data!.organizations : [],
      organizationTotal: showOrganizations ? organizationQuery.data!.organizationTotal : 0,
    }
    : null;

  // Recover both page positions in a single navigation when search results
  // shrink after publication changes. Never render a false zero-results page.
  useEffect(() => {
    if (!visible) return;
    const lastCountryPage = Math.max(0, Math.ceil(visible.countryTotal / WORLD_UNIFIED_SEARCH_LIMIT) - 1);
    const lastOrganizationPage = Math.max(0, Math.ceil(visible.organizationTotal / WORLD_UNIFIED_SEARCH_LIMIT) - 1);
    if (countryPage > lastCountryPage || organizationPage > lastOrganizationPage) {
      onPagesChange(
        Math.min(countryPage, lastCountryPage),
        Math.min(organizationPage, lastOrganizationPage),
        true,
      );
    }
  }, [visible, countryPage, organizationPage, onPagesChange]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = verifiedWorldSearchTerm(draft);
    if (next.length >= 2) onSearch(next);
  }

  function clear() {
    setDraft("");
    onSearch("");
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6 sm:pt-8">
        <Link to="/world" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Terra Solaris
        </Link>
        <header className="mt-5 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">World Directory</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">Search Terra Solaris</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
            Find published countries and international organizations. Private institutional records are not included.
          </p>
        </header>

        <form onSubmit={submit} role="search" className="mt-7 flex flex-col gap-3 border-y border-border py-5 sm:flex-row">
          <label htmlFor="terra-world-search-input" className="sr-only">Country or organization name</label>
          <div className="flex min-h-12 flex-1 items-center gap-3 rounded-xl border border-border bg-background px-4 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              id="terra-world-search-input"
              type="search"
              value={draft}
              maxLength={64}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Country, region, GUARD, UNITY…"
              autoComplete="off"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {draft ? (
              <button type="button" onClick={clear} aria-label="Clear World search"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
          <button type="submit" disabled={verifiedWorldSearchTerm(draft).length < 2}
            className="min-h-12 rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Search
          </button>
        </form>

        <nav className="mt-4 flex flex-wrap gap-2" aria-label="World search categories">
          {([
            ["all", "All results"],
            ["countries", "Countries"],
            ["organizations", "Organizations"],
          ] as const).map(([value, label]) => (
            <button type="button" key={value}
              aria-pressed={category === value}
              onClick={() => onCategoryChange(value)}
              className={category === value
                ? "min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
                : "min-h-11 rounded-full border border-border px-5 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"}>
              {label}
            </button>
          ))}
        </nav>

        {!canSearch ? (
          <section className="py-10">
            <h2 className="text-xl font-semibold">Explore the world</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Enter at least two characters, or browse the directories below.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link to="/countries" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold">
                <Globe2 className="size-4" aria-hidden="true" /> Countries
              </Link>
              <Link to="/world/organizations" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold">
                <Landmark className="size-4" aria-hidden="true" /> Organizations
              </Link>
            </div>
            {showOrganizations ? <section className="mt-10 border-t border-border pt-7" aria-labelledby="world-search-featured">
              <h3 id="world-search-featured" className="text-lg font-semibold">Featured institutions</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Official GUARD and UNITY profiles, where published.
              </p>
              {featured.isError || featured.isRefetchError ? (
                <div role="alert" className="py-5 text-sm text-muted-foreground">
                  Featured institutions could not be verified.
                  <button type="button" onClick={() => void featured.refetch()}
                    className="ml-3 min-h-11 font-semibold text-primary">
                    Retry
                  </button>
                </div>
              ) : featured.isPending || featured.isFetching ? (
                <p role="status" className="py-5 text-sm text-muted-foreground">Verifying public institutions…</p>
              ) : verifiedFeatured.length ? (
                <div className="mt-3 divide-y divide-border">
                  {verifiedFeatured.map((organization) =>
                    <OrganizationRow key={organization.id} organization={organization} />)}
                </div>
              ) : (
                <p className="py-5 text-sm text-muted-foreground">
                  No featured public institutions are available.
                </p>
              )}
            </section> : null}
          </section>
        ) : null}

        {canSearch && ((showCountries && (countryQuery.isPending || countryQuery.isFetching)) ||
          (showOrganizations && (organizationQuery.isPending || organizationQuery.isFetching))) &&
          !(showCountries && (countryQuery.isError || countryQuery.isRefetchError)) &&
          !(showOrganizations && (organizationQuery.isError || organizationQuery.isRefetchError)) ? (
          <p role="status" aria-live="polite" className="py-8 text-sm text-muted-foreground">
            Searching published World records…
          </p>
        ) : null}
        {canSearch && ((showCountries && (countryQuery.isError || countryQuery.isRefetchError)) ||
          (showOrganizations && (organizationQuery.isError || organizationQuery.isRefetchError))) ? (
          <div role="alert" className="mt-8 border-y border-border py-6">
            <h2 className="text-lg font-semibold">World search is unavailable</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Official results could not be verified. No cached or assumed results are being shown.
            </p>
            <button type="button" onClick={() => {
              if (showCountries && (countryQuery.isError || countryQuery.isRefetchError)) void countryQuery.refetch();
              if (showOrganizations && (organizationQuery.isError || organizationQuery.isRefetchError)) void organizationQuery.refetch();
            }}
              className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
              Try again
            </button>
          </div>
        ) : null}

        {visible ? (
          <div aria-live="polite" className="mt-7">
            <p className="text-sm text-muted-foreground">
              Search results for <strong className="text-foreground">{visible.term}</strong>
            </p>

            {showCountries ? <section className="mt-7" aria-labelledby="world-search-countries">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                <h2 id="world-search-countries" className="text-xl font-semibold">
                  Countries <span className="text-sm font-normal text-muted-foreground">({visible.countryTotal})</span>
                </h2>
                <Link to="/countries" className="text-sm font-semibold text-primary">Browse countries</Link>
              </div>
              {visible.countries.length ? (
                <div>{visible.countries.map((item) => <CountryRow key={item.id} country={item} />)}</div>
              ) : countryPage > 0 && visible.countryTotal > 0 ? (
                <p role="status" className="py-5 text-sm text-muted-foreground">Updating country results…</p>
              ) : (
                <p className="py-5 text-sm text-muted-foreground">No matching countries.</p>
              )}
              <ResultPager label="Country" page={countryPage} total={visible.countryTotal}
                onPageChange={(next) => onPagesChange(next, organizationPage)} />
            </section> : null}

            {showOrganizations ? <section className="mt-9" aria-labelledby="world-search-organizations">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
                <h2 id="world-search-organizations" className="text-xl font-semibold">
                  Organizations <span className="text-sm font-normal text-muted-foreground">({visible.organizationTotal})</span>
                </h2>
                <Link to="/world/organizations" className="text-sm font-semibold text-primary">Browse organizations</Link>
              </div>
              {visible.organizations.length ? (
                <div>{visible.organizations.map((item) => <OrganizationRow key={item.id} organization={item} />)}</div>
              ) : organizationPage > 0 && visible.organizationTotal > 0 ? (
                <p role="status" className="py-5 text-sm text-muted-foreground">Updating organization results…</p>
              ) : (
                <p className="py-5 text-sm text-muted-foreground">No matching organizations.</p>
              )}
              <ResultPager label="Organization" page={organizationPage} total={visible.organizationTotal}
                onPageChange={(next) => onPagesChange(countryPage, next)} />
            </section> : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
