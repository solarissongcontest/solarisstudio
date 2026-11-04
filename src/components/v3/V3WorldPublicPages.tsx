import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, Globe2, Search, Users, Vote } from "lucide-react";
import { useState, type FormEvent } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  currentWorldMembers, normalizeWorldSearch, pageWorldMembers,
  parseWorldDirectory, parseWorldOrganization,
  type WorldMembership, type WorldOrganization, type WorldOrganizationDetail,
} from "@/lib/v3-world-public";

const DIRECTORY_PAGE_SIZE = 24;
type WorldStatus = "all" | WorldOrganization["status"];
type WorldSection = "overview" | "leadership" | "members";
const STATUS_FILTERS: { value: WorldStatus; label: string }[] = [
  { value: "all", label: "All public institutions" },
  { value: "active", label: "Active" },
  { value: "recognized", label: "Recognized" },
  { value: "proposed", label: "Proposed" },
  { value: "suspended", label: "Suspended" },
  { value: "historical", label: "Historical" },
  { value: "dissolved", label: "Dissolved" },
];

async function fetchWorldDirectory(search: string, status: WorldStatus, page: number) {
  // This query is subject to world_organizations_public_read RLS from TG2.
  // No service key, private member data or whole-table download.
  let query = (supabase as any).from("world_organizations")
    .select("id,slug,official_name,short_name,type,description,status", { count: "exact" })
    .eq("public_visibility", "public")
    .order("official_name", { ascending: true });
  if (search) {
    // Normalization removes commas/parentheses/dots that alter PostgREST or() grammar.
    query = query.or(`official_name.ilike.%${search}%,short_name.ilike.%${search}%`);
  }
  if (status !== "all") query = query.eq("status", status);
  const { data, error, count } = await query.range(
    page * DIRECTORY_PAGE_SIZE,
    (page + 1) * DIRECTORY_PAGE_SIZE - 1,
  );
  if (error) throw error;
  if (count == null || !Number.isSafeInteger(count)) {
    throw new Error("Institution list count unavailable");
  }
  return { items: parseWorldDirectory(data), total: count };
}

function WorldError({ onRetry, message }: { onRetry: () => void; message: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">Institution data is unavailable</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      <button type="button" onClick={onRetry}
        className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2">
        Try again
      </button>
    </div>
  );
}

function WorldLoading() {
  return (
    <div role="status" aria-label="Loading public institutions" className="space-y-3">
      {[0, 1, 2].map((item) => (
        <div key={item} aria-hidden="true" className="h-20 animate-pulse rounded-xl bg-muted/50 motion-reduce:animate-none" />
      ))}
      <span className="sr-only">Loading public institutions</span>
    </div>
  );
}

function OrganizationRow({ item }: { item: WorldOrganization }) {
  return (
    <Link to={`/world/organizations/${item.slug}` as any}
      className="group flex min-h-20 items-center gap-4 border-b border-border/65 py-4 last:border-b-0 focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2">
      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Building2 className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground group-hover:text-primary">{item.shortName}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{item.status}</span>
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">{item.name}</span>
        {item.description ? <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{item.description}</span> : null}
      </span>
      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

function DirectoryContent({ compact = false }: { compact?: boolean }) {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WorldStatus>("all");
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["world", "public-organizations", search, status, page],
    queryFn: () => fetchWorldDirectory(search, status, page),
    staleTime: 90_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setSearch(normalizeWorldSearch(input));
  }
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  return (
    <section aria-label="Public institutions" className="space-y-5">
      {!compact ? (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <label className="relative block">
            <span className="sr-only">Search institutions</span>
            <Search aria-hidden="true" className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
            <input value={input} onChange={(event) => setInput(event.target.value)}
              maxLength={80} placeholder="Find an organization" autoComplete="off"
              className="min-h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-primary" />
          </label>
          <label className="sr-only" htmlFor="world-status-filter">Organization status</label>
          <select id="world-status-filter" value={status}
            onChange={(event) => { setStatus(event.target.value as WorldStatus); setPage(0); }}
            className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
            {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button type="submit" className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Search</button>
        </form>
      ) : null}
      {query.isPending ? <WorldLoading /> : query.isError
        ? <WorldError onRetry={() => { void query.refetch(); }} message="The public governance service could not load. No historical or membership information has been guessed." />
        : query.data.items.length === 0
          ? <div className="border-t border-border py-8 text-sm text-muted-foreground">No public institutions match these filters.</div>
          : <div className="divide-y-0 border-t border-border">{query.data.items.map((item) => <OrganizationRow key={item.id} item={item} />)}</div>}
      {!compact && query.isSuccess ? (
        <nav aria-label="Institution directory pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">
            {total === 0 ? "0 institutions" : `Showing ${page * DIRECTORY_PAGE_SIZE + 1}–${Math.min((page + 1) * DIRECTORY_PAGE_SIZE, total)} of ${total}`}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((n) => Math.max(0, n - 1))}
              className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:cursor-not-allowed disabled:opacity-35">Previous</button>
            <span className="text-xs text-muted-foreground">Page {page + 1} of {pages}</span>
            <button type="button" disabled={page + 1 >= pages} onClick={() => setPage((n) => n + 1)}
              className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:cursor-not-allowed disabled:opacity-35">Next</button>
          </div>
        </nav>
      ) : null}
    </section>
  );
}

export function WorldLandingPage() {
  return (
    <AppShell>
      <PageHeader eyebrow="Explore Solaris" title="Terra Solaris"
        description="The institutions and public life of the wider Solaris world. Official membership, leadership and documents are shown only when the authoritative system makes them public." />
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 pb-28 sm:px-6">
        <div className="grid gap-5 border-b border-border pb-7 md:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">World institutions</p>
            <h2 className="mt-2 max-w-xl text-3xl font-bold tracking-tight sm:text-4xl">Explore beyond the contest.</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
              Discover recognized international organizations, their public leadership and member countries.
              Informal roleplay does not become official history simply because it is mentioned here.
            </p>
            <Link to="/world/organizations/" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Browse organizations <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          <div className="flex items-center justify-center rounded-2xl border border-border bg-surface p-8" aria-hidden="true">
            <Globe2 className="size-20 text-primary/65" strokeWidth={1.2} />
          </div>
        </div>
        <div className="max-w-4xl">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-lg font-bold">Public organizations</h2>
            <Link to="/world/organizations/" className="min-h-11 content-center text-sm font-semibold text-primary">View directory</Link>
          </div>
          <DirectoryContent compact />
        </div>
      </div>
    </AppShell>
  );
}

export function WorldOrganizationsDirectoryPage() {
  return (
    <AppShell>
      <PageHeader eyebrow="Terra Solaris" title="Organizations"
        description="Search public international institutions. Private bodies and unapproved membership information are not part of this directory." />
      <div className="mx-auto w-full max-w-5xl px-4 pb-28 sm:px-6">
        <Link to="/world/" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Terra Solaris
        </Link>
        <DirectoryContent />
      </div>
    </AppShell>
  );
}

function OrganizationTabs({ slug, active }: { slug: string; active: WorldSection }) {
  const tabs: { key: WorldSection; label: string; url: string }[] = [
    { key: "overview", label: "Overview", url: `/world/organizations/${slug}` },
    { key: "leadership", label: "Leadership", url: `/world/organizations/${slug}/leadership` },
    { key: "members", label: "Members", url: `/world/organizations/${slug}/members` },
  ];
  return (
    <nav aria-label="Organization sections" className="mb-7 flex gap-2 overflow-x-auto border-b border-border pb-2">
      {tabs.map((tab) => (
        <Link key={tab.key} to={tab.url as any} aria-current={active === tab.key ? "page" : undefined}
          className={`inline-flex min-h-11 shrink-0 items-center rounded-xl px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${active === tab.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function Overview({ detail }: { detail: WorldOrganizationDetail }) {
  const offices = detail.offices.filter((office) => office.currentTerm != null);
  const members = currentWorldMembers(detail.memberships);
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="space-y-9">
        <section>
          <h2 className="text-xl font-bold">About this institution</h2>
          <p className="mt-3 max-w-prose text-sm leading-7 text-muted-foreground">
            {detail.organization.description ?? "No official public description has been published."}
          </p>
        </section>
        <section>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Leadership</h2>
            <Link to={`/world/organizations/${detail.organization.slug}/leadership` as any} className="min-h-11 content-center text-sm text-primary">All offices</Link>
          </div>
          {offices.length ? (
            <div className="mt-2 divide-y divide-border border-t border-border">
              {offices.slice(0, 3).map((office) => (
                <div key={office.id} className="flex justify-between gap-4 py-4">
                  <span className="text-sm font-medium">{office.title}</span>
                  <span className="text-right text-sm text-muted-foreground">{office.currentTerm?.holderDisplayName}</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-muted-foreground">No current public officeholders are recorded.</p>}
        </section>
        <section>
          <h2 className="text-xl font-bold">Institutional bodies</h2>
          {detail.organs.length ? (
            <div className="mt-3 divide-y divide-border border-t border-border">
              {detail.organs.slice(0, 4).map((organ) => (
                <div key={organ.id} className="flex justify-between gap-4 py-3 text-sm">
                  <span className="font-medium">{organ.name}</span>
                  <span className="text-muted-foreground">{organ.status}</span>
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-sm text-muted-foreground">No public institutional bodies have been listed.</p>}
        </section>
      </div>
      <aside className="space-y-5 lg:border-l lg:border-border lg:pl-6">
        <div className="border-b border-border pb-5">
          <Users aria-hidden="true" className="size-5 text-primary" />
          <p className="mt-2 text-3xl font-bold tabular-nums">{members.length}</p>
          <p className="text-sm text-muted-foreground">Current recorded memberships, including suspended</p>
          <Link to={`/world/organizations/${detail.organization.slug}/members` as any}
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
            View members <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        <p className="text-xs leading-6 text-muted-foreground">
          Official voting, elections and legal decisions belong to their own governed workflows.
          This page does not infer them from membership or office labels.
        </p>
      </aside>
    </div>
  );
}

function Leadership({ detail }: { detail: WorldOrganizationDetail }) {
  return (
    <section>
      <h2 className="text-xl font-bold">Current leadership and offices</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Only canonically recorded current terms appear. Unfilled posts are explicitly unfilled.
      </p>
      {detail.offices.length ? (
        <div className="mt-5 grid gap-x-8 sm:grid-cols-2">
          {detail.offices.map((office) => (
            <article key={office.id} className="border-t border-border py-5">
              <p className="text-xs font-bold uppercase tracking-wide text-primary">{office.title}</p>
              <h3 className="mt-2 text-lg font-semibold">{office.currentTerm?.holderDisplayName ?? "No active officeholder"}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {office.currentTerm ? `Term: ${office.currentTerm.termKind}` : "An appointment or election has not been recorded."}
              </p>
              {office.currentTerm ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Start recorded: <time dateTime={office.currentTerm.startsAt}>{new Date(office.currentTerm.startsAt).toLocaleDateString()}</time>
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : <p className="mt-5 text-sm text-muted-foreground">No public offices are configured.</p>}
    </section>
  );
}

type CountryRecord = { id: string; name: string; shortCode: string | null };
function countryRows(raw: unknown, allowed: ReadonlySet<string>): Map<string, CountryRecord> {
  if (!Array.isArray(raw)) throw new Error("Invalid country identity projection");
  const records = new Map<string, CountryRecord>();
  for (const item of raw) {
    if (!item || typeof item !== "object") throw new Error("Invalid country identity row");
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || !allowed.has(row.id) || typeof row.name !== "string") {
      throw new Error("Country identity scope mismatch");
    }
    records.set(row.id, {
      id: row.id, name: row.name,
      shortCode: typeof row.short_code === "string" && /^[a-zA-Z0-9]{2,6}$/.test(row.short_code) ? row.short_code : null,
    });
  }
  return records;
}

function MemberRow({ membership, country }: { membership: WorldMembership; country?: CountryRecord }) {
  return (
    <li className="flex min-h-16 items-center justify-between gap-3 border-b border-border py-3">
      <div className="min-w-0">
        {country?.shortCode ? (
          <Link to={`/countries/${country.shortCode}` as any} className="font-semibold hover:text-primary">
            {country.name}
          </Link>
        ) : <span className="font-semibold">{country?.name ?? "Country details unavailable"}</span>}
        <p className="mt-1 text-xs text-muted-foreground">{membership.membershipType}</p>
      </div>
      <span className={`shrink-0 rounded-lg px-2 py-1 text-xs ${membership.status === "suspended" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"}`}>
        {membership.status}
      </span>
    </li>
  );
}

function Members({ detail }: { detail: WorldOrganizationDetail }) {
  const [page, setPage] = useState(0);
  const all = currentWorldMembers(detail.memberships);
  const current = pageWorldMembers(all, page);
  const ids = current.items.map((member) => member.countryId);
  const query = useQuery({
    queryKey: ["world", "member-country-names", ids.join("|")],
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("countries").select("id,name,short_code").in("id", ids).limit(ids.length);
      if (error) throw error;
      return countryRows(data, new Set(ids));
    },
  });
  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Member countries</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {current.total} current recorded memberships. Suspended memberships remain visible as suspended.
          </p>
        </div>
        <Users aria-hidden="true" className="size-6 text-primary" />
      </div>
      {current.total === 0 ? <p className="mt-7 text-sm text-muted-foreground">No public member countries are recorded.</p>
        : query.isPending ? <div className="mt-5"><WorldLoading /></div>
        : query.isError ? <div className="mt-5"><WorldError onRetry={() => { void query.refetch(); }} message="Country names could not be verified. The page will not invent names or flags." /></div>
        : <ul className="mt-5 border-t border-border">{current.items.map((item) => (
            <MemberRow key={item.id} membership={item} country={query.data.get(item.countryId)} />
          ))}</ul>}
      {current.pages > 1 ? (
        <nav aria-label="Member pages" className="mt-6 flex items-center justify-between gap-3">
          <button type="button" disabled={current.page === 0} onClick={() => setPage(current.page - 1)}
            className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-35">Previous</button>
          <span className="text-xs text-muted-foreground">Page {current.page + 1} of {current.pages}</span>
          <button type="button" disabled={current.page + 1 >= current.pages} onClick={() => setPage(current.page + 1)}
            className="min-h-11 rounded-xl border border-border px-4 text-sm disabled:opacity-35">Next</button>
        </nav>
      ) : null}
    </section>
  );
}

export function WorldOrganizationPage({ slug, section }: { slug: string; section: WorldSection }) {
  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  const query = useQuery({
    queryKey: ["world", "public-organization", slug],
    enabled: valid,
    staleTime: 90_000,
    retry: 1,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc("world_organization_projection_v1", { p_slug: slug });
      if (error) throw error;
      return parseWorldOrganization(data, slug);
    },
  });
  const detail = query.data;
  return (
    <AppShell>
      <PageHeader eyebrow="Terra Solaris · Institution"
        title={detail?.organization.shortName ?? "Organization"}
        description={detail?.organization.name ?? "Public institutional record"} />
      <div className="mx-auto w-full max-w-6xl px-4 pb-28 sm:px-6">
        <Link to="/world/organizations/" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="size-4" /> All organizations
        </Link>
        {!valid || (query.isSuccess && !detail)
          ? <div role="status" className="py-8 text-sm text-muted-foreground">This institution is not publicly available.</div>
          : query.isPending ? <WorldLoading />
          : query.isError ? <WorldError onRetry={() => { void query.refetch(); }} message="The authoritative public organization projection could not be verified." />
          : detail ? (
            <>
              <div className="mb-6 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize">{detail.organization.status}</span>
                <span className="text-xs text-muted-foreground">Public institutional record</span>
              </div>
              <OrganizationTabs slug={detail.organization.slug} active={section} />
              {section === "overview" ? <Overview detail={detail} /> : section === "leadership"
                ? <Leadership detail={detail} /> : <Members detail={detail} />}
            </>
          ) : null}
      </div>
    </AppShell>
  );
}
