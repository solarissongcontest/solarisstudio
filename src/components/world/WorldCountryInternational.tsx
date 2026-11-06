import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Globe2, Landmark, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { PageHeader } from "@/components/AppShell";
import { WorldPublicGate } from "@/components/world/WorldPublic";
import { ArchiveDataLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import {
  WORLD_AFFILIATION_PAGE_SIZE,
  WORLD_COUNTRY_PAGE_SIZE,
  normalizeWorldCountrySearch,
  validWorldCountryCode,
  visibleWorldCountryAffiliations,
  verifiedWorldQueryData,
  type WorldCountryAffiliation,
  type WorldPublicCountry,
  type WorldPublicInstitution,
} from "@/lib/world-country-international";
import {
  fetchWorldCountryDirectory,
  fetchWorldCountryIdentity,
  fetchWorldCountryMembershipPage,
  fetchWorldPublicCountryInstitutions,
} from "@/lib/world-country-international-queries";
type Phase = "current" | "historical";

const membershipDate = (value: string): string => new Intl.DateTimeFormat("en", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
}).format(new Date(value));

/**
 * Reuse the one canonical World publication gate now that TG3 #1934 is on
 * main. Country records are never mounted from a cached rollout decision.
 */
export function WorldCountryRolloutGate({ children }: { children: ReactNode }) {
  return <WorldPublicGate verifyOnMount>{children}</WorldPublicGate>;
}

function FailureState({ retry, title = "International records unavailable" }: { retry: () => void; title?: string }) {
  return <div role="alert" className="border-y border-border py-7">
    <h2 className="text-lg font-bold">{title}</h2>
    <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
      Official country and organization records could not be verified.
      No assumed memberships, appointments or historical claims are being shown.
    </p>
    <button type="button" onClick={retry}
      className="mt-4 min-h-11 rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      Retry
    </button>
  </div>;
}

function CountryRow({ country }: { country: WorldPublicCountry }) {
  return <Link to="/world/countries/$code" params={{ code: country.code }}
    className="group flex min-h-20 items-center gap-4 border-b border-border/60 py-3 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
    <FlagChip code={country.code} image={country.flagImage} color={country.accentColor} size="md" />
    <span className="min-w-0 flex-1">
      <span className="block font-semibold group-hover:text-primary">{country.name}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{country.region} · {country.code}</span>
    </span>
    <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </Link>;
}

export function WorldCountriesDirectory() {
  const [search, setSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timeout = setTimeout(() => setSettledSearch(search), 350);
    return () => clearTimeout(timeout);
  }, [search]);

  const safeSearch = normalizeWorldCountrySearch(settledSearch);
  const query = useQuery({
    queryKey: ["world", "country-international-directory", safeSearch, page],
    staleTime: 120_000,
    refetchOnMount: "always",
    retry: 1,
    queryFn: () => fetchWorldCountryDirectory(safeSearch, page),
  });

  // A failed revalidation may retain old React Query data. Never render it.
  // If a concurrent deletion empties the selected page, recover to the last
  // valid page instead of presenting a misleading zero-results dead end.
  useEffect(() => {
    const verifiedPage = verifiedWorldQueryData(query);
    if (verifiedPage && page > 0 && page * WORLD_COUNTRY_PAGE_SIZE >= verifiedPage.count) {
      setPage(Math.max(0, Math.ceil(verifiedPage.count / WORLD_COUNTRY_PAGE_SIZE) - 1));
    }
  }, [page, query.data, query.isSuccess, query.isFetchedAfterMount, query.isFetching]);

  const visibleCountryData = verifiedWorldQueryData(query);
  const total = visibleCountryData?.count ?? 0;
  const start = page * WORLD_COUNTRY_PAGE_SIZE;
  return <>
    <PageHeader eyebrow="Terra Solaris / Countries" title="Countries in the world"
      description="Discover the formal international memberships of Terra Solaris countries, whether or not they compete in the current Song Contest." />
    <div className="mx-auto w-full max-w-5xl px-4 pb-14 sm:px-6">
      <div className="border-b border-border pb-6">
        <label className="block max-w-2xl">
          <span className="mb-2 block text-sm font-semibold">Find a country</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={search} maxLength={100} onChange={(event) => { setSearch(event.target.value); setPage(0); }}
              placeholder="Search country name or code"
              className="min-h-11 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm outline-none focus-visible:border-primary" />
          </span>
        </label>
        <p className="mt-3 text-xs text-muted-foreground">
          These are persistent country identities. Current SSC participation does not determine international membership.
        </p>
      </div>

      <p role="status" aria-live="polite" className="mt-5 text-xs text-muted-foreground">
        {query.isError ? "Countries unavailable" : query.isPending || query.isFetching || !query.isFetchedAfterMount ? "Loading countries…" :
          total === 0 ? "No matching countries" :
            "Countries " + (start + 1) + "–" + Math.min(start + WORLD_COUNTRY_PAGE_SIZE, total) + " of " + total}
      </p>
      {!query.isError && (query.isPending || query.isFetching || !query.isFetchedAfterMount) ? <ArchiveDataLoading label="Loading public country identities…" /> : null}
      {query.isError ? <FailureState title="Countries unavailable" retry={() => void query.refetch()} /> : null}
      {visibleCountryData && visibleCountryData.countries.length === 0 ? (
        <div className="py-10">
          <h2 className="text-lg font-semibold">No matching countries</h2>
          <p className="mt-2 text-sm text-muted-foreground">Try a different country name or abbreviation.</p>
          <button type="button" onClick={() => { setSearch(""); setSettledSearch(""); setPage(0); }}
            className="mt-3 min-h-11 text-sm font-semibold text-primary">Clear search</button>
        </div>
      ) : null}
      {visibleCountryData ? <div className="divide-y divide-border/60">
        {visibleCountryData.countries.map((country) => <CountryRow key={country.id} country={country} />)}
      </div> : null}

      {total > WORLD_COUNTRY_PAGE_SIZE ? (
        <nav aria-label="Country pages" className="mt-7 flex items-center justify-between gap-4">
          <button type="button" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}
            className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold disabled:opacity-40">Previous</button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <button type="button" disabled={start + WORLD_COUNTRY_PAGE_SIZE >= total || query.isFetching} onClick={() => setPage((value) => value + 1)}
            className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold disabled:opacity-40">Next</button>
        </nav>
      ) : null}
      <Link to="/countries" className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
        Song Contest country profiles <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  </>;
}

function useCountryMemberships(countryId: string | undefined, phase: Phase, page: number) {
  return useQuery({
    queryKey: ["world", "country-international-memberships", countryId, phase, page],
    enabled: Boolean(countryId),
    refetchOnMount: "always",
    staleTime: 120_000,
    retry: 1,
    queryFn: () => fetchWorldCountryMembershipPage(countryId ?? "", phase, page),
  });
}

function AffiliationGroup({
  title, description, phase, page, setPage, data, loading, error, fetching, institutions, retry,
}: {
  title: string;
  description: string;
  phase: Phase;
  page: number;
  setPage: (value: number) => void;
  data?: { rows: WorldCountryAffiliation[]; count: number };
  loading: boolean;
  error: boolean;
  fetching: boolean;
  institutions: readonly WorldPublicInstitution[];
  retry: () => void;
}) {
  const total = data?.count ?? 0;
  const safeRows = visibleWorldCountryAffiliations(data?.rows ?? [], institutions);
  return <section className="py-7" aria-labelledby={"world-country-" + phase}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={"world-country-" + phase} className="text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {data ? <span className="text-xs tabular-nums text-muted-foreground">{total} recorded</span> : null}
    </div>
    {loading ? <ArchiveDataLoading label={"Loading " + phase + " affiliations…"} /> : null}
    {error ? <FailureState retry={retry} /> : null}
    {data && total === 0 ? <p className="mt-5 text-sm text-muted-foreground">
      {phase === "current" ? "No current public institutional memberships have been recorded." :
        "No former public institutional memberships have been recorded."}
    </p> : null}
    {data && total > 0 && safeRows.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">
      Public organization identity is unavailable for this page. Affiliation names cannot be verified.
    </p> : null}
    {safeRows.length ? <div className="mt-4 divide-y divide-border/60">
      {safeRows.map(({ affiliation, organization }) => <div key={affiliation.id} className="flex min-h-20 items-center gap-4 py-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-xs font-bold tracking-wide" aria-hidden="true">
          {organization.name.slice(0, 3)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{organization.name}</span>
          <span className="block text-xs text-muted-foreground">{organization.officialName}</span>
          <span className="mt-1 block text-xs capitalize text-muted-foreground">
            {affiliation.membershipType} · {affiliation.status.replace(/_/g, " ")}
          </span>
          <span className="mt-1 block text-xs tabular-nums text-muted-foreground">
            {phase === "current"
              ? "Since " + membershipDate(affiliation.joinedAt)
              : membershipDate(affiliation.joinedAt) + " to " + membershipDate(affiliation.endedAt!)}
            {" · UTC"}
          </span>
        </span>
        <Landmark aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </div>)}
    </div> : null}
    {data && total > WORLD_AFFILIATION_PAGE_SIZE ? (
      <nav aria-label={title + " pages"} className="mt-5 flex items-center justify-between gap-3">
        <button type="button" disabled={page === 0 || fetching} onClick={() => setPage(Math.max(0, page - 1))}
          className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-40">Previous</button>
        <span className="text-xs text-muted-foreground">Page {page + 1}</span>
        <button type="button" disabled={(page + 1) * WORLD_AFFILIATION_PAGE_SIZE >= total || fetching} onClick={() => setPage(page + 1)}
          className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-40">Next</button>
      </nav>
    ) : null}
  </section>;
}

export function WorldCountryInternational({ code }: { code: string }) {
  const canonicalCode = code.toUpperCase();
  const validCode = validWorldCountryCode(canonicalCode);
  const [currentPage, setCurrentPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);

  const identity = useQuery({
    queryKey: ["world", "country-international-identity", canonicalCode],
    enabled: validCode,
    refetchOnMount: "always",
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: () => fetchWorldCountryIdentity(canonicalCode),
  });

  const current = useCountryMemberships(identity.data?.id, "current", currentPage);
  const historical = useCountryMemberships(identity.data?.id, "historical", historyPage);

  useEffect(() => {
    const verifiedPage = verifiedWorldQueryData(current);
    if (verifiedPage && currentPage > 0 &&
        currentPage * WORLD_AFFILIATION_PAGE_SIZE >= verifiedPage.count) {
      setCurrentPage(Math.max(0, Math.ceil(verifiedPage.count / WORLD_AFFILIATION_PAGE_SIZE) - 1));
    }
  }, [current.data, current.isSuccess, current.isFetchedAfterMount, current.isFetching, currentPage]);
  useEffect(() => {
    const verifiedPage = verifiedWorldQueryData(historical);
    if (verifiedPage && historyPage > 0 &&
        historyPage * WORLD_AFFILIATION_PAGE_SIZE >= verifiedPage.count) {
      setHistoryPage(Math.max(0, Math.ceil(verifiedPage.count / WORLD_AFFILIATION_PAGE_SIZE) - 1));
    }
  }, [historical.data, historical.isSuccess, historical.isFetchedAfterMount, historical.isFetching, historyPage]);

  // Resolve only the organizations on the visible current/historical pages.
  // This independently enforces the world_organizations PUBLIC RLS boundary
  // after the membership RLS boundary, including visibility changes mid-read.
  const verifiedCurrent = verifiedWorldQueryData(current);
  const verifiedHistorical = verifiedWorldQueryData(historical);
  const organizationIds = useMemo(() => Array.from(new Set([
    ...(verifiedCurrent?.rows ?? []),
    ...(verifiedHistorical?.rows ?? []),
  ].map((item) => item.organizationId))), [verifiedCurrent, verifiedHistorical]);
  const institutions = useQuery({
    queryKey: ["world", "country-international-public-institutions", organizationIds.join(",")],
    enabled: Boolean(verifiedWorldQueryData(identity)) && organizationIds.length > 0,
    refetchOnMount: "always",
    staleTime: 120_000,
    retry: 1,
    queryFn: () => fetchWorldPublicCountryInstitutions(organizationIds),
  });

  if (!validCode) return <div className="mx-auto max-w-4xl px-4 py-12">
    <h1 className="text-xl font-bold">Country not found</h1>
    <Link to="/world/countries" className="mt-4 inline-flex min-h-11 items-center text-primary">Browse countries</Link>
  </div>;
  if (identity.isError) return <div className="mx-auto max-w-5xl px-4 py-10"><FailureState retry={() => void identity.refetch()} /></div>;
  if (identity.isPending || identity.isFetching || !identity.isFetchedAfterMount) return <div className="mx-auto max-w-5xl px-4 py-10"><ArchiveDataLoading label="Opening country identity…" /></div>;
  const verifiedIdentity = verifiedWorldQueryData(identity);
  if (!verifiedIdentity) return <div className="mx-auto max-w-4xl px-4 py-12">
    <h1 className="text-xl font-bold">Country not found</h1>
    <p className="mt-2 text-sm text-muted-foreground">No current public country identity matches this address.</p>
    <Link to="/world/countries" className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary">Browse countries</Link>
  </div>;

  const country = verifiedIdentity;
  const verifiedInstitutions = verifiedWorldQueryData(institutions);
  const institutionsReady = !organizationIds.length || Array.isArray(verifiedInstitutions);
  const institutionError = institutions.isError;
  return <>
    <div className="mx-auto w-full max-w-5xl px-4 pb-14 pt-6 sm:px-6">
      <Link to="/world/countries" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> World countries
      </Link>
      <div className="flex flex-wrap items-center gap-5 border-b border-border pb-7">
        <FlagChip code={country.code} color={country.accentColor} image={country.flagImage} size="xl" />
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <Globe2 className="size-4" aria-hidden="true" /> Country · International
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{country.name} · International</h1>
          <p className="mt-1 text-sm text-muted-foreground">{country.region} · {country.code}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
            <Link to="/countries/$code" params={{ code: country.code }}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
              Song Contest profile <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link to="/world/countries/$code/government" params={{ code: country.code }}
              className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
              Government <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
      <p className="mt-6 max-w-3xl text-sm leading-7 text-muted-foreground">
        Membership is country-level and persists independently of SSC participation.
        Only institutions whose records are currently public can appear here.
        Historical affiliations are separated from current ones.
      </p>
      {!institutionError && !institutionsReady && organizationIds.length > 0 ?
        <p className="mt-4 text-sm text-muted-foreground" role="status">Verifying public institutional identities…</p> : null}
      {institutionError ? <FailureState title="Institution identities unavailable" retry={() => void institutions.refetch()} /> : null}
      {institutionsReady ? <>
        <AffiliationGroup title="Current memberships"
          description="Active memberships, associates, observers and suspended members recorded by each institution."
          phase="current" page={currentPage} setPage={setCurrentPage}
          data={verifiedCurrent} loading={!current.isError && (current.isPending || current.isFetching || !current.isFetchedAfterMount)} error={current.isError}
          fetching={current.isFetching} institutions={verifiedInstitutions ?? []} retry={() => void current.refetch()} />
        <div className="border-t border-border" />
        <AffiliationGroup title="Former affiliations"
          description="Published historical terms. These records do not imply current membership."
          phase="historical" page={historyPage} setPage={setHistoryPage}
          data={verifiedHistorical} loading={!historical.isError && (historical.isPending || historical.isFetching || !historical.isFetchedAfterMount)} error={historical.isError}
          fetching={historical.isFetching} institutions={verifiedInstitutions ?? []} retry={() => void historical.refetch()} />
      </> : null}
    </div>
  </>;
}
