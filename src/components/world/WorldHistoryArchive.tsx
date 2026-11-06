import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, Globe2 } from "lucide-react";
import { useState } from "react";

import { readWorldHistoryPage, type WorldHistoryEvent } from "@/lib/terra-world-history";

const secondary = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const origin = (event: WorldHistoryEvent) =>
  event.sourceType === "editorial" ? "Editorial history" :
  event.sourceType === "domestic_election" ? "Official domestic election" :
  "Recorded institution recognition";

export function WorldHistoryArchive({ countryCode }: { countryCode: string | null }) {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["world", "history", countryCode, page],
    queryFn: ({ signal }) => readWorldHistoryPage(page, countryCode, signal),
    staleTime: 45_000, retry: false,
  });
  return <div className="mx-auto w-full max-w-6xl px-3 pb-28 pt-5 sm:px-6 sm:pt-8">
    <Link to="/world" className={secondary}>
      <ArrowLeft className="size-4" aria-hidden="true" /> Terra Solaris
    </Link>
    <header className="mt-7 max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Terra Solaris · World Archive</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">History of the World</h1>
      <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base">
        A chronological record of published institutional milestones, fictional domestic elections and editorial lore.
        Every entry identifies its origin. Private drafts and unpublished decisions are excluded.
      </p>
    </header>
    <div className="mt-7 flex flex-wrap gap-3 border-b border-border pb-6">
      {countryCode ? <Link to="/world/archive" search={{ code: undefined }} className={secondary}>
        <Globe2 className="size-4" aria-hidden="true" /> All World history
      </Link> : null}
      {countryCode ? <Link to="/world/domestic/$code" params={{ code: countryCode }} className={secondary}>
        <BookOpen className="size-4" aria-hidden="true" /> {countryCode.toUpperCase()} government
      </Link> : null}
    </div>
    <div aria-live="polite">
      {query.isPending ? <div role="status" className="mt-8 space-y-6">
        <div className="h-20 max-w-2xl animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="h-20 max-w-2xl animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      </div> : null}
      {query.isError ? <div className="mt-8" role="alert">
        <h2 className="font-semibold">History could not be loaded</h2>
        <p className="mt-2 text-sm text-muted-foreground">No unofficial fallback is shown.</p>
        <button type="button" className={secondary + " mt-4"} onClick={() => void query.refetch()}>Retry</button>
      </div> : null}
      {query.data ? <>
        {query.data.events.length ? <ol className="mt-5 max-w-4xl border-l border-border pl-5 sm:pl-8">
          {query.data.events.map(event => <li key={event.id} className="relative py-5 before:absolute before:-left-[1.55rem] before:top-7 before:size-3 before:rounded-full before:border-2 before:border-primary before:bg-background sm:before:-left-[2.3rem]">
            <p className="text-xs font-medium text-muted-foreground">
              <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}</time>
              <span className="mx-2" aria-hidden="true">·</span>{origin(event)}
            </p>
            <h2 className="mt-2 text-lg font-semibold">{event.title}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{event.summary}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              {event.countryCode ? <Link to="/world/domestic/$code" params={{ code: event.countryCode }}
                className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary">
                {event.countryCode.toUpperCase()} government <ArrowRight className="size-3" aria-hidden="true" />
              </Link> : null}
              {event.organizationSlug ? <Link to="/world/organizations/$slug" params={{ slug: event.organizationSlug }}
                search={{ tab: "overview" }} className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary">
                Organization profile <ArrowRight className="size-3" aria-hidden="true" />
              </Link> : null}
            </div>
          </li>)}</ol> :
          <div className="mt-10 max-w-lg"><BookOpen className="size-6 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 font-semibold">{page ? "No older records" : "No public historical records yet"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">Only verified, published records appear here.</p></div>}
        <nav className="mt-7 flex max-w-xl items-center justify-between gap-4 border-t border-border pt-5" aria-label="Archive pages">
          <button type="button" className={secondary} disabled={page === 0}
            onClick={() => setPage(Math.max(0, page - 1))}>Newer</button>
          <span className="text-sm tabular-nums text-muted-foreground">Page {page + 1}</span>
          <button type="button" className={secondary} disabled={!query.data.hasMore}
            onClick={() => setPage(Math.min(100, page + 1))}>Older</button>
        </nav>
      </> : null}
    </div>
  </div>;
}
