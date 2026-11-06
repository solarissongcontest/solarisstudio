import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";

import { getWorldSession } from "@/lib/world-session-public";

function time(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" })
    .format(new Date(value));
}

export function WorldSessionDetail({ sessionId }: { sessionId: string }) {
  const session = useQuery({
    queryKey: ["world", "session", "public", sessionId, 1],
    queryFn: () => getWorldSession(sessionId),
    staleTime: 60_000,
    retry: 1,
  });
  return (
    <article className="mx-auto w-full max-w-4xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
      <Link to={"/world/sessions" as any}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> All public sessions
      </Link>
      {session.isPending ? (
        <p className="py-14 text-sm text-muted-foreground" role="status">Loading official session…</p>
      ) : session.isError ? (
        <div className="py-12" role="alert">
          <h1 className="text-xl font-semibold">Unable to verify session</h1>
          <p className="mt-2 text-sm text-muted-foreground">The authoritative institutional record could not be loaded.</p>
          <button type="button" onClick={() => void session.refetch()}
            className="mt-4 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
            Retry
          </button>
        </div>
      ) : !session.data ? (
        <div className="py-12">
          <h1 className="text-2xl font-bold">Session not publicly available</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This session may not exist, or it may be restricted to members. Private institutional records are not shown.
          </p>
        </div>
      ) : (
        <>
          <header className="mt-5 border-b border-border/70 pb-8">
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-primary">
              {session.data.organizationName} · {session.data.organName}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-[-.045em] sm:text-5xl">{session.data.title}</h1>
            <p className="mt-3 inline-flex rounded-full border border-border px-3 py-1 text-xs font-semibold capitalize text-muted-foreground">
              {session.data.status}
            </p>
            <div className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 size-5 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Meeting time</p>
                  <time dateTime={session.data.startsAt} className="mt-1 block text-muted-foreground">
                    {time(session.data.startsAt)}
                  </time>
                  <p className="text-muted-foreground">Until {time(session.data.endsAt)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-5 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Venue</p>
                  <p className="mt-1 text-muted-foreground">{session.data.venueLabel || session.data.venueType}</p>
                  {session.data.venueType === "external" ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      External meeting links are available to authorized institutional managers.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </header>
          <section className="mt-8" aria-labelledby="world-session-agenda">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[.15em] text-muted-foreground">Business</p>
                <h2 id="world-session-agenda" className="mt-1 text-2xl font-bold tracking-tight">Public agenda</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to={"/world/sessions/$sessionId/minutes" as any}
                  params={{ sessionId } as any}
                  className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:border-primary/50">
                  Official minutes
                </Link>
                <Link to={"/world/sessions/$sessionId/attendance" as any}
                  params={{ sessionId } as any}
                  className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:border-primary/50">
                  Attendance
                </Link>
                <Link to={"/world/sessions/$sessionId/manage" as any}
                  params={{ sessionId } as any}
                  className="inline-flex min-h-11 items-center rounded-xl border border-border px-3 text-sm font-semibold hover:border-primary/50">
                  Manage agenda
                </Link>
              </div>
            </div>
            {session.data.agenda.length ? (
              <ol className="divide-y divide-border/60">
                {session.data.agenda.map((item) => (
                  <li key={item.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-4 py-5">
                    <span className="pt-0.5 text-sm font-semibold tabular-nums text-primary">
                      {String(item.position).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="mt-1 text-xs capitalize text-muted-foreground">
                        {item.itemType.replaceAll("_", " ")} · {item.state}
                      </p>
                      {item.description ? (
                        <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-10 text-sm text-muted-foreground">
                No agenda items have been published for this session.
              </p>
            )}
          </section>
        </>
      )}
    </article>
  );
}
