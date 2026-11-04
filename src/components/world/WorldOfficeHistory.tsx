import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, History, Landmark } from "lucide-react";

import {
  historicalTermEditionLabel,
  loadPublicOfficeHistory,
  OFFICE_HISTORY_PAGE_SIZE,
  type PublicOfficeTerm,
} from "@/lib/v3-world-office-history";

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function HistoryState({ title, detail, retry }: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border px-5 py-9 text-center"
      role={retry ? "alert" : "status"}>
      <p className="font-display text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{detail}</p>
      {retry ? (
        <button type="button" onClick={retry}
          className="mt-4 min-h-11 rounded-xl border border-border bg-surface px-5 text-sm font-semibold hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary">
          Try again
        </button>
      ) : null}
    </div>
  );
}

function OfficeTermRow({ term }: { term: PublicOfficeTerm }) {
  const editionContext = historicalTermEditionLabel(term);
  return (
    <li className="relative grid gap-3 border-b border-border/70 py-5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
            {term.officeTitle}
          </span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
            {term.status}
          </span>
        </div>
        <p className="mt-2 font-display text-lg font-semibold tracking-tight">
          {term.holderDisplayName}
        </p>
        <p className="mt-1 text-sm capitalize text-muted-foreground">
          {term.termKind.replace(/_/g, " ")} term
        </p>
      </div>
      <div className="text-sm sm:text-right">
        {editionContext ? (
          <p className="inline-flex items-center gap-1.5 font-semibold text-foreground">
            <Landmark aria-hidden="true" className="size-4 text-primary" />
            {editionContext}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">SSC term context unpublished or unavailable</p>
        )}
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays aria-hidden="true" className="size-4" />
          {dateLabel(term.startedAt)} to {dateLabel(term.actualEndAt)}
        </p>
      </div>
    </li>
  );
}

/** Public historical terms only. It never infers an office from current users. */
export function WorldOfficeHistory({ slug }: { slug: string }) {
  const query = useInfiniteQuery({
    queryKey: ["v3-world-office-history", slug.toLowerCase()],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => loadPublicOfficeHistory(slug, pageParam),
    getNextPageParam: (lastPage, pages) =>
      lastPage?.hasMore ? pages.length * OFFICE_HISTORY_PAGE_SIZE : undefined,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const organization = query.data?.pages[0]?.organization ?? null;
  const items = query.data?.pages.flatMap((page) => page?.terms ?? []) ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl pb-12">
      <Link to={"/world/organizations" as never}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary">
        <ArrowLeft aria-hidden="true" className="size-4" /> Organizations
      </Link>
      <header className="mt-3 border-b border-border pb-7">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
          <History aria-hidden="true" className="size-4" /> Terra Solaris · Public record
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-5xl">
          Leadership history
        </h1>
        {organization ? (
          <p className="mt-3 text-base font-semibold">{organization.officialName}</p>
        ) : null}
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          Completed constitutional office terms, preserved independently from current account access.
          Dates mark recorded term boundaries; SSC editions provide the political term context
          when that edition is public.
        </p>
        {organization ? (
          <Link to={("/world/organizations/" + encodeURIComponent(organization.slug)) as never}
            className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:border-primary/40">
            Current organization overview
          </Link>
        ) : null}
      </header>

      <section aria-label="Previous institutional office terms" className="mt-6" aria-live="polite">
        {query.isPending ? (
          <HistoryState title="Loading institutional history" detail="Reading completed terms from the canonical public governance archive." />
        ) : query.isError ? (
          <HistoryState title="Historical record unavailable" detail="The public history could not be retrieved. No inferred or cached officeholders are substituted." retry={() => void query.refetch()} />
        ) : !organization ? (
          <HistoryState title="Institution not found" detail="No public organization exists at this address. Restricted institutions are not disclosed." />
        ) : items.length ? (
          <>
            <ol className="mt-3 divide-y divide-border/70 border-t border-border/70">
              {items.map((term) => <OfficeTermRow key={term.id} term={term} />)}
            </ol>
            {query.hasNextPage ? (
              <button type="button" disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
                className="mt-5 min-h-11 w-full rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:border-primary/40 disabled:opacity-60">
                {query.isFetchingNextPage ? "Loading more terms…" : "Load older terms"}
              </button>
            ) : null}
          </>
        ) : (
          <HistoryState title="No completed terms published" detail="The institution has no completed office terms in the public governance record. Vacancies and earlier leadership are not guessed." />
        )}
      </section>

      <p className="mt-7 border-t border-border/70 pt-4 text-xs leading-5 text-muted-foreground">
        This is a historical record, not an election or appointment tool. Formal leadership changes
        remain restricted to authorized governance commands.
      </p>
    </main>
  );
}
