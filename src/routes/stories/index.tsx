import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { BookOpen, CalendarDays, Clock3, Search, Sparkles, ChevronRight, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AppShell } from '@/components/AppShell';
import { PublicStorySpoilerDisclosure } from '@/components/public/PublicStorySpoilerDisclosure';
import { useAppExperiencePreferences } from '@/lib/app-experience';
import { useSolarisApp } from '@/components/app/AppRuntime';
import { SolarisSearchField } from '@/components/app/SolarisSearchField';
import { useV3DirectoryPresentation, type V3DirectoryPresentation } from '@/lib/v3-directory-presentation';
import '@/styles/v3-directory-family.css';
import '@/styles/v3-stories-editorial.css';
import { V3StoriesIndexGate, useV3StoryFallbackSpoilerProtection } from '@/components/v3/V3StoriesGates';
import { SOLARIS_TIME_ZONE } from '@/lib/public-time';
import { loadAnniversaryEngine, loadPublicStorylines } from '@/lib/studio2-storytelling';
import { canExpandPublicStoryBatch, canExpandPublishedStorySearch, nextPublicStoryBatchLimit, publicStoryBatchAtServerCap, PUBLIC_STORY_INITIAL_BATCH, PUBLIC_STORY_RPC_MAX } from '@/lib/v3-public-story-browse';

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
  const { preferences } = useAppExperiencePreferences();
  const installedFallbackProtection = useV3StoryFallbackSpoilerProtection();
  const spoilerFree = installedFallbackProtection ?? preferences.spoilerFree;
  const [storyLimit, setStoryLimit] = useState(PUBLIC_STORY_INITIAL_BATCH);
  const storiesQuery = useQuery({
    queryKey: ['public-storylines', storyLimit],
    queryFn: () => loadPublicStorylines(storyLimit),
    staleTime: 60_000,
    retry: false,
  });
  const anniversaryQuery = useQuery({
    queryKey: ['studio2-anniversary-engine', referenceDate],
    queryFn: () => loadAnniversaryEngine(referenceDate, 12),
    staleTime: 60_000,
  });

  // A cached response is not a current publication decision during refetch.
  const stories = storiesQuery.isSuccess && !storiesQuery.isFetching && !storiesQuery.isRefetchError
    ? storiesQuery.data ?? [] : [];
  const anniversary = anniversaryQuery.isSuccess && !anniversaryQuery.isFetching &&
    !anniversaryQuery.isRefetchError ? anniversaryQuery.data ?? null : null;
  const [search, setSearch] = useState("");
  const canLoadMoreStories = storiesQuery.isSuccess && !storiesQuery.isFetching &&
    canExpandPublicStoryBatch(stories.length, storyLimit);
  const searchCoverageIncomplete = canLoadMoreStories &&
    canExpandPublishedStorySearch(search, stories.length, storyLimit);
  const reachedStoryLimit = storiesQuery.isSuccess && !storiesQuery.isFetching &&
    publicStoryBatchAtServerCap(stories.length, storyLimit);
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
      <div className="v3-directory-family v3-stories-directory v3-editorial-stories mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12" data-directory-experience={presentation}>
        {presentation === "mobile-web" ? (
          <header className="v3-directory-mobile-header" data-directory-mobile-header="">
                        <p className="v3-directory-eyebrow">PUBLISHED NARRATIVES</p>
            <h1>Stories</h1>

          </header>
        ) : presentation === "installed-app" ? (
          <header className="v3-directory-app-heading">
            <p className="v3-directory-eyebrow">SOLARIS ARCHIVE</p>
            <h1>Stories</h1>
            <p>Published memories, reviewed before they become history.</p>
          </header>
        ) : (
          <header className="max-w-3xl">
            <p className="v3-directory-eyebrow">PUBLISHED NARRATIVES</p>
            <h1 className="mt-2 font-sans text-4xl font-bold tracking-[-0.035em] text-foreground">Stories</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Published stories from Solaris editions.
            </p>
          </header>
        )}

        <PublicStorySpoilerDisclosure
          key={spoilerFree ? "spoiler-protected" : "spoilers-open"}
          spoilerFree={spoilerFree}
          subject="published edition stories and historical moments"
        >
        <section className="mt-6" aria-labelledby="stories-heading">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">Published narratives</p>
            <h2 id="stories-heading" className="mt-1 text-2xl font-bold tracking-[-0.03em]">{presentation === "installed-app" ? "Edition stories" : "Latest stories"}</h2>
          </div>

          {presentation === "installed-app" ? (
            <SolarisSearchField value={search} onChange={setSearch} label="Search published stories"
              placeholder="Search titles, editions or moments…" className="mt-4 max-w-xl" />
          ) : (
            <div className="v3-directory-search mt-4 max-w-xl" role="search">
              <Search size={18} aria-hidden="true" />
              <input type="search" aria-label="Search published stories" value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search titles, editions or moments…" />
              {search ? (
                <button type="button" className="v3-directory-search-clear" aria-label="Clear search" onClick={() => setSearch("")}>
                  <X size={16} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          )}
          <p className="v3-directory-results-count" role="status" aria-live="polite">
            {filteredStories.length} of {stories.length} published stories in this batch
            {searchCoverageIncomplete ? " · More published stories may match beyond this batch" : ""}
          </p>
          {storiesQuery.isError || storiesQuery.isRefetchError ? (
            <ArchiveEmpty
              icon={BookOpen}
              title="Published stories could not be loaded"
              copy="Solaris could not read the story archive. This is a loading failure, not confirmation that no stories are published."
              onRetry={() => void storiesQuery.refetch()}
            />
          ) : storiesQuery.isLoading || storiesQuery.isFetching ? (
            <ArchiveEmpty icon={BookOpen} title="Loading edition stories…" copy="Only explicitly published narratives appear here." />
          ) : filteredStories.length ? (
            <div className={presentation === "mobile-web" ? "v3-directory-mobile-list mt-4" : "mt-4 grid gap-4 md:grid-cols-2"}>
              {filteredStories.map((story) => (
                presentation !== "installed-app" && !search.trim() && story === filteredStories[0] ? (
                  <Link
                    key={story.editionId}
                    to="/stories/$editionSlug"
                    params={{ editionSlug: story.editionSlug }}
                    className="v3-stories-feature group"
                  >
                    <span className="v3-stories-feature-edition">
                      {story.editionNumber != null ? `SSC ${story.editionNumber}` : story.editionName}
                    </span>
                    <h3>{story.title}</h3>
                    {story.subtitle ? <p className="v3-stories-feature-subtitle">{story.subtitle}</p> : null}
                    {story.introduction ? <p className="v3-stories-feature-intro line-clamp-3">{story.introduction}</p> : null}
                    {story.heroMoment ? (
                      <div className="v3-stories-feature-moment">
                        <span>Defining moment</span>
                        <strong>{story.heroMoment.headline}</strong>
                      </div>
                    ) : null}
                    <span className="v3-stories-feature-link">Read story <ChevronRight size={18} aria-hidden="true" /></span>
                  </Link>
                ) : presentation === "mobile-web" ? (
                  <Link key={story.editionId} to="/stories/$editionSlug"
                    params={{ editionSlug: story.editionSlug }}
                    className="v3-directory-mobile-row v3-stories-web-row">
                    <span className="min-w-0 flex-1">
                      <strong>{story.title}</strong>
                      <span>{story.editionNumber != null ? `SSC ${story.editionNumber}` : story.editionName} · {story.itemCount} moments</span>
                      <span>{story.introduction ?? story.heroMoment?.summary ?? "Open the reviewed edition timeline."}</span>
                    </span>
                    <ChevronRight size={19} className="shrink-0" aria-hidden="true" />
                  </Link>
                ) : (
                <Link key={story.editionId} to="/stories/$editionSlug" params={{ editionSlug: story.editionSlug }} className="v3-stories-teaser group rounded-2xl border border-border/60 bg-card/55 p-5 transition hover:border-primary/25 hover:bg-card/75">
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
                    <p className="v3-stories-teaser-moment mt-4 text-sm font-semibold">{story.heroMoment.headline}</p>
                  ) : null}
                </Link>
                )
              ))}
            </div>
          ) : (
            <ArchiveEmpty icon={Sparkles}
              title={search.trim() && stories.length ? "No matching stories" : "No edition stories published yet"}
              copy={search.trim() && stories.length
                ? "Try another title, edition or moment, or load more published history."
                : "Story drafts remain private until organizers explicitly publish them."} />
          )}
          {canLoadMoreStories ? (
            <div className="mt-5 flex flex-wrap items-center gap-3" data-v3-stories-batch="">
              <button type="button"
                className="min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                disabled={storiesQuery.isFetching}
                onClick={() => setStoryLimit((limit) => nextPublicStoryBatchLimit(limit))}>
                Load more published stories
              </button>
              <span className="text-xs text-muted-foreground">Older published records may be available.</span>
            </div>
          ) : null}
          {searchCoverageIncomplete ? (
            <button type="button"
              className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold text-primary hover:bg-primary/10"
              disabled={storiesQuery.isFetching}
              onClick={() => setStoryLimit(PUBLIC_STORY_RPC_MAX)}>
              Search more published history
            </button>
          ) : null}
          {reachedStoryLimit ? (
            <p className="mt-3 max-w-prose text-xs leading-5 text-muted-foreground" role="status">
              Showing the latest 100 published edition stories. Earlier history may exist beyond this archive search limit.
            </p>
          ) : null}
          {search.trim() && stories.length > 0 && filteredStories.length === 0 ? (
            <button type="button" className="mt-3 min-h-11 text-sm font-semibold text-primary underline-offset-4 hover:underline"
              onClick={() => setSearch("")}>Clear story search</button>
          ) : null}
        </section>

        <section className="mt-10" aria-labelledby="today-heading">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">{referenceDate}</p>
              <h2 id="today-heading" className="mt-1 text-2xl font-bold tracking-[-0.03em]">On this day</h2>
            </div>
            {!anniversaryQuery.isError && anniversary?.sscAnniversary ? (
              <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{anniversary.sscAnniversary.label}</span>
            ) : null}
          </div>

          {anniversaryQuery.isError || anniversaryQuery.isRefetchError ? (
            <ArchiveEmpty
              icon={Clock3}
              title="Calendar moments could not be loaded"
              copy="The public history service did not respond. Reconnect and try again."
              onRetry={() => void anniversaryQuery.refetch()}
            />
          ) : anniversaryQuery.isLoading || anniversaryQuery.isFetching ? (
            <ArchiveEmpty icon={Clock3} title="Reading the archive…" copy="Matching published story moments to today's calendar date." />
          ) : anniversary?.onThisDay.length ? (
            <div className={presentation === "mobile-web" ? "v3-directory-mobile-list mt-4" : "mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3"}>
              {anniversary.onThisDay.slice(0, 6).map((moment, index) => (
                <article key={`${moment.editionSlug ?? 'moment'}-${moment.occurredAt}-${index}`} className={presentation === "mobile-web" ? "v3-story-mobile-moment v3-stories-date-item border-b border-border py-4" : "v3-stories-date-item rounded-2xl border border-border/60 bg-card/55 p-5"}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-black uppercase tracking-[0.14em] text-primary">{moment.yearsAgo != null ? `${moment.yearsAgo} years ago` : 'Archive moment'}</span>
                    {presentation === "installed-app" ? <span className="text-xs text-muted-foreground">{moment.importance}</span> : null}
                  </div>
                  <h3 className="mt-3 text-lg font-bold tracking-[-0.02em]">{moment.headline}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{moment.summary}</p>
                  <p className="mt-4 text-xs text-muted-foreground">{moment.editionName ?? 'Solaris Song Contest'}</p>
                  {moment.editionSlug ? (
                    <Link to="/stories/$editionSlug" params={{ editionSlug: moment.editionSlug }}
                      className="mt-2 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                      Read this edition story <ChevronRight size={15} aria-hidden="true" />
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <ArchiveEmpty icon={CalendarDays} title="No published moments for today" copy="The historical calendar fills as reviewed stories are published." compact />
          )}
        </section>
        </PublicStorySpoilerDisclosure>
      </div>
    </AppShell>
  );
}

function ArchiveEmpty({ icon: Icon, title, copy, onRetry, compact = false }: {
  icon: typeof BookOpen;
  title: string;
  copy: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mt-3 rounded-xl border border-border/50 px-4 py-4 text-center" : "mt-4 rounded-2xl border border-dashed border-border/70 bg-card/35 px-5 py-8 text-center"} role={onRetry ? 'alert' : undefined}>
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
