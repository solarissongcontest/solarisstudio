import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { BookOpen, CalendarDays, Clock3, Search, Sparkles, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AppShell } from '@/components/AppShell';
import { useSolarisApp } from '@/components/app/AppRuntime';
import { useV3DirectoryPresentation, type V3DirectoryPresentation } from '@/lib/v3-directory-presentation';
import '@/styles/v3-directory-family.css';
import { V3StoriesIndexGate } from '@/components/v3/V3StoriesGates';
import { SOLARIS_TIME_ZONE } from '@/lib/public-time';
import { loadAnniversaryEngine, loadPublicStorylines } from '@/lib/studio2-storytelling';

export const Route = createFileRoute('/stories/')({
  head: () => ({
    meta: [
      { title: 'Stories — Solaris Studio' },
      { name: 'description', content: 'Edition stories and date-aware moments from the Solaris Song Contest archive.' },
    ],
    links: [
      {
        rel: 'canonical',
        href: 'https://studio.solaris-song-contest.workers.dev/stories',
      },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Solaris Studio Stories',
          url: 'https://studio.solaris-song-contest.workers.dev/stories',
          description: 'Reviewed edition stories and historical moments from the Solaris Song Contest archive.',
        }),
      },
    ],
  }),
  loader: () => todayInSolaris(),
  component: StoriesArchivePage,
});

function todayInSolaris() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SOLARIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function StoriesArchivePage() {
  const { isAppMode, platformResolved } = useSolarisApp();
  const presentation = useV3DirectoryPresentation();

  if (!platformResolved) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10" data-v3-stories-boot="">
        <h1 className="text-3xl font-bold">Stories</h1>
        <p role="status" className="mt-3">Opening published Solaris stories…</p>
      </main>
    );
  }

  if (isAppMode) {
    return <V3StoriesIndexGate fallback={<LegacyStoriesArchivePage presentation="installed-app" />} />;
  }

  return <LegacyStoriesArchivePage presentation={presentation} />;
}

function LegacyStoriesArchivePage({ presentation }: { presentation: V3DirectoryPresentation }) {
  const referenceDate = Route.useLoaderData();
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
  const [search, setSearch] = useState("");
  const filteredStories = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return stories.filter((story) => {
      const text = [
        story.title,
        story.subtitle,
        story.introduction,
        story.editionName,
        story.editionNumber,
        story.heroMoment?.headline,
      ].filter(Boolean).join(" ").toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [search, stories]);

  return (
    <AppShell>
      <div className="v3-directory-family v3-stories-directory mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12" data-directory-experience={presentation}>
        {presentation === "mobile-web" ? (
          <header className="v3-directory-mobile-header" data-directory-mobile-header="">
            <Link to="/explore" className="v3-directory-back">Explore / Stories</Link>
            <p className="v3-directory-eyebrow">PUBLISHED NARRATIVES</p>
            <h1>Stories</h1>
            <p>Read the moments that shaped Solaris, edition by edition.</p>
          </header>
        ) : presentation === "installed-app" ? (
          <header className="v3-directory-app-heading">
            <p className="v3-directory-eyebrow">SOLARIS ARCHIVE</p>
            <h1>Stories</h1>
            <p>Published memories, reviewed before they become history.</p>
          </header>
        ) : (
          <header className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Solaris archive</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-foreground sm:text-6xl">Stories that survived the scoreboard.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Reviewed edition narratives built from the canonical Solaris event stream. Generated drafts stay private until an organizer edits and publishes them.
            </p>
          </header>
        )}

        <section className="mt-10" aria-labelledby="today-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{referenceDate}</p>
              <h2 id="today-heading" className="mt-1 text-2xl font-bold tracking-[-0.03em]">On this day in Solaris</h2>
            </div>
            {!anniversaryQuery.isError && anniversary?.sscAnniversary ? (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{anniversary.sscAnniversary.label}</span>
            ) : null}
          </div>

          {anniversaryQuery.isError ? (
            <ArchiveEmpty
              icon={Clock3}
              title="Calendar moments could not be loaded"
              copy="The public history service did not respond. Reconnect and try again."
              onRetry={() => void anniversaryQuery.refetch()}
            />
          ) : anniversaryQuery.isLoading ? (
            <ArchiveEmpty icon={Clock3} title="Reading the archive…" copy="Matching published story moments to today's calendar date." />
          ) : anniversary?.onThisDay.length ? (
            <div className={presentation === "mobile-web" ? "v3-directory-mobile-list mt-4" : "mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"}>
              {anniversary.onThisDay.slice(0, 6).map((moment, index) => (
                <article key={`${moment.editionSlug ?? 'moment'}-${moment.occurredAt}-${index}`} className={presentation === "mobile-web" ? "v3-story-mobile-moment border-b border-border py-4" : "rounded-2xl border border-border/60 bg-card/55 p-5"}>
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

          <label className="v3-directory-search mt-4 max-w-xl">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search published stories</span>
            <input type="search" aria-label="Search published stories" value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search titles, editions or moments…" />
          </label>
          {storiesQuery.isError ? (
            <ArchiveEmpty
              icon={BookOpen}
              title="Published stories could not be loaded"
              copy="Solaris could not read the story archive. This is a loading failure, not confirmation that no stories are published."
              onRetry={() => void storiesQuery.refetch()}
            />
          ) : storiesQuery.isLoading ? (
            <ArchiveEmpty icon={BookOpen} title="Loading edition stories…" copy="Only explicitly published narratives appear here." />
          ) : filteredStories.length ? (
            <div className={presentation === "mobile-web" ? "v3-directory-mobile-list mt-4" : "mt-4 grid gap-4 md:grid-cols-2"}>
              {filteredStories.map((story) => (
                presentation === "mobile-web" ? (
                  <Link key={story.editionId} to="/stories/$editionSlug"
                    params={{ editionSlug: story.editionSlug }}
                    className="v3-directory-mobile-row">
                    <span className="min-w-0 flex-1">
                      <strong>{story.title}</strong>
                      <span>{story.editionNumber != null ? `SSC ${story.editionNumber}` : story.editionName} · {story.itemCount} moments</span>
                      <span>{story.introduction ?? story.heroMoment?.summary ?? "Open the reviewed edition timeline."}</span>
                    </span>
                    <ChevronRight size={19} className="shrink-0" aria-hidden="true" />
                  </Link>
                ) : (
                <Link key={story.editionId} to="/stories/$editionSlug" params={{ editionSlug: story.editionSlug }} className="group rounded-2xl border border-border/60 bg-card/55 p-5 transition hover:-translate-y-0.5 hover:border-primary/25 hover:bg-card/75">
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
                </Link>
                )
              ))}
            </div>
          ) : (
            <ArchiveEmpty icon={Sparkles}
              title={search.trim() && stories.length ? "No matching stories" : "No edition stories published yet"}
              copy={search.trim() && stories.length
                ? "Try a different title, edition or moment."
                : "Story drafts remain private until organizers explicitly publish them."} />
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ArchiveEmpty({ icon: Icon, title, copy, onRetry }: {
  icon: typeof BookOpen;
  title: string;
  copy: string;
  onRetry?: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-border/70 bg-card/35 px-5 py-10 text-center" role={onRetry ? 'alert' : undefined}>
      <Icon className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">{copy}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-border/70 px-4 text-sm font-semibold text-foreground hover:bg-surface/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
