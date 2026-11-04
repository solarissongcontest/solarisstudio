import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import {
  getPublicWorldDirectory,
  publicWorldOrganizationStatus,
  WORLD_DIRECTORY_PAGE_SIZE,
  WORLD_DIRECTORY_STALE_MS,
  type WorldDirectoryStatus,
} from "@/lib/world-public-organizations";

export const Route = createFileRoute("/world/organizations/")({
  head: () => ({
    meta: [
      { title: "Organizations — Terra Solaris" },
      { name: "description", content: "Search and browse published Terra Solaris international organizations." },
    ],
  }),
  component: WorldOrganizationsDirectory,
});

const STATUS_FILTERS: ReadonlyArray<{ value: WorldDirectoryStatus; label: string }> = [
  { value: "all", label: "All public statuses" },
  { value: "active", label: "Active" },
  { value: "recognized", label: "Recognized" },
  { value: "historical", label: "Historical" },
];

function WorldOrganizationsDirectory() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WorldDirectoryStatus>("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const directory = useQuery({
    queryKey: ["v3-world-public-directory", search, status, page],
    queryFn: () => getPublicWorldDirectory({ search, status, page }),
    staleTime: WORLD_DIRECTORY_STALE_MS,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const total = directory.data?.total ?? 0;
  const hasNextPage = (page + 1) * WORLD_DIRECTORY_PAGE_SIZE < total;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris / Institutions"
        title="Organizations"
        description="Browse official, publicly visible international organizations. Private institutional work never appears in this directory."
      />
      <main className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6" data-v3-world-organizations="">
        <Link to="/world" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Terra Solaris
        </Link>
        <div className="mt-4 grid gap-3 border-b border-border/70 pb-6 sm:grid-cols-[minmax(0,1fr)_200px]">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Search organizations
            </span>
            <span className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-background px-3 focus-within:ring-2 focus-within:ring-primary/45">
              <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                type="search"
                value={searchInput}
                maxLength={80}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Name or abbreviation"
                className="min-w-0 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </span>
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Status
            </span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as WorldDirectoryStatus);
                setPage(0);
              }}
              className="min-h-12 w-full rounded-xl border border-border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {STATUS_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
            </select>
          </label>
        </div>

        <div className="flex min-h-14 items-center justify-between gap-3 text-sm" aria-live="polite">
          <p className="text-muted-foreground">
            {directory.isPending
              ? "Searching published institutions…"
              : directory.isError
                ? "Institutional directory unavailable"
                : total === 0
                  ? "No matching public organizations"
                  : total + " public " + (total === 1 ? "organization" : "organizations")}
          </p>
          {directory.isFetching && !directory.isPending ? <span className="text-xs text-muted-foreground">Updating…</span> : null}
        </div>

        {directory.isPending ? (
          <div role="status" className="divide-y divide-border/70" aria-label="Loading organization directory">
            {[0, 1, 2].map((index) => (
              <div key={index} className="animate-pulse py-5 motion-reduce:animate-none">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="mt-3 h-5 w-48 rounded bg-muted" />
                <div className="mt-2 h-3 w-4/5 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : directory.isError ? (
          <div role="alert" className="border-t border-border py-8">
            <h2 className="text-lg font-semibold">Unable to load organizations</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The institutional directory may be temporarily unavailable. No private data is displayed as a fallback.
            </p>
            <button type="button" onClick={() => directory.refetch()} className="mt-4 min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
              Try again
            </button>
          </div>
        ) : !directory.data.organizations.length ? (
          <div className="border-t border-border py-10">
            <h2 className="text-lg font-semibold">Nothing matches yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">Try another name or status. Only published public records are searchable.</p>
            <button type="button" onClick={() => { setSearchInput(""); setSearch(""); setStatus("all"); setPage(0); }} className="mt-3 min-h-11 text-sm font-semibold text-primary underline">
              Clear filters
            </button>
          </div>
        ) : (
          <ul className="grid gap-x-8 md:grid-cols-2">
            {directory.data.organizations.map((organization) => (
              <li key={organization.id} className="border-t border-border/70 py-5">
                <Link
                  to="/world/organizations/$slug"
                  params={{ slug: organization.slug }}
                  className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                    {publicWorldOrganizationStatus(organization.status)}
                  </span>
                  <span className="mt-2 block text-lg font-semibold tracking-tight group-hover:text-primary">
                    {organization.short_name}
                  </span>
                  {organization.official_name !== organization.short_name ? (
                    <span className="mt-1 block text-sm text-muted-foreground">{organization.official_name}</span>
                  ) : null}
                  <span className="mt-2 line-clamp-3 block text-sm leading-6 text-muted-foreground">
                    {organization.description || "Public institutional record"}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    Explore organization <ChevronRight className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {directory.data && total > WORLD_DIRECTORY_PAGE_SIZE ? (
          <nav aria-label="Organization directory pages" className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <button
              type="button"
              disabled={page === 0 || directory.isFetching}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="size-4" aria-hidden="true" /> Previous
            </button>
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {Math.ceil(total / WORLD_DIRECTORY_PAGE_SIZE)}
            </span>
            <button
              type="button"
              disabled={!hasNextPage || directory.isFetching}
              onClick={() => setPage((current) => current + 1)}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-border px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </main>
    </AppShell>
  );
}
