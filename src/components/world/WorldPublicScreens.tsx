import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, ChevronRight, Globe2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { FlagChip } from "@/components/FlagChip";
import {
  useWorldCountryIdentities,
  useWorldDirectory,
  useWorldOrganization,
} from "@/lib/world-public-data";
import {
  WORLD_ORGANIZATION_STATUSES,
  activeWorldMemberships,
  currentWorldRepresentatives,
  sanitizeWorldDirectorySearch,
  worldStatusLabel,
  type WorldOrganizationFilter,
  type WorldCountryIdentity,
} from "@/lib/world-public-model";

const inputClass =
  "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary";
const actionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40";

function WorldError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">World information is unavailable</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{message}</p>
      <button type="button" onClick={retry} className={actionClass + " mt-4"}>
        Try again
      </button>
    </div>
  );
}

function WorldLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 py-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <div aria-hidden="true" className="h-16 animate-pulse rounded-xl bg-surface" />
      <div aria-hidden="true" className="h-16 animate-pulse rounded-xl bg-surface" />
      <div aria-hidden="true" className="h-16 animate-pulse rounded-xl bg-surface" />
    </div>
  );
}

function WorldBreadcrumbs({ organization }: { organization?: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Link to="/explore" className="hover:text-foreground">Explore</Link>
      <ChevronRight size={12} aria-hidden="true" />
      {organization ? (
        <>
          <Link to="/world" className="hover:text-foreground">Terra Solaris</Link>
          <ChevronRight size={12} aria-hidden="true" />
          <span aria-current="page">{organization}</span>
        </>
      ) : (
        <span aria-current="page">Terra Solaris</span>
      )}
    </nav>
  );
}

export function WorldDirectoryScreen() {
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState<WorldOrganizationFilter>("all");
  const [page, setPage] = useState(0);

  // Do not call Supabase for every keystroke. The query is bounded and cached per filter/page.
  useEffect(() => {
    const handle = setTimeout(() => setAppliedSearch(sanitizeWorldDirectorySearch(search)), 350);
    return () => clearTimeout(handle);
  }, [search]);

  const directory = useWorldDirectory({ search: appliedSearch, status, page });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-4 sm:px-6">
      <WorldBreadcrumbs />
      <header className="mb-9 max-w-3xl">
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
          <Globe2 className="size-4" aria-hidden="true" /> Terra Solaris
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">The world beyond the contest</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          Discover international organizations, their member countries, institutions and leadership.
          All institutional information below comes from the public Terra Solaris record.
        </p>
      </header>

      <section aria-labelledby="world-directory-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Institutions</p>
            <h2 id="world-directory-heading" className="mt-1 text-2xl font-bold">Organizations</h2>
          </div>
          <Link to="/countries" className={actionClass}>
            Explore countries <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px]">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Search organizations</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(0); }}
                maxLength={64}
                placeholder="Name or acronym"
                className={inputClass + " pl-10"}
              />
            </span>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Institution status</span>
            <select
              value={status}
              onChange={(event) => { setStatus(event.target.value as WorldOrganizationFilter); setPage(0); }}
              className={inputClass}
            >
              <option value="all">All public organizations</option>
              {WORLD_ORGANIZATION_STATUSES.map((item) =>
                <option key={item} value={item}>{worldStatusLabel(item)}</option>
              )}
            </select>
          </label>
        </div>

        {directory.isPending ? <WorldLoading label="Loading international organizations…" /> : null}
        {directory.isError ? (
          <WorldError
            message="The public directory could not be loaded. No institution details were inferred."
            retry={() => { void directory.refetch(); }}
          />
        ) : null}
        {directory.data ? (
          <>
            <p role="status" aria-live="polite" className="mb-3 text-xs text-muted-foreground">
              {directory.data.items.length} organizations on this page
            </p>
            {directory.data.items.length ? (
              <ul className="divide-y divide-border border-y border-border">
                {directory.data.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      to="/world/organizations/$slug"
                      params={{ slug: item.slug }}
                      className="group grid min-h-24 gap-2 py-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[92px_minmax(0,1fr)_auto] sm:items-center sm:gap-5"
                    >
                      <div aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-xs font-black text-primary">
                        <Building2 className="size-6" />
                      </div>
                      <span className="block min-w-0">
                        <span className="block text-lg font-semibold text-foreground group-hover:text-primary">{item.shortName}</span>
                        <span className="block text-sm text-muted-foreground">{item.officialName}</span>
                        {item.description ? <span className="mt-2 block line-clamp-2 text-sm leading-6 text-muted-foreground">{item.description}</span> : null}
                      </span>
                      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        {worldStatusLabel(item.status)} <ChevronRight className="size-4" aria-hidden="true" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-y border-border py-10 text-center">
                <p className="font-semibold">No matching public organizations</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try a different search or status filter. Private organizations are not shown.
                </p>
                <button
                  type="button"
                  className={actionClass + " mt-4"}
                  onClick={() => { setSearch(""); setAppliedSearch(""); setStatus("all"); setPage(0); }}
                >Clear filters</button>
              </div>
            )}
            <div className="mt-5 flex items-center justify-between gap-3">
              <button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className={actionClass}>
                <ArrowLeft className="size-4" aria-hidden="true" /> Previous
              </button>
              <span className="text-sm text-muted-foreground">Page {page + 1}</span>
              <button type="button" disabled={!directory.data.hasNext} onClick={() => setPage((value) => value + 1)} className={actionClass}>
                Next <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}

function CountryLabel({ country }: { country?: WorldCountryIdentity }) {
  if (!country) return <span className="text-muted-foreground">Country identity unavailable</span>;
  return (
    <Link to="/countries/$code" params={{ code: country.shortCode }} className="inline-flex min-w-0 items-center gap-2 font-medium hover:text-primary">
      <FlagChip code={country.shortCode} color="#586c9a" image={country.flagImage} size="sm" />
      <span className="truncate">{country.name}</span>
    </Link>
  );
}

export function WorldOrganizationScreen({ slug }: { slug: string }) {
  const detailQuery = useWorldOrganization(slug);
  const snapshot = detailQuery.data;
  const countryIds = snapshot ? [
    ...snapshot.memberships.map((member) => member.countryId),
    ...snapshot.representatives.map((representative) => representative.countryId),
    ...snapshot.offices.map((office) => office.representedCountryId).filter((id): id is string => id !== null),
  ] : [];
  const countriesQuery = useWorldCountryIdentities(countryIds);
  const countries = useMemo(
    () => new Map((countriesQuery.data ?? []).map((country) => [country.id, country])),
    [countriesQuery.data],
  );

  const [memberSearch, setMemberSearch] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  if (detailQuery.isPending && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6"><WorldLoading label="Loading organization record…" /></div>;
  }
  if (detailQuery.isError) {
    return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6"><WorldError
      message="The official public organization projection could not be read."
      retry={() => { void detailQuery.refetch(); }}
    /></div>;
  }
  if (!snapshot) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <WorldBreadcrumbs />
        <h1 className="text-2xl font-bold">Organization not available</h1>
        <p className="mt-2 text-sm text-muted-foreground">This institution does not exist or does not have a public profile.</p>
        <Link to="/world" className={actionClass + " mt-5"}>Browse public organizations</Link>
      </div>
    );
  }

  const { organization, organs, memberships, offices } = snapshot;
  const active = activeWorldMemberships(memberships);
  const history = memberships.filter((member) => member.endedAt !== null);
  const representatives = currentWorldRepresentatives(snapshot.representatives);
  const filteredMembers = (showHistory ? [...active, ...history] : active)
    .filter((member) => !memberSearch.trim() || (countries.get(member.countryId)?.name ?? "")
      .toLocaleLowerCase().includes(memberSearch.trim().toLocaleLowerCase()))
    .sort((a, b) => (countries.get(a.countryId)?.name ?? "").localeCompare(countries.get(b.countryId)?.name ?? ""));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-4 sm:px-6">
      <WorldBreadcrumbs organization={organization.shortName} />
      <header className="mb-8 border-b border-border pb-8">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-primary">International institution</p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">{organization.shortName}</h1>
        {organization.officialName !== organization.shortName ? (
          <p className="mt-2 text-lg text-muted-foreground">{organization.officialName}</p>
        ) : null}
        {organization.description ? (
          <p className="mt-5 max-w-3xl text-base leading-7">{organization.description}</p>
        ) : null}
        <p className="mt-5 text-sm text-muted-foreground">Status: {worldStatusLabel(organization.status)}</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,1fr)]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="world-members-title">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Membership</p>
                <h2 id="world-members-title" className="mt-1 text-2xl font-bold">Countries</h2>
              </div>
              <span className="text-sm text-muted-foreground">{active.length} current relationships</span>
            </div>
            {memberships.length ? (
              <>
                <label className="block">
                  <span className="sr-only">Find a member country</span>
                  <input
                    className={inputClass}
                    type="search"
                    value={memberSearch}
                    onChange={(event) => setMemberSearch(event.target.value)}
                    placeholder="Find a member country"
                  />
                </label>
                {countriesQuery.isError ? (
                  <div className="mt-3 text-sm text-muted-foreground" role="alert">
                    Country names are temporarily unavailable.
                    <button type="button" className="ml-2 underline" onClick={() => { void countriesQuery.refetch(); }}>Retry</button>
                  </div>
                ) : null}
                <ul className="mt-4 divide-y divide-border border-y border-border">
                  {filteredMembers.map((member) => {
                    const rep = representatives.find((person) => person.countryId === member.countryId);
                    return (
                      <li key={member.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm">
                        <div className="min-w-0">
                          <CountryLabel country={countries.get(member.countryId)} />
                          {rep ? (
                            <p className="mt-1 pl-11 text-xs text-muted-foreground">
                              {rep.displayName} · {rep.votingAuthority ? "Voting representative" : worldStatusLabel(rep.role)}
                            </p>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground">{worldStatusLabel(member.status)}</span>
                      </li>
                    );
                  })}
                </ul>
                {!filteredMembers.length ? <p className="py-5 text-sm text-muted-foreground">No countries match this filter.</p> : null}
                {history.length ? (
                  <button type="button" className={actionClass + " mt-4"} onClick={() => setShowHistory((value) => !value)} aria-expanded={showHistory}>
                    {showHistory ? "Hide former memberships" : "Show former memberships"} ({history.length})
                  </button>
                ) : null}
                {countryIds.length > 100 ? <p className="mt-3 text-xs text-muted-foreground">Country identities are limited to the first 100 records in this view.</p> : null}
              </>
            ) : (
              <p className="border-y border-border py-6 text-sm text-muted-foreground">
                No membership records have been published. Membership has not been inferred from contest participation.
              </p>
            )}
          </section>
        </div>
        <div className="min-w-0 space-y-9">
          <section aria-labelledby="world-organs-title">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Structure</p>
            <h2 id="world-organs-title" className="mb-3 mt-1 text-xl font-bold">Institutional bodies</h2>
            {organs.length ? (
              <ul className="divide-y divide-border border-y border-border">
                {organs.map((organ) => (
                  <li key={organ.id} className="py-3">
                    <p className="font-semibold">{organ.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{worldStatusLabel(organ.status)}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No public institutional bodies.</p>}
          </section>
          <section aria-labelledby="world-offices-title">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Leadership</p>
            <h2 id="world-offices-title" className="mb-3 mt-1 text-xl font-bold">Offices</h2>
            {offices.length ? (
              <ul className="divide-y divide-border border-y border-border">
                {offices.map((office) => (
                  <li key={office.id} className="py-3">
                    <p className="font-semibold">{office.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {office.currentHolder ?? "No active officeholder recorded"}
                    </p>
                    {office.representedCountryId && countries.has(office.representedCountryId) ? (
                      <div className="mt-1 text-sm"><CountryLabel country={countries.get(office.representedCountryId)} /></div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No public offices recorded.</p>}
          </section>
          <Link to="/world" className={actionClass}>
            <ArrowLeft className="size-4" aria-hidden="true" /> All organizations
          </Link>
        </div>
      </div>
    </div>
  );
}
