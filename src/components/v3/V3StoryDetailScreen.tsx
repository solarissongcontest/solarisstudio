import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BookOpen, CalendarDays, Share2 } from "lucide-react";
import { toast } from "sonner";

import type { V3StoryDetailBundle } from "@/lib/v3-stories";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

export function V3StoryDetailScreen({
  bundle,
  hideSpoilers,
}: {
  bundle: V3StoryDetailBundle;
  hideSpoilers: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const story = bundle.story;

  if (!story) {
    return (
      <V3Screen>
        <Link to="/stories" className="text-xs font-semibold text-primary hover:underline">
          ← Story archive
        </Link>
        <V3Surface className="mt-5 p-8">
          <div role="status" className="text-center">
            <BookOpen className="mx-auto size-6 text-white/32" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-bold">No published story for this edition</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/48">
              The edition may not have a reviewed storyline yet, or its storyline has been returned to draft for editing.
            </p>
          </div>
        </V3Surface>
      </V3Screen>
    );
  }

  if (hideSpoilers && !revealed) {
    return (
      <V3Screen>
        <StoryContextLinks editionSlug={story.editionSlug} />
        <V3Surface level="raised" className="mt-5 p-5" data-v3-story-spoiler-protected="">
          <div className="flex flex-wrap items-center gap-2">
            <V3StatusChip tone="warning">Spoiler-free</V3StatusChip>
            <V3StatusChip tone="neutral">Story content hidden</V3StatusChip>
          </div>
          <h1 className="mt-4 text-xl font-bold">A published edition story is available</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
            The title, introduction and timeline moments stay hidden because spoiler-free mode is on.
          </p>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-4 min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)]"
          >
            Reveal edition story
          </button>
        </V3Surface>
      </V3Screen>
    );
  }

  return (
    <V3Screen>
      <StoryContextLinks editionSlug={story.editionSlug} />

      <div className="mt-5">
        <V3ScreenHeader
          kicker={`${story.editionNumber != null ? `SSC ${story.editionNumber}` : story.editionName}${story.eventDate ? ` · ${story.eventDate}` : ""}`}
          title={story.title}
          description={story.introduction ?? undefined}
          editorial
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {story.subtitle ? <V3StatusChip tone="neutral">{story.subtitle}</V3StatusChip> : null}
          <span className="text-xs text-white/38">
            Published {formatDate(story.publishedAt)} · {story.items.length} reviewed moments
          </span>
        </div>
        <div className="mt-4">
          <StoryShareButton title={story.title} editionSlug={story.editionSlug} />
        </div>
      </div>

      <V3Section title="Edition timeline" meta={`${story.items.length} moments`}>
        {story.items.length ? (
          <div className="relative">
            <div
              className="absolute bottom-0 left-[15px] top-1 w-px bg-white/[0.08]"
              aria-hidden="true"
            />
            <div className="space-y-4">
              {story.items.map((item, index) => (
                <article
                  key={item.id ?? `${item.occurredAt}:${index}`}
                  className="relative pl-11"
                >
                  <span
                    className="absolute left-[9px] top-5 grid size-3 place-items-center rounded-full border border-primary/55 bg-[var(--v3-bg)]"
                    aria-hidden="true"
                  >
                    <span className="size-1 rounded-full bg-primary" />
                  </span>
                  <V3Surface level="raised" className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-white/42">
                        <CalendarDays className="size-3.5" aria-hidden="true" />
                        {formatDate(item.occurredAt)}
                      </span>
                      <V3StatusChip tone="neutral">importance {item.importance}</V3StatusChip>
                    </div>
                    <h2 className="mt-3 text-xl font-black tracking-[-0.025em] sm:text-2xl">
                      {item.headline}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-white/52 sm:text-base">
                      {item.summary}
                    </p>
                    {item.sourceEventType ? (
                      <p className="mt-4 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-white/30">
                        {item.sourceEventType}
                      </p>
                    ) : null}
                  </V3Surface>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <V3Surface className="p-6">
            <p role="status" className="text-sm text-white/48">
              This published story does not contain timeline moments yet.
            </p>
          </V3Surface>
        )}
      </V3Section>

      {bundle.moreStories.length ? (
        <V3Section title="More published stories" meta={`${bundle.moreStories.length} nearby in the archive`}>
          <div className="grid gap-3 md:grid-cols-3">
            {bundle.moreStories.map((related) => (
              <Link
                key={related.editionId}
                to="/stories/$editionSlug"
                params={{ editionSlug: related.editionSlug }}
                className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <V3Surface level="raised" className="h-full p-4 transition hover:border-white/20">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-white/38">
                    {related.editionNumber != null ? `SSC ${related.editionNumber}` : related.editionName}
                  </p>
                  <h2 className="mt-2 text-base font-bold leading-5">{related.title}</h2>
                  <p className="mt-2 text-xs leading-5 text-white/45">
                    {related.itemCount} reviewed moment{related.itemCount === 1 ? "" : "s"}
                  </p>
                </V3Surface>
              </Link>
            ))}
          </div>
        </V3Section>
      ) : null}
    </V3Screen>
  );
}

function StoryContextLinks({ editionSlug }: { editionSlug: string }) {
  return (
    <nav aria-label="Story context" className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Link to="/stories" className="text-xs font-semibold text-primary hover:underline">
        ← Story archive
      </Link>
      <Link
        to="/editions/$slug"
        params={{ slug: editionSlug }}
        className="text-xs font-semibold text-primary hover:underline"
      >
        Open edition →
      </Link>
    </nav>
  );
}

function StoryShareButton({ title, editionSlug }: { title: string; editionSlug: string }) {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (busy || typeof window === "undefined") return;

    const url = new URL(`/stories/${encodeURIComponent(editionSlug)}`, window.location.origin).toString();
    setBusy(true);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, url });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Story link copied.");
        return;
      }
      toast.error("Sharing is not available on this device.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Could not share this story.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void share()}
      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white/80 transition hover:border-white/20 hover:bg-white/[0.07] disabled:cursor-wait disabled:opacity-60"
      aria-label={`Share ${title}`}
    >
      <Share2 className="size-4" aria-hidden="true" />
      Share story
    </button>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}
