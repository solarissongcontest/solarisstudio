import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { CalendarDays, ChevronRight, Download, Info, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { AppEmptyState, AppSectionHeader } from '@/components/app/AppPrimitives';
import { EventTime } from '@/components/public/EventTime';
import { solarisQueryPolicy } from '@/lib/app-query-policy';
import { getPublicShowCalendar } from '@/lib/public-show-calendar.functions';
import {
  calendarFilename,
  serializePublicCalendar,
  type PublicCalendarEvent,
  type PublicCalendarEdition,
} from '@/lib/public-show-calendar';

function saveCalendarFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // WebKit sometimes needs the blob URL to outlive the synthetic click.
  window.setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

function DownloadCalendar({
  edition,
  events,
  generatedAt,
  small = false,
}: {
  edition: PublicCalendarEdition;
  events: readonly PublicCalendarEvent[];
  generatedAt: string;
  small?: boolean;
}) {
  const [downloadError, setDownloadError] = useState(false);
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => {
          try {
            const baseName = calendarFilename(edition);
            const fileName = events.length === 1
              ? baseName.replace(/\.ics$/, '-' + events[0].id.replace(/[^a-zA-Z0-9-]/g, '') + '.ics')
              : baseName;
            saveCalendarFile(fileName, serializePublicCalendar(edition, events, generatedAt));
            setDownloadError(false);
          } catch {
            setDownloadError(true);
          }
        }}
        className={'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/35 px-4 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ' + (small ? '' : 'bg-primary/5')}
      >
        <Download className="size-4" aria-hidden="true" />
        {small ? 'Add to calendar' : 'Download calendar (.ics)'}
      </button>
      {downloadError ? <span role="alert" className="mt-1 text-xs text-destructive">Calendar export failed. Please try again.</span> : null}
    </span>
  );
}

function CalendarRow({
  event,
  edition,
  generatedAt,
}: {
  event: PublicCalendarEvent;
  edition: PublicCalendarEdition;
  generatedAt: string;
}) {
  return (
    <article className="grid gap-3 border-b border-border py-5 last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" data-v3-calendar-show={event.id}>
      <div className="min-w-0">
        <Link to="/shows/$showId" params={{ showId: event.id }} className="inline-flex min-h-11 max-w-full items-center gap-2 text-base font-bold hover:text-primary hover:underline">
          <span className="truncate">{event.name}</span>
          <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
        </Link>
        <div className="mt-1"><EventTime value={event.startsAt} label="Scheduled start" /></div>
        <p className="mt-2 text-xs capitalize text-muted-foreground">{event.kind.replaceAll('-', ' ')}</p>
      </div>
      <DownloadCalendar edition={edition} events={[event]} generatedAt={generatedAt} small />
    </article>
  );
}

export function V3PublicShowCalendarScreen() {
  // Search params are the source of truth, including when browser history or
  // a shared edition link navigates to an already-mounted calendar screen.
  const { edition: searchEdition } = useSearch({ from: '/calendar/' });
  const navigate = useNavigate({ from: '/calendar/' });
  const selection = searchEdition ?? null;
  const [filter, setFilter] = useState<'all' | 'upcoming'>('all');
  const [currentTimeMs, setCurrentTimeMs] = useState(() => Date.now());

  useEffect(() => {
    if (filter !== 'upcoming') return;
    // An upcoming show should disappear without requiring a page reload when
    // its scheduled start passes while a visitor has the calendar open.
    const refresh = () => setCurrentTimeMs(Date.now());
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(interval);
  }, [filter]);
  const calendar = useQuery({
    queryKey: ['public-published-show-calendar', selection],
    queryFn: () => getPublicShowCalendar({ data: { editionSlug: selection } }),
    retry: 1,
    ...solarisQueryPolicy('warm'),
  });
  const result = calendar.data;
  const allEvents = result?.events ?? [];
  const visibleEvents = useMemo(() => {
    if (filter === 'all') return allEvents;
    return allEvents.filter((event) => new Date(event.startsAt).getTime() >= currentTimeMs);
  }, [allEvents, currentTimeMs, filter]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 pb-28 pt-6 sm:px-6 sm:pt-10" data-v3-public-calendar="">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Shows · Schedule</p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Solaris calendar</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
          Find published show times and save them to your phone or desktop calendar.
          Times come from the public show schedule, never from predicted contest progress.
        </p>
      </header>

      {calendar.isPending ? (
        <div role="status" className="space-y-3 py-6" aria-live="polite">
          <p className="text-sm text-muted-foreground">Checking the published show schedule…</p>
          <div className="h-20 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" />
          <div className="h-20 animate-pulse rounded-xl bg-muted/40 motion-reduce:animate-none" />
        </div>
      ) : calendar.isError ? (
        <AppEmptyState
          title="The public schedule could not be verified"
          description="No unverified dates have been substituted. The current published schedule may still be available on individual Edition pages."
          action={
            <button type="button" onClick={() => void calendar.refetch()} className="solaris-app-empty-action inline-flex items-center gap-2">
              <RefreshCw className="size-4" aria-hidden="true" /> Retry schedule
            </button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Edition</span>
              <select
                value={result?.edition?.slug ?? ''}
                onChange={(event) => {
                  const edition = event.target.value || undefined;
                  void navigate({ search: { edition }, replace: true });
                }}
                className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm font-medium sm:max-w-sm"
                aria-label="Select published edition"
              >
                {result?.edition ? null : <option value="">No published editions</option>}
                {(result?.editions ?? []).map((edition) => (
                  <option key={edition.id} value={edition.slug}>
                    {edition.name}{edition.year ? ' · ' + edition.year : ''}
                  </option>
                ))}
              </select>
            </label>
            {result?.edition && allEvents.length ?
              <DownloadCalendar edition={result.edition} events={allEvents} generatedAt={result.generatedAt} /> : null}
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3 text-sm leading-6 text-muted-foreground">
            <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <p>Downloads are <strong className="text-foreground">snapshots</strong>, not live subscriptions. If a broadcast is rescheduled, re-download the file or check Solaris Studio. Unknown and unpublished times are never invented.</p>
          </div>

          {!result?.edition ? (
            <AppEmptyState title="No public edition schedule yet" description="The calendar appears when an edition has been published." action={<Link to="/editions" className="solaris-app-empty-action">Browse editions</Link>} />
          ) : (
            <section aria-labelledby="public-calendar-events" className="space-y-4">
              <AppSectionHeader id="public-calendar-events" eyebrow="Published times" title={result.edition.name}
                trailing={<Link to="/editions/$slug" params={{ slug: result.edition.slug }} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Edition page <ChevronRight className="size-4" aria-hidden="true" /></Link>} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="group" aria-label="Filter shows by time" className="inline-flex rounded-xl border border-border p-1">
                  {(['all', 'upcoming'] as const).map((value) => (
                    <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
                      className={'min-h-11 rounded-lg px-4 text-sm font-semibold capitalize transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ' +
                        (filter === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}>{value}</button>
                  ))}
                </div>
                <p role="status" className="text-sm text-muted-foreground">{visibleEvents.length} {visibleEvents.length === 1 ? 'show' : 'shows'} with scheduled times</p>
              </div>
              {visibleEvents.length ? (
                <div className="divide-y divide-border">
                  {visibleEvents.map((event) => <CalendarRow key={event.id} event={event} edition={result.edition!} generatedAt={result.generatedAt} />)}
                </div>
              ) : (
                <AppEmptyState
                  title={filter === 'upcoming' && allEvents.length ? 'No upcoming published times' : 'No published show times'}
                  description={filter === 'upcoming' && allEvents.length
                    ? 'All currently known show times for this edition are in the past.'
                    : 'A scheduled start becomes available only after its show and schedule information are public.'}
                  action={filter === 'upcoming' && allEvents.length ?
                    <button type="button" className="solaris-app-empty-action" onClick={() => setFilter('all')}>Show all dates</button> : null}
                />
              )}
            </section>
          )}
        </>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Calendar times follow the event’s canonical UTC instant and display in Solaris time, with device-local conversion where applicable.
      </p>
      <Link to="/shows" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
        <CalendarDays className="size-4" aria-hidden="true" /> Browse all shows
      </Link>
    </div>
  );
}
