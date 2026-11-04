import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Search } from "lucide-react";
import { useState } from "react";

import { getTerraWorldDirectory } from "@/lib/terra-world-public.functions";
import {
  WORLD_DIRECTORY_PAGE_SIZE,
  WORLD_DIRECTORY_STATUSES,
  type WorldDirectoryStatus,
  type WorldOrganizationSummary,
} from "@/lib/terra-world-public";

function OrganizationRow({ item }: { item: WorldOrganizationSummary }) {
  return (
    <li className="border-b border-border/60 last:border-b-0">
      <Link
        to="/world/organizations/$slug/"
        params={{ slug: item.slug }}
        className="group flex min-h-20 items-center gap-4 py-3 outline-offset-4 focus-visible:outline-2 focus-visible:outline-primary"
      >
        {item.emblemUrl ? (
          <img
            src={item.emblemUrl}
            alt=""
            loading="lazy"
            className="size-12 shrink-0 rounded-xl border border-border/60 bg-surface object-contain p-1"
          />
        ) : (
          <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl border border-border/60 bg-surface text-lg font-bold text-muted-foreground">
            {item.shortName.slice(0, 1)}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-foreground">{item.shortName}</span>
            <span className="text-xs capitalize text-muted-foreground">{item.status}</span>
          </span>
          <span className="mt-1 block text-sm leading-5 text-muted-foreground">{item.officialName}</span>
          {item.description ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{item.description}</span> : null}
        </span>
        <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 motion-reduce:transform-none" />
      </Link>
    </li>
  );
}

export function TerraWorldDirectory({ featured = false }: { featured?: boolean }) {
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<WorldDirectoryStatus>("all");
  const [page, setPage] = useState(0);
  const load = useServerFn(getTerraWorldDirectory);
  const query = useQuery({
    queryKey: ["terra-world", "directory", search, status, featured ? 0 : page],
    queryFn: () => load({ data: { page: featured ? 0 : page, search: featured ? "" : search, status: featured ? "all" : status } }),
    staleTime: 2 * 60_000,
    retry: 1,
  });
  const rows = featured ? (query.data?.organizations ?? []).slice(0, 4) : query.data?.organizations ?? [];
  const total = query.data?.total ?? 0;
  return (
    <section aria-labelledby={featured ? "world-featured-title" : "world-directory-title"}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">International institutions</p>
          <h2 id={featured ? "world-featured-title" : "world-directory-title"} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {featured ? "Organizations" : "Organization directory"}
          </h2>
        </div>
        {featured ? (
          <Link to="/world/organizations/" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary hover:underline">
            Browse all <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>

      {!featured ? (
        <form className="mb-5 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setSearch(draft.trim());
        }}>
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search organizations</span>
            <input
              className="w-full min-w-0 bg-transparent py-3 text-sm outline-none"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={120}
              placeholder="Search organizations"
              type="search"
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <span className="sr-only">Organization status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as WorldDirectoryStatus);
                setPage(0);
              }}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm capitalize sm:w-40"
            >
              {WORLD_DIRECTORY_STATUSES.map((value) =>
                <option key={value} value={value}>{value === "all" ? "All statuses" : value}</option>,
              )}
            </select>
          </label>
          <button type="submit" className="min-h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Search
          </button>
        </form>
      ) : null}

      {query.isLoading ? <p className="py-8 text-sm text-muted-foreground" role="status">Loading public organizations…</p> : null}
      {query.isError ? (
        <div role="alert" className="space-y-3 rounded-2xl border border-border p-5">
          <p className="font-semibold">Organizations are temporarily unavailable.</p>
          <p className="text-sm text-muted-foreground">This view requires the canonical Terra Solaris institution service. No local or guessed records are shown.</p>
          <button type="button" onClick={() => void query.refetch()} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">Retry</button>
        </div>
      ) : null}
      {query.isSuccess && rows.length === 0 ? (
        <p className="rounded-2xl border border-border p-5 text-sm text-muted-foreground">
          {search || status !== "all" ? "No published organizations match these filters." : "No public organizations have been published yet."}
        </p>
      ) : null}
      {query.isSuccess && rows.length > 0 ? (
        <ul className="divide-y divide-border/60" aria-label="Public organizations">
          {rows.map((item) => <OrganizationRow key={item.id} item={item} />)}
        </ul>
      ) : null}
      {!featured && query.isSuccess && total > 0 ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4 text-sm text-muted-foreground">
          <span>Showing {page * WORLD_DIRECTORY_PAGE_SIZE + 1}–{Math.min(total, (page + 1) * WORLD_DIRECTORY_PAGE_SIZE)} of {total}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))} className="min-h-11 rounded-xl border border-border px-4 font-semibold text-foreground disabled:opacity-40">
              Previous
            </button>
            <button type="button" disabled={(page + 1) * WORLD_DIRECTORY_PAGE_SIZE >= total} onClick={() => setPage((current) => current + 1)} className="min-h-11 rounded-xl border border-border px-4 font-semibold text-foreground disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
