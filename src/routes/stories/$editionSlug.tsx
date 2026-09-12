import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ArrowLeft, BookOpen, CalendarDays } from 'lucide-react';

import { AppShell } from '@/components/AppShell';
import { loadPublicStoryline } from '@/lib/studio2-storytelling';

export const Route = createFileRoute('/stories/$editionSlug')({
  head: () => ({ meta: [
    { title: 'Edition Story — Solaris Studio' },
    { name: 'description', content: 'A reviewed edition timeline from the Solaris Song Contest archive.' },
  ] }),
  component: EditionStoryPage,
});

function EditionStoryPage() {
  const { editionSlug } = Route.useParams();
  const storyQuery = useQuery({
    queryKey: ['public-storyline', editionSlug],
    queryFn: () => loadPublicStoryline(editionSlug),
    staleTime: 60_000,
  });
  const story = storyQuery.data ?? null;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <a href="/stories" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Story archive
        </a>

        {storyQuery.isLoading ? (
          <EmptyStory title="Loading edition story…" copy="Reading the published narrative." />
        ) : storyQuery.error ? (
          <EmptyStory title="Story unavailable" copy={errorText(storyQuery.error)} />
        ) : !story ? (
          <EmptyStory title="No published story for this edition" copy="The edition may not have a reviewed storyline yet, or its storyline has been returned to draft for editing." />
        ) : (
          <>
            <header className="mt-8 max-w-3xl">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">
                {story.editionNumber != null ? `SSC ${story.editionNumber}` : story.editionName}
                {story.eventDate ? ` · ${story.eventDate}` : ''}
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-foreground sm:text-6xl">{story.title}</h1>
              {story.subtitle ? <p className="mt-3 text-lg font-semibold text-foreground/80">{story.subtitle}</p> : null}
              {story.introduction ? <p className="mt-5 text-base leading-relaxed text-muted-foreground">{story.introduction}</p> : null}
              <p className="mt-4 text-xs text-muted-foreground">Published {formatDate(story.publishedAt)} · {story.items.length} reviewed moments</p>
            </header>

            <section className="relative mt-12" aria-label={`${story.editionName} timeline`}>
              <div className="absolute bottom-0 left-[17px] top-1 w-px bg-border/70 sm:left-[21px]" aria-hidden="true" />
              <div className="space-y-6">
                {story.items.map((item, index) => (
                  <article key={item.id ?? `${item.occurredAt}-${index}`} className="relative pl-12 sm:pl-14">
                    <div className="absolute left-2.5 top-1.5 grid size-4 place-items-center rounded-full border border-primary/40 bg-background sm:left-3.5" aria-hidden="true">
                      <span className="size-1.5 rounded-full bg-primary" />
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-card/55 p-5 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.13em] text-muted-foreground">
                          <CalendarDays className="size-3.5" /> {formatDate(item.occurredAt)}
                        </span>
                        <span className="rounded-full border border-border/60 px-2.5 py-1 text-[10px] font-bold text-muted-foreground">importance {item.importance}</span>
                      </div>
                      <h2 className="mt-3 text-xl font-black tracking-[-0.025em] sm:text-2xl">{item.headline}</h2>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{item.summary}</p>
                      {item.sourceEventType ? <p className="mt-4 text-[10px] font-black uppercase tracking-[0.13em] text-muted-foreground/70">{item.sourceEventType}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}

function EmptyStory({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="mt-8 rounded-2xl border border-dashed border-border/70 bg-card/35 px-6 py-14 text-center">
      <BookOpen className="mx-auto size-6 text-muted-foreground" />
      <h1 className="mt-4 text-xl font-bold">{title}</h1>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{copy}</p>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'Unexpected story archive error.';
}
