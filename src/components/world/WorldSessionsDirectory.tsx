import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronRight, Search } from "lucide-react";

import { listWorldSessions, type WorldSession } from "@/lib/world-session-public";

function dateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function SessionRow({ session }: { session: WorldSession }) {
  return (
    <Link
      to={"/world/sessions/$sessionId" as any}
      params={{ sessionId: session.id } as any}
      className="group grid min-h-20 gap-2 border-b border-border/60 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6"
    >
      <span className="min-w-0">
        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.13em] text-muted-foreground">
          {session.organizationName} · {session.organName}
        </span>
        <span className="block text-base font-semibold tracking-tight text-foreground group-hover:text-primary">
          {session.title}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">
          <time dateTime={session.startsAt}>{dateTime(session.startsAt)}</time>
          {session.venueLabel ? " · " + session.venueLabel : ""}
        </span>
      </span>
      <span className="flex items-center justify-between gap-3 sm:justify-end">
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
          {session.status}
        </span>
        <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
    </Link>
  );
}

/** Independent TG6 directory. TG3 owns the World landing page and Explore entry. */
export function WorldSessionsDirectory() {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("upcoming");
  const [organization, setOrganization] = useState("all");
  const sessions = useQuery({
    queryKey: ["world", "sessions", "public", 1],
    queryFn: () => listWorldSessions(),
    staleTime: 60_000,
    retry: 1,
  });

  const organizations = useMemo(
    () => [...new Set((sessions.data ?? []).map((s) => s.organizationSlug))].sort(),
    [sessions.data],
  );
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    const now = Date.now();
    return (sessions.data ?? [])
      .filter((row) => organization === "all" || row.organizationSlug === organization)
      .filter((row) => !term || [
        row.title, row.organizationName, row.organName, row.venueLabel ?? "",
      ].some((value) => value.toLocaleLowerCase().includes(term)))
      .filter((row) => scope === "all" || (scope === "upcoming"
        ? Date.parse(row.endsAt) >= now
        : Date.parse(row.endsAt) < now))
      .sort((a, b) => scope === "upcoming"
        ? Date.parse(a.startsAt) - Date.parse(b.startsAt)
        : Date.parse(b.startsAt) - Date.parse(a.startsAt));
  }, [sessions.data, scope, organization, query]);

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pb-14 pt-6 sm:px-6 sm:pt-10">
      <header className="border-b border-border/70 pb-7">
        <p className="text-[11px] font-bold uppercase tracking-[.2em] text-primary">Terra Solaris · Institutions</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-.045em] text-foreground sm:text-5xl">
          Sessions
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          Official public meetings and agendas of Terra Solaris organizations. Private member sessions are not listed.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to={"/world/sessions/new" as any}
            className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Schedule a session
          </Link>
        </div>
      </header>

      <div className="grid gap-3 border-b border-border/60 py-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <label className="relative block">
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Search sessions</span>
          <Search className="pointer-events-none absolute bottom-3.5 left-3.5 size-4 text-muted-foreground" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)}
            type="search" placeholder="Title, organization, venue"
            className="min-h-11 w-full rounded-xl border border-border bg-background py-2 pl-10 pr-3 text-sm text-foreground" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Organization</span>
          <select value={organization} onChange={(event) => setOrganization(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground sm:w-40">
            <option value="all">All organizations</option>
            {organizations.map((slug) => <option key={slug} value={slug}>{slug.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">When</span>
          <select value={scope} onChange={(event) => setScope(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground sm:w-36">
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
            <option value="all">All recent</option>
          </select>
        </label>
      </div>
      {sessions.isPending ? (
        <div className="py-12 text-sm text-muted-foreground" role="status" aria-live="polite">
          <CalendarDays className="mb-3 size-6" aria-hidden="true" />
          Loading the public session schedule…
        </div>
      ) : sessions.isError ? (
        <div className="py-10" role="alert">
          <h2 className="text-lg font-semibold">Schedule unavailable</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            The institutional schedule could not be verified. No sessions are being inferred from cached or private data.
          </p>
          <button type="button" onClick={() => void sessions.refetch()}
            className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
            Retry schedule
          </button>
        </div>
      ) : filtered.length ? (
        <div role="list" aria-label="Public institutional sessions">
          {filtered.map((session) => <div role="listitem" key={session.id}><SessionRow session={session} /></div>)}
        </div>
      ) : (
        <div className="py-12 text-sm text-muted-foreground" role="status">
          {sessions.data.length === 0
            ? "No public institutional sessions have been scheduled yet."
            : "No sessions match these filters."}
          {(query || scope !== "all" || organization !== "all") && sessions.data.length > 0 ? (
            <button type="button" onClick={() => { setQuery(""); setScope("all"); setOrganization("all"); }}
              className="ml-2 underline underline-offset-4">Clear filters</button>
          ) : null}
        </div>
      )}
      <p className="mt-6 text-xs leading-5 text-muted-foreground">
        The schedule shows up to 100 recent public sessions. Local times follow your device settings.
      </p>
    </section>
  );
}
