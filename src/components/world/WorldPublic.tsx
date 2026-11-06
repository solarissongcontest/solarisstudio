import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, Globe2, Landmark, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AppShell } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import { supabase } from "@/integrations/supabase/client";
import { worldPublicQueryVerified } from "@/lib/terra-world-unified-search";
import { publicWorldRolloutDisplay } from "@/lib/terra-world-rollout-gate";
import {
  WORLD_DIRECTORY_PAGE_SIZE,
  currentWorldMemberships,
  fetchWorldDirectory,
  fetchFeaturedWorldOrganizations,
  fetchWorldPublicEnabled,
  fetchWorldProjection,
  type WorldDirectoryFilter,
  type WorldOrganization,
} from "@/lib/terra-world-public";

type WorldView = "overview" | "leadership" | "members";

/** No public world projection mounts before the canonical rollout RPC permits it. */
export function WorldPublicGate({
  children, verifyOnMount = false,
}: { children: ReactNode; verifyOnMount?: boolean }) {
  const rollout = useQuery({
    queryKey: ["world", "public", "rollout"],
    queryFn: fetchWorldPublicEnabled,
    staleTime: 45_000,
    // The body routes opt into publication re-verification on navigation.
    // Other World screens retain their previous cached-gate behavior.
    refetchOnMount: verifyOnMount ? "always" : undefined,
    retry: false,
  });
  // A cached enabled flag is not proof that this route is still published.
  // Keep the display decision independent from React rendering for regression tests.
  const publication = publicWorldRolloutDisplay(rollout, verifyOnMount);
  if (publication === "error") {
    return (
      <PublicFrame>
        <QueryFailure message="World availability could not be verified. No institutional records were loaded." retry={() => void rollout.refetch()} />
      </PublicFrame>
    );
  }
  if (publication === "checking") {
    return <PublicFrame><LoadingWorld label="Checking Terra Solaris availability" /></PublicFrame>;
  }
  if (publication === "disabled") {
    return (
      <PublicFrame>
        <div className="max-w-2xl rounded-2xl border border-border p-6 sm:p-9">
          <Kicker>Terra Solaris</Kicker>
          <h1 className="mt-3 font-display text-3xl font-semibold">World is not yet available</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Institutional discovery opens when this section is officially enabled.
            The Solaris Song Contest archive remains available.
          </p>
          <Link to="/explore" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Return to Explore
          </Link>
        </div>
      </PublicFrame>
    );
  }
  return <>{children}</>;
}

function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-6xl px-1 pb-24 pt-4 sm:px-4 sm:pt-7">
        {children}
      </div>
    </AppShell>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{children}</p>;
}

function QueryFailure({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-border bg-card px-5 py-7">
      <h2 className="text-lg font-semibold">This part of Terra Solaris could not be loaded</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
      <button type="button" onClick={retry} className="mt-5 min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        Try again
      </button>
    </div>
  );
}

function LoadingWorld({ label }: { label: string }) {
  return (
    <div className="space-y-4" role="status" aria-busy="true" aria-label={label}>
      <div className="h-7 w-52 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <div className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function OrganizationRow({ organization }: { organization: WorldOrganization }) {
  return (
    <Link
      to="/world/organizations/$slug"
      params={{ slug: organization.slug }}
      search={{ tab: "overview" }}
      className="group flex min-h-20 items-center gap-4 border-b border-border/70 py-4 last:border-0 focus-visible:rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground" aria-hidden="true">
        <Landmark className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground group-hover:underline">{organization.shortName}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{organization.officialName}</span>
        {organization.description ? (
          <span className="mt-1 block line-clamp-2 text-sm leading-5 text-muted-foreground">{organization.description}</span>
        ) : null}
      </span>
      <span className="hidden shrink-0 rounded-full border border-border px-3 py-1 text-xs capitalize text-muted-foreground sm:block">
        {organization.status}
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" />
    </Link>
  );
}

export function WorldLanding() {
  const directory = useQuery({
    queryKey: ["world", "public", "featured"],
    queryFn: fetchFeaturedWorldOrganizations,
    staleTime: 90_000,
    refetchOnMount: "always",
    retry: false,
  });
  const featured = directory.data ?? [];
  return (
    <PublicFrame>
      <div className="max-w-3xl">
        <Kicker>Explore · Terra Solaris</Kicker>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-6xl">A world beyond the stage.</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          Explore the countries and institutions of Terra Solaris, including GUARD, UNITY and future recognized unions.
          Official leadership and membership appear only when they are recorded in Solaris.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/world/search" search={{ q: "", c: 0, o: 0, type: "all" }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            <Search className="size-4" aria-hidden="true" /> Search the world
          </Link>
          <Link to="/world/organizations" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
            <Landmark className="size-4" aria-hidden="true" /> Explore organizations
          </Link>
          <Link to="/countries" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-5 text-sm font-semibold">
            <Globe2 className="size-4" aria-hidden="true" /> Discover countries
          </Link>
        </div>
      </div>
      <section className="mt-12 border-t border-border pt-8" aria-labelledby="world-institutions-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <Kicker>Institutions</Kicker>
            <h2 id="world-institutions-title" className="mt-2 text-2xl font-semibold tracking-tight">International organizations</h2>
          </div>
          <Link to="/world/organizations" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary">
            Browse all <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        {(directory.isPending || directory.isFetching) && !directory.isError && !directory.isRefetchError ? <LoadingWorld label="Verifying published institutions" /> : null}
        {directory.isError || directory.isRefetchError ? <QueryFailure message="The organization directory could not be verified." retry={() => void directory.refetch()} /> : null}
        {worldPublicQueryVerified(directory) && featured.length > 0 ? (
          <div className="divide-y divide-border">
            {featured.map((organization) => <OrganizationRow key={organization.id} organization={organization} />)}
          </div>
        ) : null}
        {worldPublicQueryVerified(directory) && featured.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">No featured public institutional profiles are available right now.</p>
        ) : null}
      </section>
    </PublicFrame>
  );
}

export function WorldDirectory() {
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<WorldDirectoryFilter>("all");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setTerm(input);
      setPage(0);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [input]);
  const directory = useQuery({
    queryKey: ["world", "public", "organizations", term, filter, page],
    queryFn: () => fetchWorldDirectory({ term, filter, page }),
    staleTime: 90_000,
    refetchOnMount: "always",
    retry: false,
  });
  // The directory may retain its last successful page while an authoritative
  // background recheck is in progress or has failed. Do not display stale rows.
  const verifiedDirectory = worldPublicQueryVerified(directory) ? directory.data : null;
  const total = verifiedDirectory?.total ?? 0;
  useEffect(() => {
    if (!verifiedDirectory || page === 0) return;
    const lastPage = Math.max(0, Math.ceil(verifiedDirectory.total / WORLD_DIRECTORY_PAGE_SIZE) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [page, verifiedDirectory]);
  return (
    <PublicFrame>
      <Link to="/world" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Terra Solaris
      </Link>
      <div className="mt-5 max-w-3xl">
        <Kicker>World directory</Kicker>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-5xl">Organizations</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          Explore the public profiles of international institutions. Private organizations and unpublished institutions are never listed here.
        </p>
      </div>
      <div className="mt-8 grid gap-3 border-y border-border py-5 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-background px-4 focus-within:ring-2 focus-within:ring-ring">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search organizations by name</span>
          <input
            type="search" value={input} maxLength={64}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search organizations"
            className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <label className="text-sm">
          <span className="sr-only">Organization status</span>
          <select
            value={filter}
            onChange={(event) => { setFilter(event.target.value as WorldDirectoryFilter); setPage(0); }}
            className="min-h-12 w-full rounded-xl border border-border bg-background px-4 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <option value="all">All public</option>
            <option value="current">Current institutions</option>
            <option value="historical">Historical institutions</option>
          </select>
        </label>
      </div>
      <div className="mt-6" aria-live="polite">
        {!(directory.isError || directory.isRefetchError) && (directory.isPending || directory.isFetching)
          ? <LoadingWorld label="Verifying public organizations" /> : null}
        {directory.isError || directory.isRefetchError
          ? <QueryFailure message="Search could not be verified. Your filters are still here." retry={() => void directory.refetch()} /> : null}
        {verifiedDirectory ? (
          <>
            <p className="text-sm text-muted-foreground">
              {total} {total === 1 ? "organization" : "organizations"} found
            </p>
            {verifiedDirectory.organizations.length ? (
              <div className="mt-3 divide-y divide-border">
                {verifiedDirectory.organizations.map((organization) =>
                  <OrganizationRow key={organization.id} organization={organization} />)}
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-border px-5 py-9">
                <Building2 className="size-6 text-muted-foreground" aria-hidden="true" />
                <h2 className="mt-3 font-semibold">No matching organizations</h2>
                <p className="mt-1 text-sm text-muted-foreground">Try another name or a different status filter.</p>
                <button type="button" onClick={() => { setInput(""); setTerm(""); setFilter("all"); setPage(0); }}
                  className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Clear filters</button>
              </div>
            )}
            {total > WORLD_DIRECTORY_PAGE_SIZE ? (
              <nav className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-5" aria-label="Organization pages">
                <button type="button" disabled={page === 0}
                  onClick={() => setPage((n) => Math.max(0, n - 1))}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
                <span className="text-xs text-muted-foreground">Page {page + 1} of {Math.ceil(total / WORLD_DIRECTORY_PAGE_SIZE)}</span>
                <button type="button" disabled={(page + 1) * WORLD_DIRECTORY_PAGE_SIZE >= total}
                  onClick={() => setPage((n) => n + 1)}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40">Next</button>
              </nav>
            ) : null}
          </>
        ) : null}
      </div>
    </PublicFrame>
  );
}

const WORLD_MEMBER_PAGE_SIZE = 24;
type WorldCountry = { id: string; name: string; short_code: string; flag_image: string | null; accent_color: string | null };
function parseCountryRows(raw: unknown): WorldCountry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is WorldCountry =>
    !!row && typeof row === "object" && typeof row.id === "string" &&
    typeof row.name === "string" && typeof row.short_code === "string" &&
    (row.accent_color == null || typeof row.accent_color === "string"));
}

export function WorldOrganizationPage({
  slug, view, onViewChange,
}: {
  slug: string;
  view: WorldView;
  onViewChange: (view: WorldView) => void;
}) {
  const [memberPage, setMemberPage] = useState(0);
  useEffect(() => { setMemberPage(0); }, [slug]);
  const projection = useQuery({
    queryKey: ["world", "public", "organization", slug],
    queryFn: () => fetchWorldProjection(slug),
    staleTime: 60_000,
    refetchOnMount: "always",
    retry: false,
  });
  // A successful cached projection is no longer evidence after a failed or
  // in-progress publication recheck. Never derive member/office identity from it.
  const verifiedProjection = worldPublicQueryVerified(projection)
    ? projection.data : null;
  const currentMembers = useMemo(() =>
    verifiedProjection ? currentWorldMemberships(verifiedProjection) : [],
    [verifiedProjection]);
  const visibleMembers = useMemo(
    () => currentMembers.slice(memberPage * WORLD_MEMBER_PAGE_SIZE, (memberPage + 1) * WORLD_MEMBER_PAGE_SIZE),
    [currentMembers, memberPage],
  );
  const countryIds = useMemo(() =>
    [...new Set(visibleMembers.map((member) => member.countryId))].sort(),
    [visibleMembers]);
  const countries = useQuery({
    queryKey: ["world", "public", "member-countries", countryIds],
    enabled: verifiedProjection !== null && view === "members" && countryIds.length > 0,
    retry: false,
    staleTime: 300_000,
    refetchOnMount: "always",
    queryFn: async () => {
      // Exact member IDs and five display fields. Never download account owners,
      // country controls, private delegation or membership authority.
      const { data, error } = await (supabase as any).from("countries")
        .select("id,name,short_code,flag_image,accent_color").in("id", countryIds);
      if (error) throw new Error("Country labels could not be loaded.");
      return parseCountryRows(data);
    },
  });
  const verifiedCountries = worldPublicQueryVerified(countries) ? countries.data : null;
  const countryMap = useMemo(() =>
    new Map((verifiedCountries ?? []).map((country) => [country.id, country])),
    [verifiedCountries]);
  const representativesByCountry = useMemo(() =>
    new Map((verifiedProjection?.representatives ?? [])
      .filter((rep) => rep.endsAt === null && rep.role === "representative" && rep.votingAuthority)
      .map((rep) => [rep.countryId, rep])),
    [verifiedProjection]);
  const officesByCountry = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const office of verifiedProjection?.offices ?? []) {
      const countryId = office.currentTerm?.representedCountryId;
      if (!countryId) continue;
      map.set(countryId, [...(map.get(countryId) ?? []), office.title]);
    }
    return map;
  }, [verifiedProjection]);
  return (
    <PublicFrame>
      <Link to="/world/organizations" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> All organizations
      </Link>
      {!(projection.isError || projection.isRefetchError) &&
        (projection.isPending || projection.isFetching)
        ? <div className="mt-6"><LoadingWorld label="Verifying organization publication" /></div> : null}
      {projection.isError || projection.isRefetchError
        ? <div className="mt-6"><QueryFailure message="Public institution information could not be verified." retry={() => void projection.refetch()} /></div> : null}
      {worldPublicQueryVerified(projection) && !projection.data ? (
        <div className="mt-6 rounded-2xl border border-border px-5 py-9">
          <h1 className="text-2xl font-semibold">Organization not available</h1>
          <p className="mt-2 text-sm text-muted-foreground">This organization does not have a published profile, or this link is no longer valid.</p>
          <Link to="/world/organizations" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Browse organizations</Link>
        </div>
      ) : null}
      {verifiedProjection ? (
        <>
          <header className="mt-5 max-w-4xl">
            <Kicker>Terra Solaris · International institution</Kicker>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-6xl">{verifiedProjection.organization.shortName}</h1>
            <p className="mt-2 text-base font-medium text-muted-foreground">{verifiedProjection.organization.officialName}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-border px-3 py-1 text-xs font-medium capitalize">{verifiedProjection.organization.status}</span>
              <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{currentMembers.length} current {currentMembers.length === 1 ? "membership" : "memberships"}</span>
            </div>
          </header>
          <nav aria-label="Organization sections" className="mt-8 flex gap-1 overflow-x-auto border-b border-border pb-1">
            {(["overview", "leadership", "members"] as const).map((tab) => (
              <button key={tab} type="button" aria-current={view === tab ? "page" : undefined}
                onClick={() => onViewChange(tab)}
                className={"min-h-11 shrink-0 border-b-2 px-4 text-sm font-semibold capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 " +
                  (view === tab ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                {tab}
              </button>
            ))}
          </nav>
          {view === "overview" ? (
            <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
              <div>
                <Kicker>About</Kicker>
                <h2 className="mt-2 text-2xl font-semibold">The institution</h2>
                <p className="mt-4 max-w-2xl whitespace-pre-line text-base leading-7 text-muted-foreground">
                  {verifiedProjection.organization.description || "An official description has not yet been published."}
                </p>
                <section className="mt-10 border-t border-border pt-6" aria-labelledby="world-organs-title">
                  <Kicker>Organization</Kicker>
                  <h2 id="world-organs-title" className="mt-2 text-xl font-semibold">Public bodies</h2>
                  {verifiedProjection.organs.length ? (
                    <div className="mt-4 divide-y divide-border">
                      {verifiedProjection.organs.slice(0, 5).map((organ) => (
                        <Link key={organ.id} to="/world/organizations/$slug/bodies/$bodySlug"
                          params={{ slug, bodySlug: organ.slug }}
                          className="flex min-h-14 flex-wrap items-center justify-between gap-2 py-4 focus-visible:rounded-md focus-visible:outline focus-visible:outline-2">
                          <span className="font-medium hover:underline">{organ.name}</span>
                          <span className="text-xs capitalize text-muted-foreground">{organ.status} · View body</span>
                        </Link>
                      ))}
                    </div>
                  ) : <p className="mt-4 text-sm text-muted-foreground">No public bodies have been recorded.</p>}
                  <Link to="/world/organizations/$slug/bodies" params={{ slug }}
                    className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
                    Browse public bodies <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </section>
              </div>
              <aside className="border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0" aria-label="Institution at a glance">
                <Kicker>At a glance</Kicker>
                <div className="mt-4 space-y-5">
                  <div><p className="text-xs text-muted-foreground">Active memberships</p><p className="mt-1 text-2xl font-semibold">{currentMembers.length}</p></div>
                  <div><p className="text-xs text-muted-foreground">Recorded public organs</p><p className="mt-1 text-2xl font-semibold">{verifiedProjection.organs.length}</p></div>
                  <div><p className="text-xs text-muted-foreground">Leadership offices</p><p className="mt-1 text-2xl font-semibold">{verifiedProjection.offices.length}</p></div>
                </div>
                <button type="button" className="mt-6 flex min-h-11 items-center gap-2 text-sm font-semibold text-primary" onClick={() => onViewChange("leadership")}>
                  Meet the leadership <ArrowRight className="size-4" aria-hidden="true" />
                </button>
              </aside>
            </div>
          ) : null}
          {view === "leadership" ? (
            <section className="mt-8" aria-labelledby="world-leadership-title">
              <Kicker>Institutional offices</Kicker>
              <h2 id="world-leadership-title" className="mt-2 text-2xl font-semibold">Leadership</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Only recorded current office terms appear below. Empty offices are not assigned fictional holders.</p>
              {verifiedProjection.offices.length ? (
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  {verifiedProjection.offices.map((office) => (
                    <article key={office.id} className="rounded-xl border border-border p-5">
                      <p className="text-xs text-muted-foreground">{office.title}</p>
                      <h3 className="mt-2 text-lg font-semibold">{office.currentTerm?.holderDisplayName ?? "Vacant or unrecorded"}</h3>
                      {office.currentTerm ? <p className="mt-2 text-sm text-muted-foreground">Current recorded term</p> : <p className="mt-2 text-sm text-muted-foreground">No current official is listed.</p>}
                    </article>
                  ))}
                </div>
              ) : <p className="mt-6 text-sm text-muted-foreground">No public leadership offices have been recorded.</p>}
            </section>
          ) : null}
          {view === "members" ? (
            <section className="mt-8" aria-labelledby="world-members-title">
              <Kicker>Membership</Kicker>
              <h2 id="world-members-title" className="mt-2 flex items-center gap-2 text-2xl font-semibold"><Users className="size-5" aria-hidden="true" /> Member countries</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">Current institutional memberships. Historical terms remain recorded by the governance system.</p>
              {!(countries.isError || countries.isRefetchError) &&
                (countries.isPending || countries.isFetching) && countryIds.length
                ? <div className="mt-6"><LoadingWorld label="Verifying member countries" /></div> : null}
              {countries.isError || countries.isRefetchError
                ? <div className="mt-6"><QueryFailure message="Member country labels could not be verified." retry={() => void countries.refetch()} /></div> : null}
              {!currentMembers.length ? <p className="mt-6 rounded-xl border border-border px-5 py-7 text-sm text-muted-foreground">No current memberships have been recorded. This does not imply the institution has no historical members.</p> : null}
              {worldPublicQueryVerified(countries) && currentMembers.length ? (
                <div className="mt-5 divide-y divide-border" aria-label="Current member countries">
                  {visibleMembers.map((member) => {
                    const country = countryMap.get(member.countryId);
                    return (
                      <div key={member.id} className="flex min-h-16 items-center gap-3 py-3">
                        {country ? <FlagChip code={country.short_code} color={country.accent_color || "#426ba6"} image={country.flag_image} size="sm" /> : <span className="size-9 shrink-0 rounded-lg bg-muted" aria-hidden="true" />}
                        <div className="min-w-0 flex-1">
                          {country ? <Link to="/countries/$code" params={{ code: country.short_code.toLowerCase() }} className="font-medium hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2">{country.name}</Link> :
                            <span className="font-medium">Country identity unavailable</span>}
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            {representativesByCountry.get(member.countryId)?.displayName
                              ? `Representative: ${representativesByCountry.get(member.countryId)?.displayName}`
                              : "Representative not recorded"}
                          </p>
                          {officesByCountry.get(member.countryId)?.length ? (
                            <p className="text-xs leading-5 text-muted-foreground">Office: {officesByCountry.get(member.countryId)?.join(", ")}</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-xs capitalize text-muted-foreground">{member.status}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {currentMembers.length > WORLD_MEMBER_PAGE_SIZE ? (
                <nav aria-label="Member country pages" className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-5">
                  <button type="button" disabled={memberPage === 0}
                    onClick={() => setMemberPage((page) => Math.max(0, page - 1))}
                    className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-40">
                    Previous
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Page {memberPage + 1} of {Math.ceil(currentMembers.length / WORLD_MEMBER_PAGE_SIZE)}
                  </span>
                  <button type="button" disabled={(memberPage + 1) * WORLD_MEMBER_PAGE_SIZE >= currentMembers.length}
                    onClick={() => setMemberPage((page) => page + 1)}
                    className="min-h-11 rounded-xl border border-border px-4 text-sm font-medium disabled:opacity-40">
                    Next
                  </button>
                </nav>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </PublicFrame>
  );
}
