import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Globe2, Landmark, Search, UsersRound } from "lucide-react";

import {
  loadWorldOrganizationPage,
  type WorldDirectoryFilter,
  type WorldOrganization,
} from "@/lib/v3-world-public";

const FILTERS: { value: WorldDirectoryFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "recognized", label: "Recognized" },
  { value: "proposed", label: "Proposed" },
  { value: "suspended", label: "Suspended" },
  { value: "historical", label: "Historical" },
  { value: "dissolved", label: "Dissolved" },
];

function InstitutionLink({ organization, featured = false }: {
  organization: WorldOrganization;
  featured?: boolean;
}) {
  return (
    <Link
      to={("/world/organizations/" + encodeURIComponent(organization.slug)) as never}
      className={
        "group flex min-w-0 items-start justify-between gap-4 rounded-xl border border-border/70 p-4 transition " +
        "hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
        (featured ? "bg-surface/80 sm:p-6" : "bg-background/30")
      }
    >
      <span className="min-w-0">
        <span className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
            {organization.shortName}
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
            {organization.status}
          </span>
        </span>
        <span className={"block font-display font-semibold tracking-tight text-foreground " + (featured ? "text-xl sm:text-2xl" : "text-base")}>
          {organization.officialName}
        </span>
        <span className="mt-2 block max-w-lg text-sm leading-relaxed text-muted-foreground">
          {organization.description || "Explore this organization's public institutions, membership and leadership."}
        </span>
      </span>
      <ArrowRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
    </Link>
  );
}

function DirectoryState({ title, detail, retry }: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border px-5 py-8 text-center" role={retry ? "alert" : "status"}>
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{detail}</p>
      {retry ? (
        <button
          type="button"
          onClick={retry}
          className="mt-4 min-h-11 rounded-xl border border-border bg-surface px-5 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-primary"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function WorldLanding() {
  const query = useInfiniteQuery({
    queryKey: ["v3-world-directory", "", "all"],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => loadWorldOrganizationPage("", "all", pageParam),
    getNextPageParam: (lastPage, pages) => lastPage.hasMore ? pages.length : undefined,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const organizations = query.data?.pages.flatMap((page) => page.organizations) ?? [];
  const featured = [...organizations].sort((left, right) => {
    const priority = (slug: string) => slug === "guard" ? 0 : slug === "unity" ? 1 : 2;
    return priority(left.slug) - priority(right.slug);
  }).slice(0, 2);

  return (
    <>
      <header className="relative overflow-hidden border-b border-border/70 pb-8 pt-4 sm:pb-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 top-0 size-52 rounded-full bg-primary/10 blur-3xl" />
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Explore · Terra Solaris</p>
        <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          A world beyond the stage.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          Discover the institutions, countries and public decisions shaping Terra Solaris.
          Official institutions are displayed from the world governance record, not recreated from contest participation.
        </p>
      </header>

      <section aria-labelledby="world-institutions-heading" className="mt-8 sm:mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">International institutions</p>
            <h2 id="world-institutions-heading" className="mt-1 font-display text-2xl font-bold tracking-tight">
              The organizations
            </h2>
          </div>
          <Link to={"/world/organizations" as never} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">
            All organizations <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>

        {query.isPending ? (
          <DirectoryState title="Loading public institutions" detail="Reading the authoritative organization directory." />
        ) : query.isError ? (
          <DirectoryState title="Institutions are unavailable" detail="The public world record could not be loaded. No substitute data is shown." retry={() => void query.refetch()} />
        ) : featured.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {featured.map((organization) => <InstitutionLink key={organization.id} organization={organization} featured />)}
          </div>
        ) : (
          <DirectoryState title="No public institutions yet" detail="Institutions appear here when their profiles are made public." />
        )}
      </section>

      <section aria-labelledby="world-discover-heading" className="mt-10 sm:mt-12">
        <h2 id="world-discover-heading" className="font-display text-2xl font-bold tracking-tight">Explore the world</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link to={"/countries" as never} className="flex min-h-32 items-start gap-3 rounded-xl border border-border p-5 transition hover:border-primary/40">
            <Globe2 aria-hidden="true" className="size-6 shrink-0 text-primary" />
            <span><strong className="block">Countries</strong><span className="mt-1 block text-sm text-muted-foreground">Discover Terra Solaris countries and their public profiles.</span></span>
          </Link>
          <Link to={"/world/organizations" as never} className="flex min-h-32 items-start gap-3 rounded-xl border border-border p-5 transition hover:border-primary/40">
            <Landmark aria-hidden="true" className="size-6 shrink-0 text-primary" />
            <span><strong className="block">International organizations</strong><span className="mt-1 block text-sm text-muted-foreground">Browse institutions, their organs, members and offices.</span></span>
          </Link>
        </div>
      </section>
      <p className="mt-8 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
        Institutional sessions, legislation and world history will appear when those official systems and published records are available. No fictional activity is generated for this page.
      </p>
    </>
  );
}

export function WorldOrganizationsDirectory() {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<WorldDirectoryFilter>("all");

  // Avoid a Supabase request for every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(text.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [text]);

  const query = useInfiniteQuery({
    queryKey: ["v3-world-directory", search, filter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => loadWorldOrganizationPage(search, filter, pageParam),
    getNextPageParam: (lastPage, pages) => lastPage.hasMore ? pages.length : undefined,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const organizations = query.data?.pages.flatMap((page) => page.organizations) ?? [];

  return (
    <>
      <header className="max-w-3xl border-b border-border/70 pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Terra Solaris · Institutions</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-5xl">Organizations</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Browse publicly visible international institutions. Current status comes from the governance record;
          archived and non-public organizations are never substituted with guessed data.
        </p>
      </header>
      <div className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-surface px-4 focus-within:ring-2 focus-within:ring-primary">
          <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <span className="sr-only">Search organizations by name</span>
          <input type="search" aria-label="Search organizations by name" value={text} maxLength={60}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search by name or acronym"
            className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        </label>
        <label className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm">
          <span className="shrink-0 text-muted-foreground">Status</span>
          <select aria-label="Filter organizations by status" value={filter}
            onChange={(event) => setFilter(event.target.value as WorldDirectoryFilter)}
            className="w-full min-w-0 bg-transparent text-foreground outline-none">
            {FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <section aria-label="Public organizations" className="mt-6" aria-live="polite">
        {query.isPending ? (
          <DirectoryState title="Searching the public world record" detail="Only publicly visible organizations are returned." />
        ) : query.isError ? (
          <DirectoryState title="Organization directory unavailable" detail="This directory could not be loaded. Please retry when the connection recovers." retry={() => void query.refetch()} />
        ) : organizations.length ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <UsersRound aria-hidden="true" className="size-4" />
              {organizations.length} {query.hasNextPage ? "or more" : ""} public {organizations.length === 1 ? "organization" : "organizations"}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {organizations.map((organization) => <InstitutionLink key={organization.id} organization={organization} />)}
            </div>
            {query.hasNextPage ? (
              <button type="button" disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                className="mt-4 min-h-11 w-full rounded-xl border border-border bg-surface px-5 text-sm font-semibold hover:border-primary/40 disabled:opacity-60">
                {query.isFetchingNextPage ? "Loading more…" : "Load more organizations"}
              </button>
            ) : null}
          </div>
        ) : (
          <DirectoryState title="No matching public organizations" detail="Try another search or status. Private institutions are not shown." />
        )}
      </section>
    </>
  );
}
