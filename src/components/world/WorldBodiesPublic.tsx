import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import {
  WORLD_BODIES_PAGE_SIZE, WORLD_BODY_OFFICE_LIMIT, cleanWorldBodySearch, readPublicWorldBodies, readPublicWorldBody, readPublicBodyOffices, validWorldSlug,
  type PublicWorldInstitution, type WorldBodyStatusFilter,
} from "@/lib/terra-world-bodies-public";

function Frame({ children }: { children: ReactNode }) {
  const { platformResolved, isAppMode } = useSolarisApp();
  if (!platformResolved) return <div role="status" aria-label="Opening Terra Solaris" className="min-h-20" />;
  return <AppShell><main className={"mx-auto w-full pb-28 " +
    (isAppMode ? "max-w-2xl px-3 pt-3" : "max-w-6xl px-4 pt-6 sm:px-6 sm:pt-8")}>
    {children}
  </main></AppShell>;
}

function Back({ institution }: { institution?: PublicWorldInstitution }) {
  return <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
    {institution ? <Link to="/world/organizations/$slug" params={{ slug: institution.slug }}
      search={{ tab: "overview" }} className="inline-flex min-h-11 items-center gap-2 hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden="true" /> {institution.shortName}
    </Link> : <Link to="/world/organizations" className="inline-flex min-h-11 items-center gap-2">
      <ArrowLeft className="size-4" aria-hidden="true" /> Organizations
    </Link>}
  </nav>;
}

function Loading() {
  return <div role="status" aria-busy="true" aria-label="Loading published institution records"
    className="space-y-4"><div className="h-8 w-48 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
    <div className="h-28 max-w-2xl animate-pulse rounded-xl bg-muted motion-reduce:animate-none" /></div>;
}
function Unavailable({ retry, missing }: { retry?: () => void; missing?: boolean }) {
  return <section role={missing ? undefined : "alert"} className="max-w-2xl border-t border-border pt-7">
    <h1 className="text-2xl font-semibold">{missing ? "Public record not found" : "Cannot verify public records"}</h1>
    <p className="mt-3 text-sm leading-6 text-muted-foreground">
      This institution or body may not exist, may be unpublished, or may be temporarily unavailable.
      Restricted institutional information is never displayed.
    </p>
    {retry ? <button type="button" onClick={retry} className="mt-5 min-h-11 rounded-xl border border-border px-5 font-semibold">
      Try again
    </button> : null}
  </section>;
}

export function WorldBodiesDirectory({ slug }: { slug: string }) {
  const [page, setPage] = useState(0);
  const [input, setInput] = useState("");
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState<WorldBodyStatusFilter>("all");
  const valid = validWorldSlug(slug);
  const query = useQuery({
    queryKey: ["world", "public", "bodies", slug, term, status, page],
    queryFn: () => readPublicWorldBodies(slug, page, { term, status }),
    enabled: valid,
    staleTime: 90_000,
    retry: false,
  });
  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = cleanWorldBodySearch(input);
    setInput(cleaned);
    setTerm(cleaned);
    setPage(0);
  }
  function clearFilters() {
    setInput("");
    setTerm("");
    setStatus("all");
    setPage(0);
  }
  const result = query.data;
  return <Frame>
    <Back institution={result?.organization} />
    {!valid ? <Unavailable missing /> : null}
    {valid && query.isPending ? <Loading /> : null}
    {query.isError ? <Unavailable retry={() => void query.refetch()} /> : null}
    {query.isSuccess && !result ? <Unavailable missing /> : null}
    {result ? <>
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{result.organization.shortName} · Governance</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">Institutional bodies</h1>
        <p className="mt-3 leading-7 text-muted-foreground">Public assemblies, committees and other organs of {result.organization.officialName}.</p>
      </header>
      <form onSubmit={applySearch} className="mt-8 flex max-w-4xl flex-wrap items-stretch gap-3 border-y border-border py-5" role="search">
        <label className="flex min-h-12 min-w-[12rem] flex-1 items-center gap-3 rounded-xl border border-border bg-background px-4 focus-within:ring-2 focus-within:ring-ring">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search public bodies by name</span>
          <input type="search" value={input} maxLength={64} onChange={(event) => setInput(event.target.value)}
            placeholder="Search assemblies and committees" className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </label>
        <label className="min-w-[10rem] text-sm">
          <span className="sr-only">Public body status</span>
          <select value={status} onChange={(event) => { setStatus(event.target.value as WorldBodyStatusFilter); setPage(0); }}
            className="min-h-12 w-full rounded-xl border border-border bg-background px-4 text-foreground focus-visible:outline focus-visible:outline-2">
            <option value="all">All published</option>
            <option value="active">Active bodies</option>
            <option value="historical">Historical bodies</option>
          </select>
        </label>
        <button type="submit" className="min-h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">Search</button>
        {term || status !== "all" ? <button type="button" onClick={clearFilters}
          className="min-h-12 rounded-xl border border-border px-4 text-sm font-medium">Clear</button> : null}
      </form>
      <section aria-label="Published institutional bodies" className="mt-4 max-w-4xl">
        <p className="py-4 text-sm text-muted-foreground" aria-live="polite">{result.total} matching public {result.total === 1 ? "body" : "bodies"}</p>
        {result.bodies.length === 0 ? <p className="py-6 text-sm text-muted-foreground">
          {term || status !== "all" ? "No matching public bodies. Try another name or status." : "No public bodies are recorded."}
        </p> : null}
        {result.bodies.map((body) => <Link key={body.id} to="/world/organizations/$slug/bodies/$bodySlug"
          params={{ slug, bodySlug: body.slug }}
          className="group flex min-h-20 items-center gap-4 border-b border-border py-4 focus-visible:rounded-md focus-visible:outline focus-visible:outline-2">
          <span className="min-w-0 flex-1"><span className="block font-semibold group-hover:underline">{body.name}</span>
            <span className="mt-1 block text-sm capitalize text-muted-foreground">{body.type.replace(/_/g, " ")} · {body.status}</span>
          </span><ArrowRight className="size-4 shrink-0" aria-hidden="true" /></Link>)}
        {result.total > WORLD_BODIES_PAGE_SIZE ? <nav aria-label="Body pages" className="mt-6 flex items-center justify-between gap-2">
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-40">Previous</button>
          <span className="text-xs">Page {page + 1} of {Math.ceil(result.total / WORLD_BODIES_PAGE_SIZE)}</span>
          <button type="button" disabled={(page + 1) * WORLD_BODIES_PAGE_SIZE >= result.total}
            onClick={() => setPage((p) => p + 1)}
            className="min-h-11 rounded-xl border border-border px-4 disabled:opacity-40">Next</button>
        </nav> : null}
      </section>
    </> : null}
  </Frame>;
}

export function WorldBodyDetails({ slug, bodySlug }: { slug: string; bodySlug: string }) {
  const valid = validWorldSlug(slug) && validWorldSlug(bodySlug);
  const query = useQuery({
    queryKey: ["world", "public", "body", slug, bodySlug],
    queryFn: () => readPublicWorldBody(slug, bodySlug), enabled: valid, staleTime: 90_000, retry: false,
  });
  const result = query.data;
  const offices = useQuery({
    queryKey: ["world", "public", "body-offices", result?.organization.id, result?.body.id],
    queryFn: () => readPublicBodyOffices(result!.organization, result!.body),
    enabled: !!result,
    staleTime: 90_000,
    retry: false,
  });
  return <Frame>
    <Back institution={result?.organization} />
    {!valid ? <Unavailable missing /> : null}
    {valid && query.isPending ? <Loading /> : null}
    {query.isError ? <Unavailable retry={() => void query.refetch()} /> : null}
    {query.isSuccess && !result ? <Unavailable missing /> : null}
    {result ? <>
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{result.organization.shortName} · Institutional body</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">{result.body.name}</h1>
        <p className="mt-4 text-sm capitalize text-muted-foreground">{result.body.type.replace(/_/g, " ")} · {result.body.status}</p>
      </header>
      <div className="mt-8 grid gap-8 border-t border-border pt-7 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <section className="max-w-2xl"><h2 className="text-xl font-semibold">About this body</h2>
          <p className="mt-4 whitespace-pre-line leading-7 text-muted-foreground">
            {result.body.description || "An official description has not been published."}
          </p>
          <Link to="/world/organizations/$slug/bodies/" params={{ slug }}
            className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
            All public bodies <ArrowRight className="size-4" aria-hidden="true" /></Link>
        </section>
        <aside className="border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h2 className="font-semibold">Offices of this body</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Public institutional offices only. Private terms and unpublished appointments are excluded.
          </p>
          {offices.isPending ? <p role="status" className="mt-4 text-sm text-muted-foreground">Checking offices…</p> : null}
          {offices.isError ? <div role="alert" className="mt-4 text-sm">
            <p>Office records could not be verified.</p>
            <button type="button" onClick={() => void offices.refetch()}
              className="mt-2 min-h-11 rounded-xl border border-border px-4 font-semibold">Retry offices</button>
          </div> : null}
          {offices.isSuccess && offices.data.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No public offices recorded.</p>
          ) : null}
          {offices.isSuccess && offices.data.length > 0 ? (
            <ul className="mt-3 divide-y divide-border">
              {offices.data.map((office) => <li key={office.id} className="py-3">
                <p className="text-sm font-semibold">{office.title}</p>
                <p className="mt-1 text-xs capitalize text-muted-foreground">{office.officeType.replace(/_/g, " ")}</p>
              </li>)}
            </ul>
          ) : null}
          {offices.isSuccess && offices.data.length === WORLD_BODY_OFFICE_LIMIT ? (
            <p className="mt-2 text-xs text-muted-foreground">Showing the first {WORLD_BODY_OFFICE_LIMIT} offices.</p>
          ) : null}
          <div className="mt-7 border-t border-border pt-6">
          <h2 className="font-semibold">Parent institution</h2>
          <p className="mt-2 text-sm text-muted-foreground">{result.organization.officialName}</p>
          <Link to="/world/organizations/$slug" params={{ slug }} search={{ tab: "overview" }}
            className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary">
            View institution <ArrowRight className="ml-2 size-4" aria-hidden="true" /></Link>
          </div>
        </aside>
      </div>
    </> : null}
  </Frame>;
}
