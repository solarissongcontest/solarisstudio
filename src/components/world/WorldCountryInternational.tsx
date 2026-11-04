import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Globe2, Landmark, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { PageHeader } from "@/components/AppShell";
import { ArchiveDataLoading } from "@/components/ArchiveDataState";
import { FlagChip } from "@/components/FlagChip";
import { supabase } from "@/integrations/supabase/client";
import {
  WORLD_AFFILIATION_PAGE_SIZE,
  WORLD_COUNTRY_PAGE_SIZE,
  normalizeWorldCountrySearch,
  parseWorldCountryAffiliations,
  parseWorldCountryIdentity,
  parseWorldPublicCountries,
  parseWorldPublicInstitutions,
  validWorldCountryCode,
  verifiedWorldCount,
  visibleWorldCountryAffiliations,
  worldCountrySearchFilter,
  type WorldCountryAffiliation,
  type WorldPublicCountry,
  type WorldPublicInstitution,
} from "@/lib/world-country-international";

const COUNTRY_COLUMNS = "id,name,short_code,region,flag_image,accent_color";
const MEMBERSHIP_COLUMNS = "id,country_id,organization_id,membership_type,status,joined_at,ended_at";
type Phase = "current" | "historical";

const membershipDate = (value: string): string => new Intl.DateTimeFormat("en", {
  day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
}).format(new Date(value));

/**
 * Guard independently until #1934's shared WorldPublicGate is on the
 * integration branch. Use its identical flag RPC and query cache key.
 * Children are not mounted while publication is disabled or unverified.
 */
export function WorldCountryRolloutGate({ children }: { children: ReactNode }) {
  const rollout = useQuery({
    queryKey: ["world", "public", "rollout"],
    staleTime: 45_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("studio2_feature_enabled", {
        p_key: "terra_world_public",
        p_edition_id: null,
      });
      if (error || typeof data !== "boolean") {
        throw new Error("World publication state could not be verified");
      }
      return data;
    },
  });

  if (rollout.isPending) {
    return <div className="mx-auto max-w-5xl px-4 py-8">
      <ArchiveDataLoading label="Checking Terra Solaris availability…" />
    </div>;
  }
  if (rollout.isError) {
    return <div className="mx-auto max-w-5xl px-4 py-8">
      <FailureState title="World availability could not be verified"
        retry={() => void rollout.refetch()} />
    </div>;
  }
  if (!rollout.data) {
    return <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-2xl font-bold">Terra Solaris is not yet available</h1>
      <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
        International records open when Terra Solaris is officially published.
      </p>
      <Link to="/explore" className="mt-5 inline-flex min-h-11 items-center font-semibold text-primary">
        Return to Explore
      </Link>
    </div>;
  }
  return <>{children}</>;
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
    retry: 1,
    queryFn: async () => {
      let request = (supabase as any).from("countries")
        .select(COUNTRY_COLUMNS, { count: "exact" });
      const filter = worldCountrySearchFilter(safeSearch);
      if (filter) request = request.or(filter);
      const { data, count, error } = await request.order("name", { ascending: true })
        .range(page * WORLD_COUNTRY_PAGE_SIZE, (page + 1) * WORLD_COUNTRY_PAGE_SIZE - 1);
      if (error) throw error;
      return { countries: parseWorldPublicCountries(data), count: verifiedWorldCount(count) };
    },
  });

  // A failed revalidation may retain old React Query data. Never render it.
  const visibleCountryData = query.isError ? undefined : query.data;
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
        {query.isPending ? "Loading countries…" : query.isError ? "Countries unavailable" :
          total === 0 ? "No matching countries" :
            "Countries " + (start + 1) + "–" + Math.min(start + WORLD_COUNTRY_PAGE_SIZE, total) + " of " + total}
      </p>
      {query.isPending ? <ArchiveDataLoading label="Loading public country identities…" /> : null}
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
    staleTime: 120_000,
    retry: 1,
    queryFn: async () => {
      if (!countryId) throw new Error("Missing country");
      // TG2 RLS limits rows to publicly visible organizations. The country
      // predicate is still mandatory: never download all members in the browser.
      let request = (supabase as any).from("world_organization_memberships")
        .select(MEMBERSHIP_COLUMNS, { count: "exact" }).eq("country_id", countryId);
      if (phase === "current") {
        request = request.is("ended_at", null).in("status", ["member", "observer", "associate", "suspended"]);
      } else {
        request = request.not("ended_at", "is", null).in("status", ["withdrawn", "expelled", "former"]);
      }
      const { data, count, error } = await request
        .order(phase === "current" ? "joined_at" : "ended_at", { ascending: false })
        .range(page * WORLD_AFFILIATION_PAGE_SIZE, (page + 1) * WORLD_AFFILIATION_PAGE_SIZE - 1);
      if (error) throw error;
      return {
        rows: parseWorldCountryAffiliations(data, countryId, phase),
        count: verifiedWorldCount(count),
      };
    },
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
    staleTime: 5 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("countries")
        .select(COUNTRY_COLUMNS).ilike("short_code", canonicalCode).maybeSingle();
      if (error) throw error;
      return parseWorldCountryIdentity(data, canonicalCode);
    },
  });

  const current = useCountryMemberships(identity.data?.id, "current", currentPage);
  const historical = useCountryMemberships(identity.data?.id, "historical", historyPage);

  // Resolve only the organizations on the visible current/historical pages.
  // This independently enforces the world_organizations PUBLIC RLS boundary
  // after the membership RLS boundary, including visibility changes mid-read.
  const organizationIds = useMemo(() => Array.from(new Set([
    ...(current.isSuccess ? current.data?.rows ?? [] : []),
    ...(historical.isSuccess ? historical.data?.rows ?? [] : []),
  ].map((item) => item.organizationId))), [current.data, current.isSuccess, historical.data, historical.isSuccess]);
  const institutions = useQuery({
    queryKey: ["world", "country-international-public-institutions", organizationIds.join(",")],
    enabled: Boolean(identity.data) && organizationIds.length > 0,
    staleTime: 120_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("world_organizations")
        .select("id,slug,short_name,official_name,status,public_visibility")
        .eq("public_visibility", "public").in("id", organizationIds);
      if (error) throw error;
      return parseWorldPublicInstitutions(data, organizationIds);
    },
  });

  if (!validCode) return <div className="mx-auto max-w-4xl px-4 py-12">
    <h1 className="text-xl font-bold">Country not found</h1>
    <Link to="/world/countries" className="mt-4 inline-flex min-h-11 items-center text-primary">Browse countries</Link>
  </div>;
  if (identity.isPending) return <div className="mx-auto max-w-5xl px-4 py-10"><ArchiveDataLoading label="Opening country identity…" /></div>;
  if (identity.isError) return <div className="mx-auto max-w-5xl px-4 py-10"><FailureState retry={() => void identity.refetch()} /></div>;
  if (!identity.data) return <div className="mx-auto max-w-4xl px-4 py-12">
    <h1 className="text-xl font-bold">Country not found</h1>
    <p className="mt-2 text-sm text-muted-foreground">No current public country identity matches this address.</p>
    <Link to="/world/countries" className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary">Browse countries</Link>
  </div>;

  const country = identity.data;
  const institutionsReady = !organizationIds.length || (institutions.isSuccess && Array.isArray(institutions.data));
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
          <Link to="/countries/$code" params={{ code: country.code }}
            className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
            Song Contest profile <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <p className="mt-6 max-w-3xl text-sm leading-7 text-muted-foreground">
        Membership is country-level and persists independently of SSC participation.
        Only institutions whose records are currently public can appear here.
        Historical affiliations are separated from current ones.
      </p>
      {institutions.isPending && organizationIds.length > 0 ?
        <p className="mt-4 text-sm text-muted-foreground" role="status">Verifying public institutional identities…</p> : null}
      {institutionError ? <FailureState title="Institution identities unavailable" retry={() => void institutions.refetch()} /> : null}
      {institutionsReady ? <>
        <AffiliationGroup title="Current memberships"
          description="Active memberships, associates, observers and suspended members recorded by each institution."
          phase="current" page={currentPage} setPage={setCurrentPage}
          data={current.isSuccess ? current.data : undefined} loading={current.isPending} error={current.isError}
          fetching={current.isFetching} institutions={institutions.data ?? []} retry={() => void current.refetch()} />
        <div className="border-t border-border" />
        <AffiliationGroup title="Former affiliations"
          description="Published historical terms. These records do not imply current membership."
          phase="historical" page={historyPage} setPage={setHistoryPage}
          data={historical.isSuccess ? historical.data : undefined} loading={historical.isPending} error={historical.isError}
          fetching={historical.isFetching} institutions={institutions.data ?? []} retry={() => void historical.refetch()} />
      </> : null}
    </div>
  </>;
}
