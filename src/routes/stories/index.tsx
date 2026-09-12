import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BookOpen, CalendarDays, Clock3, Sparkles } from 'lucide-react';

import { AppShell } from '@/components/AppShell';
import { loadAnniversaryEngine, loadPublicStorylines } from '@/lib/studio2-storytelling';

export const Route = createFileRoute('/stories/')({
  head: () => ({ meta: [
    { title: 'Stories — Solaris Studio' },
    { name: 'description', content: 'Edition stories and date-aware moments from the Solaris Song Contest archive.' },
  ] }),
  component: StoriesArchivePage,
});

function todayInParis() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function StoriesArchivePage() {
  const referenceDate = todayInParis();
  const storiesQuery = useQuery({
    queryKey: ['public-storylines'],
    queryFn: () => loadPublicStorylines(30),
    staleTime: 60_000,
  });
  const anniversaryQuery = useQuery({
    queryKey: ['studio2-anniversary-engine', referenceDate],
    queryFn: () => loadAnniversaryEngine(referenceDate, 12),
    staleTime: 60_000,
  });

  const stories = storiesQuery.data ?? [];
  const anniversary = anniversaryQuery.data ?? null;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Solaris archive</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-foreground sm:text-6xl">Stories that survived the scoreboard.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Reviewed edition narratives built from the canonical Solaris event stream. Generated drafts stay private until an organizer edits and publishes them, because history deserves slightly more governance than a autocomplete box.
          </p>
        </header>

        <section className="mt-10" aria-labelledby="today-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{referenceDate}</p>
              <h2 id="today-heading" className="mt-1 text-2xl font-bold tracking-[-0.03em]">On this day in Solaris</h2>
            </div>
            {anniversary?.sscAnniversary ? (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{anniversary.sscAnniversary.label}</span>
            ) : null}
          </div>

          {anniversaryQuery.isLoading ? (
            <ArchiveEmpty icon={Clock3} title="Reading the archive…" copy="Matching published story moments to today's calendar date." />
          ) : anniversary?.onThisDay.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {anniversary.onThisDay.slice(0, 6).map((moment, index) => (
                <article key={`${moment.editionSlug ?? 'moment'}-${moment.occurredAt}-${index}`} className="rounded-2xl border border-border/60 bg-card/55 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-black uppercase tracking-[0.14em] text-primary">{moment.yearsAgo ?? '?'} years ago</span>
                    <span className="text-xs text-muted-foreground">{moment.importance}</span>
                  </div>
                  <h3 className="mt-3 text-lg font-bold tracking-[-0.02em]">{moment.headline}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{moment.summary}</p>
                  <p className="mt-4 text-xs text-muted-foreground">{moment.editionName ?? 'Solaris Song Contest'}</p>
                </article>
              ))}
            </div>
          ) : (
            <ArchiveEmpty icon={CalendarDays} title="No published moments for today" copy="As more reviewed edition stories are published, the calendar archive fills itself from those public moments." />
          )}
        </section>

        <section className="mt-12" aria-labelledby="stories-heading">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Published narratives</p>
            <h2 id="stories-heading" className="mt-1 text-2xl font-bold tracking-[-0.03em]">Edition stories</h2>
          </div>

          {storiesQuery.isLoading ? (
            <ArchiveEmpty icon={BookOpen} title="Loading edition stories…" copy="Only explicitly published narratives appear here." />
          ) : stories.length ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {stories.map((story) => (
                <a key={story.editionId} href={`/stories/${story.editionSlug}`} className="group rounded-2xl border border-border/60 bg-card/55 p-5 transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card/75">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-[0.14em] text-primary">
                      {story.editionNumber != null ? `SSC ${story.editionNumber}` : story.editionName}
                    </span>
                    <span className="text-xs text-muted-foreground">{story.itemCount} moments</span>
                  </div>
                  <h3 className="mt-3 text-2xl font-black tracking-[-0.03em] group-hover:text-primary">{story.title}</h3>
                  {story.subtitle ? <p className="mt-1 text-sm font-semibold text-foreground/80">{story.subtitle}</p> : null}
                  <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{story.introduction ?? story.heroMoment?.summary ?? 'Open the reviewed edition timeline.'}</p>
                  {story.heroMoment ? (
                    <div className="mt-5 rounded-xl border border-border/50 bg-background/35 p-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.13em] text-muted-foreground">Defining moment</p>
                      <p className="mt-1 text-sm font-semibold">{story.heroMoment.headline}</p>
                    </div>
                  ) : null}
                </a>
              ))}
            </div>
          ) : (
            <ArchiveEmpty icon={Sparkles} title="No edition stories published yet" copy="Story drafts remain private until organizers explicitly publish them." />
          )}
        </section>
      </main>
    </AppShell>
  );
}

function ArchiveEmpty({ icon: Icon, title, copy }: {
  icon: typeof BookOpen;
  title: string;
  copy: string;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-card/35 px-5 py-10 text-center">
      <Icon className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  );
}
