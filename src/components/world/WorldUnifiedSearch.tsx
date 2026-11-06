import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Globe2, Landmark, Search, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

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

function WorldRow({ country, organization }: { country?: WorldSearchCountry; organization?: WorldOrganization }) {
  if (!country && !organization) return null;
  const label = country?.name ?? organization!.shortName;
  const subtitle = country
    ? (country.region || "Terra Solaris") + " · " + country.code
    : organization!.officialName;
  const identity = (
    <>
      {country ? (
        <FlagChip code={country.code} image={country.flagImage} color={country.accentColor} size="md" />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted" aria-hidden="true">
          <Landmark className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold group-hover:underline">{label}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
        {organization && ["historical", "dissolved", "suspended"].includes(organization.status) ? (
          <span className="mt-1 block text-xs capitalize text-muted-foreground">{organization.status}</span>
        ) : null}
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );
  const className = "group flex min-h-16 items-center gap-3 border-b border-border py-3 last:border-0 focus-visible:rounded-lg focus-visible:outline-2";
  return country ? (
    <Link to="/countries/$code" params={{ code: country.code }} className={className}>{identity}</Link>
  ) : (
    <Link to="/world/organizations/$slug" params={{ slug: organization!.slug }}
      search={{ tab: "overview" }} className={className}>{identity}</Link>
  );
}

function ResultPager({ label, page, total, onPageChange }: {
  label: string; page: number; total: number; onPageChange: (page: number) => void;
}) {
  const pages = Math.ceil(total / WORLD_UNIFIED_SEARCH_LIMIT);
  if (pages <= 1 || page >= pages) return null;
  return (
    <nav aria-label={label + " result pages"} className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <button type="button" disabled={page === 0} onClick={() => onPageChange(page - 1)}
        className="min-h-11 rounded-xl border px-4 text-sm disabled:opacity-40">Previous</button>
      <span role="status" className="text-xs tabular-nums text-muted-foreground">
        Page {page + 1} of {pages} · {page * WORLD_UNIFIED_SEARCH_LIMIT + 1}–{Math.min((page + 1) * WORLD_UNIFIED_SEARCH_LIMIT, total)} of {total}
      </span>
      <button type="button" disabled={page >= pages - 1 || page >= WORLD_UNIFIED_SEARCH_MAX_PAGE}
        onClick={() => onPageChange(page + 1)}
        className="min-h-11 rounded-xl border px-4 text-sm disabled:opacity-40">Next</button>
    </nav>
  );
}

function ResultSection({ id, title, count, browse, page, onPageChange, children }: {
  id: string; title: string; count: number; browse: string;
  page: number; onPageChange: (page: number) => void; children: ReactNode;
}) {
  return (
    <section className="mt-8" aria-labelledby={id}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <h2 id={id} className="text-xl font-semibold">{title} <span className="text-sm font-normal text-muted-foreground">({count})</span></h2>
        {title === "Countries" ? (
          <Link to="/countries" className="text-sm font-semibold text-primary">Browse countries</Link>
        ) : (
          <Link to="/world/organizations" className="text-sm font-semibold text-primary">Browse organizations</Link>
        )}
      </div>
      {children}
      <ResultPager label={title === "Countries" ? "Country" : "Organization"}
        total={count} page={page} onPageChange={onPageChange} />
    </section>
  );
}

export function WorldUnifiedSearchPage({
  term, countryPage, organizationPage, category, onSearch, onCategoryChange, onPagesChange,
}: Props) {
  const [draft, setDraft] = useState(term);
  useEffect(() => setDraft(term), [term]);
  const normalized = verifiedWorldSearchTerm(term);
  const canSearch = normalized.length >= 2;
  const showCountries = category !== "organizations";
  const showOrganizations = category !== "countries";

  const featured = useQuery({
    queryKey: ["world", "public", "featured"],
    queryFn: fetchFeaturedWorldOrganizations,
    enabled: !canSearch && showOrganizations,
    staleTime: 90_000,
    refetchOnMount: "always",
    retry: false,
  });
  const countryQuery = useQuery({
    queryKey: ["world", "public", "country-search", normalized, countryPage],
    queryFn: () => fetchWorldCountrySearchPage(normalized, countryPage),
    enabled: canSearch && showCountries,
    staleTime: 90_000,
    refetchOnMount: "always",
    retry: false,
  });
  const organizationQuery = useQuery({
    queryKey: ["world", "public", "organization-search", normalized, organizationPage],
    queryFn: () => fetchWorldOrganizationSearchPage(normalized, organizationPage),
    enabled: canSearch && showOrganizations,
    staleTime: 90_000,
    refetchOnMount: "always",
    retry: false,
  });
  const verifiedFeatured = !canSearch && showOrganizations && worldPublicQueryVerified(featured)
    ? verifiedWorldFeaturedOrganizations(featured.data ?? []) : [];
  const visible = canSearch &&
    (!showCountries || worldPublicQueryVerified(countryQuery)) &&
    (!showOrganizations || worldPublicQueryVerified(organizationQuery))
    ? {
      countries: showCountries ? countryQuery.data!.countries : [],
      countryTotal: showCountries ? countryQuery.data!.countryTotal : 0,
      organizations: showOrganizations ? organizationQuery.data!.organizations : [],
      organizationTotal: showOrganizations ? organizationQuery.data!.organizationTotal : 0,
    } : null;

  useEffect(() => {
    if (!visible) return;
    const c = Math.max(0, Math.ceil(visible.countryTotal / WORLD_UNIFIED_SEARCH_LIMIT) - 1);
    const o = Math.max(0, Math.ceil(visible.organizationTotal / WORLD_UNIFIED_SEARCH_LIMIT) - 1);
    if (countryPage > c || organizationPage > o) {
      onPagesChange(Math.min(countryPage, c), Math.min(organizationPage, o), true);
    }
  }, [visible, countryPage, organizationPage, onPagesChange]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = verifiedWorldSearchTerm(draft);
    if (next.length >= 2) onSearch(next);
  }

  const failed = canSearch && (
    (showCountries && (countryQuery.isError || countryQuery.isRefetchError)) ||
    (showOrganizations && (organizationQuery.isError || organizationQuery.isRefetchError))
  );
  const searching = canSearch && (
    (showCountries && (countryQuery.isPending || countryQuery.isFetching)) ||
    (showOrganizations && (organizationQuery.isPending || organizationQuery.isFetching))
  );

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 sm:px-6">
        <Link to="/world" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Terra Solaris
        </Link>
        <header className="mt-5 max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">World Directory</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">Search Terra Solaris</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Search published countries and international organizations.
          </p>
        </header>
        <form onSubmit={submit} role="search" className="mt-6 flex flex-wrap gap-3 border-y py-5">
          <label htmlFor="terra-world-search-input" className="sr-only">Country or organization name</label>
          <span className="flex min-h-12 min-w-56 flex-1 items-center gap-3 rounded-xl border px-4 focus-within:ring-2">
            <Search className="size-4" aria-hidden="true" />
            <input id="terra-world-search-input" type="search" value={draft} maxLength={64}
              onChange={(event) => setDraft(event.target.value)} autoComplete="off"
              placeholder="Country, region, GUARD, UNITY…"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" />
            {draft ? <button type="button" aria-label="Clear World search"
              onClick={() => { setDraft(""); onSearch(""); }} className="flex size-11 items-center justify-center">
              <X className="size-4" aria-hidden="true" />
            </button> : null}
          </span>
          <button type="submit" disabled={verifiedWorldSearchTerm(draft).length < 2}
            className="min-h-12 rounded-xl bg-primary px-5 font-semibold text-primary-foreground disabled:opacity-40">Search</button>
        </form>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="World search categories">
          {([["all", "All results"], ["countries", "Countries"], ["organizations", "Organizations"]] as const)
            .map(([value, label]) => (
              <button key={value} type="button" aria-pressed={category === value}
                onClick={() => onCategoryChange(value)}
                className={category === value
                  ? "min-h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
                  : "min-h-11 rounded-full border px-5 text-sm font-semibold"}>{label}</button>
            ))}
        </nav>

        {!canSearch ? (
          <section className="py-8">
            <h2 className="text-xl font-semibold">Explore the world</h2>
            <p className="mt-2 text-sm text-muted-foreground">Enter at least two characters, or browse the directories below.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link to="/countries" className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4">
                <Globe2 className="size-4" aria-hidden="true" /> Countries
              </Link>
              <Link to="/world/organizations" className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4">
                <Landmark className="size-4" aria-hidden="true" /> Organizations
              </Link>
            </div>
            {showOrganizations ? (
              <section className="mt-8 border-t pt-6" aria-labelledby="world-search-featured">
                <h3 id="world-search-featured" className="text-lg font-semibold">Featured institutions</h3>
                <p className="mt-2 text-sm text-muted-foreground">Official GUARD and UNITY profiles, where published.</p>
                {featured.isError || featured.isRefetchError ? (
                  <div role="alert" className="mt-4 text-sm">
                    Featured institutions could not be verified.
                    <button type="button" className="ml-3 min-h-11 text-primary"
                      onClick={() => void featured.refetch()}>Retry</button>
                  </div>
                ) : featured.isPending || featured.isFetching ? (
                  <p role="status" className="py-5 text-sm">Verifying public institutions…</p>
                ) : verifiedFeatured.length ? (
                  <div className="mt-3">{verifiedFeatured.map((item) =>
                    <WorldRow key={item.id} organization={item} />)}</div>
                ) : (
                  <p className="py-5 text-sm text-muted-foreground">No featured public institutions are available.</p>
                )}
              </section>
            ) : null}
          </section>
        ) : null}

        {searching && !failed ? <p role="status" aria-live="polite" className="py-8 text-sm">
          Searching published World records…
        </p> : null}
        {failed ? (
          <div role="alert" className="mt-8 border-y py-6">
            <h2 className="text-lg font-semibold">World search is unavailable</h2>
            <p className="mt-2 text-sm">Official results could not be verified. No cached results are shown.</p>
            <button type="button" className="mt-3 min-h-11 font-semibold text-primary" onClick={() => {
              if (showCountries && (countryQuery.isError || countryQuery.isRefetchError)) void countryQuery.refetch();
              if (showOrganizations && (organizationQuery.isError || organizationQuery.isRefetchError)) void organizationQuery.refetch();
            }}>Try again</button>
          </div>
        ) : null}
        {visible ? (
          <div aria-live="polite" className="mt-6">
            <p className="text-sm text-muted-foreground">Search results for <strong>{normalized}</strong></p>
            {showCountries ? <ResultSection id="world-search-countries" title="Countries"
              count={visible.countryTotal} browse="/countries" page={countryPage}
              onPageChange={(next) => onPagesChange(next, organizationPage)}>
              {visible.countries.length ? visible.countries.map((item) =>
                <WorldRow key={item.id} country={item} />) : (
                <p className="py-5 text-sm text-muted-foreground">
                  {countryPage > 0 && visible.countryTotal > 0 ? "Updating country results…" : "No matching countries."}
                </p>
              )}
            </ResultSection> : null}
            {showOrganizations ? <ResultSection id="world-search-organizations" title="Organizations"
              count={visible.organizationTotal} browse="/world/organizations" page={organizationPage}
              onPageChange={(next) => onPagesChange(countryPage, next)}>
              {visible.organizations.length ? visible.organizations.map((item) =>
                <WorldRow key={item.id} organization={item} />) : (
                <p className="py-5 text-sm text-muted-foreground">
                  {organizationPage > 0 && visible.organizationTotal > 0 ? "Updating organization results…" : "No matching organizations."}
                </p>
              )}
            </ResultSection> : null}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
