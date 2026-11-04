import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, ChevronRight, Globe2, Search, Users } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";

import {
  loadWorldMemberCountries, loadWorldOrganization, loadWorldOrganizations,
} from "@/integrations/terra-world-public";
import {
  WORLD_MEMBERS_PAGE_SIZE, currentWorldMembers, normalizedWorldSearch,
  type WorldDirectoryFilter, type WorldOrganizationDetail,
} from "@/lib/terra-world-public";
import { V3Screen, V3ScreenHeader, V3Section, V3StatusChip } from "./V3Foundation";

const FILTERS: ReadonlyArray<{ id: WorldDirectoryFilter; label: string }> = [
  { id: "all", label: "All" }, { id: "active", label: "Active" },
  { id: "recognized", label: "Recognized" }, { id: "historical", label: "Historical" },
];

function PublicState({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return <div className="rounded-2xl border border-border/70 bg-surface/40 px-5 py-9 text-center">
    <Building2 className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
    <h2 className="mt-3 text-lg font-semibold">{title}</h2>
    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{detail}</p>
    {retry ? <button type="button" onClick={retry}
      className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Try again</button> : null}
  </div>;
}
function Status({ value }: { value: string }) {
  return <V3StatusChip tone={value === "active" ? "success" : "neutral"}>{value.replaceAll("_", " ")}</V3StatusChip>;
}
function Emblem({ url }: { url: string | null }) {
  return <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface/70">
    {url ? <img src={url} alt="" loading="lazy" className="size-full object-contain" /> :
      <Globe2 aria-hidden="true" className="size-5 text-muted-foreground" />}
  </span>;
}

export function V3WorldOrganizationsDirectory() {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<WorldDirectoryFilter>("all");
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["v3-world-organizations", search, filter, page],
    queryFn: () => loadWorldOrganizations({ page, search, status: filter }),
    staleTime: 60_000, retry: false,
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch(normalizedWorldSearch(draft)); setPage(0);
  };
  return <V3Screen>
    <V3ScreenHeader kicker="Terra Solaris · Institutions" title="Organizations"
      description="Discover public institutions, their mandates, leadership and confirmed members. Unpublished governance remains private." />
    <form role="search" onSubmit={submit} className="mb-5 flex max-w-2xl gap-2">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search organizations by name or abbreviation</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={draft} maxLength={64} onChange={(event) => setDraft(event.target.value)}
          placeholder="Name or abbreviation" className="min-h-11 w-full rounded-xl border border-border bg-surface pl-10 pr-3 text-sm text-foreground" />
      </label>
      <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Search</button>
    </form>
    <div role="group" aria-label="Organization status" className="mb-6 flex flex-wrap gap-2">
      {FILTERS.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id}
        onClick={() => { setFilter(item.id); setPage(0); }}
        className={"min-h-11 rounded-full border px-4 text-sm font-semibold " +
          (filter === item.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
        {item.label}
      </button>)}
    </div>
    {query.isPending ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading published organizations…</p> :
      query.isError ? <PublicState title="Organizations unavailable" detail="The public institutional directory could not be loaded. Private or local placeholder records are not substituted." retry={() => void query.refetch()} /> :
      query.data.rows.length === 0 ? <PublicState title="No organizations in this view" detail="Try another status or search. Only explicitly public organizations appear here." /> :
      <V3Section title={search ? "Search results" : "Public institutions"} meta={query.data.rows.length + " shown"}>
        <div className="divide-y divide-border/70">
          {query.data.rows.map((item) =>
            <Link key={item.id} to={("/world/organizations/" + item.slug) as any}
              className="group flex min-h-[88px] items-center gap-4 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <Emblem url={item.emblemUrl} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold group-hover:text-primary">{item.shortName}</span>
                  <Status value={item.status} />
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{item.name}</span>
                {item.description ? <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</span> : null}
              </span>
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            </Link>)}
        </div>
        {(page > 0 || query.data.hasNext) ? <nav aria-label="Organization pages" className="mt-6 flex items-center justify-between gap-3">
          <button type="button" disabled={page === 0} onClick={() => setPage((n) => Math.max(0, n - 1))}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-40">
            <ArrowLeft aria-hidden="true" className="size-4" /> Previous
          </button>
          <span className="text-sm text-muted-foreground">Page {page + 1}</span>
          <button type="button" disabled={!query.data.hasNext} onClick={() => setPage((n) => n + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-40">
            Next <ArrowRight aria-hidden="true" className="size-4" />
          </button>
        </nav> : null}
      </V3Section>}
  </V3Screen>;
}

type Section = "overview" | "leadership" | "members";
const SECTIONS: readonly { id: Section; name: string }[] = [
  { id: "overview", name: "Overview" }, { id: "leadership", name: "Leadership" }, { id: "members", name: "Members" },
];

function Offices({ data, preview }: { data: WorldOrganizationDetail; preview: boolean }) {
  const offices = preview ? data.offices.slice(0, 3) : data.offices;
  return <V3Section title="Leadership" meta={preview ? "Current offices" : undefined}>
    {!offices.length ? <p className="py-4 text-sm text-muted-foreground">No public offices are configured.</p> :
      <div className="divide-y divide-border/70">
        {offices.map((office) => <article key={office.id} className="flex flex-col gap-1 py-4 sm:flex-row sm:justify-between sm:gap-5">
          <p className="font-semibold">{office.title}</p>
          <p className="text-sm text-muted-foreground">
            {office.currentHolder ?? "No current officeholder recorded"}
            {office.termLengthEditions ? <span className="ml-2 text-xs">· Default {office.termLengthEditions} SSC editions</span> : null}
          </p>
        </article>)}
      </div>}
  </V3Section>;
}

function Members({ data }: { data: WorldOrganizationDetail }) {
  const members = useMemo(() => currentWorldMembers(data.members), [data.members]);
  const [page, setPage] = useState(0);
  const shown = members.slice(page * WORLD_MEMBERS_PAGE_SIZE, (page + 1) * WORLD_MEMBERS_PAGE_SIZE);
  const ids = shown.map((member) => member.countryId);
  const query = useQuery({
    queryKey: ["v3-world-member-countries", data.organization.id, ids.join(",")],
    queryFn: () => loadWorldMemberCountries(ids),
    enabled: ids.length > 0, staleTime: 60_000, retry: false,
  });
  const countries = new Map((query.data ?? []).map((country) => [country.id, country]));
  return <V3Section title="Confirmed membership" meta={members.length + " current"}>
    {members.length === 0 ? <PublicState title="No confirmed members" detail="There are no current memberships in the canonical institutional register. Contest participation cannot be used to invent them." /> :
      query.isPending ? <p role="status" className="py-8 text-sm text-muted-foreground">Loading member identities…</p> :
      query.isError ? <PublicState title="Country identities unavailable" detail="The published membership exists, but its country names could not be resolved." retry={() => void query.refetch()} /> :
      <>
        <div className="divide-y divide-border/70">
          {shown.map((member) => {
            const country = countries.get(member.countryId);
            return <div key={member.id} className="flex min-h-16 items-center gap-3 py-3">
              {country?.flagUrl ? <img src={country.flagUrl} alt="" loading="lazy"
                className="aspect-[3/2] h-9 w-[54px] shrink-0 rounded object-cover" /> :
                <span aria-hidden="true" className="grid h-9 w-[54px] shrink-0 place-items-center rounded border border-border"><Globe2 className="size-4" /></span>}
              <span className="min-w-0 flex-1">{country ?
                <Link to={("/countries/" + encodeURIComponent(country.shortCode)) as any}
                  className="font-semibold hover:text-primary hover:underline">{country.name}</Link> :
                <span className="font-semibold">Country identity unavailable</span>}</span>
              <span className="text-xs capitalize text-muted-foreground">{member.status}</span>
            </div>;
          })}
        </div>
        {members.length > WORLD_MEMBERS_PAGE_SIZE ? <nav aria-label="Member pages" className="mt-5 flex items-center justify-between gap-3">
          <button type="button" disabled={page === 0} onClick={() => setPage((n) => Math.max(0, n - 1))}
            className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-40">Previous</button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(members.length / WORLD_MEMBERS_PAGE_SIZE)}</span>
          <button type="button" disabled={(page + 1) * WORLD_MEMBERS_PAGE_SIZE >= members.length}
            onClick={() => setPage((n) => n + 1)}
            className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold disabled:opacity-40">Next</button>
        </nav> : null}
      </>}
  </V3Section>;
}

export function V3WorldOrganizationDetail({ slug }: { slug: string }) {
  const [section, setSection] = useState<Section>("overview");
  const validSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
  const query = useQuery({
    queryKey: ["v3-world-organization", slug],
    queryFn: () => loadWorldOrganization(slug),
    enabled: validSlug, staleTime: 60_000, retry: false,
  });
  return <V3Screen>
    <Link to={"/world/organizations" as any}
      className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
      <ArrowLeft aria-hidden="true" className="size-4" /> All organizations
    </Link>
    {!validSlug ? <PublicState title="Invalid organization address" detail="This organization address is not valid." /> :
      query.isPending ? <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading public institutional profile…</p> :
      query.isError ? <PublicState title="Institutional profile unavailable" detail="The public projection could not be verified; no private or cached role data is substituted." retry={() => void query.refetch()} /> :
      !query.data ? <PublicState title="Organization not found" detail="This organization does not have a public profile at this address." /> :
      <>
        <header className="mb-7 border-b border-border/60 pb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Terra Solaris institution</p>
          <div className="mt-4 flex items-start gap-4">
            <Emblem url={query.data.organization.emblemUrl} />
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{query.data.organization.shortName}</h1>
              <p className="mt-2 text-base text-muted-foreground">{query.data.organization.name}</p>
              <div className="mt-3"><Status value={query.data.organization.status} /></div>
            </div>
          </div>
          {query.data.organization.description ? <p className="mt-5 max-w-3xl text-sm leading-7 text-muted-foreground">{query.data.organization.description}</p> : null}
        </header>
        <nav aria-label="Organization sections" className="mb-8 flex gap-2 overflow-x-auto pb-1">
          {SECTIONS.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)}
            aria-current={section === item.id ? "page" : undefined}
            className={"min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold " +
              (section === item.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}>{item.name}</button>)}
        </nav>
        {section === "overview" ? <>
          <div className="mb-8 grid gap-4 border-y border-border/70 py-5 sm:grid-cols-2">
            <div className="flex items-center gap-3"><Users aria-hidden="true" className="size-5 text-muted-foreground" />
              <div><p className="text-2xl font-bold">{currentWorldMembers(query.data.members).length}</p>
                <p className="text-xs text-muted-foreground">Recorded current memberships</p></div></div>
            <div className="flex items-center gap-3"><Building2 aria-hidden="true" className="size-5 text-muted-foreground" />
              <div><p className="text-2xl font-bold">{query.data.organs.length}</p>
                <p className="text-xs text-muted-foreground">Public institutional bodies</p></div></div>
          </div>
          <Offices data={query.data} preview />
          <V3Section title="Institutional bodies" meta="Public">
            {!query.data.organs.length ? <p className="py-4 text-sm text-muted-foreground">No public bodies registered.</p> :
              <div className="divide-y divide-border/70">
                {query.data.organs.slice(0, 4).map((item) => <article key={item.id} className="py-4">
                  <p className="font-semibold">{item.name}</p>
                  <p className="mt-1 text-sm capitalize text-muted-foreground">{item.type.replaceAll("_", " ")}</p>
                </article>)}
              </div>}
          </V3Section>
        </> : section === "leadership" ? <Offices data={query.data} preview={false} /> : <Members data={query.data} />}
      </>}
  </V3Screen>;
}
