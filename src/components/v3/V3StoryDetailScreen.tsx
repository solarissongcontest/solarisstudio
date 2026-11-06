import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BookOpen, CalendarDays, Share2 } from "lucide-react";

import { formatEventWallTime } from "@/lib/public-time";
import type { V3StoryDetailBundle } from "@/lib/v3-stories";
import {
  V3ActionCard,
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
  const [shareMessage, setShareMessage] = useState<string | null>(null);
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
        <Link to="/stories" className="text-xs font-semibold text-primary hover:underline">
          ← Story archive
        </Link>
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

  const shareTitle = story.title;

  async function shareStory() {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    setShareMessage(null);

    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: shareTitle, url });
        setShareMessage("Story shared.");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareMessage("Story link copied.");
        return;
      }

      setShareMessage("Copy this page address from your browser to share it.");
    } catch (error) {
      if ((error as { name?: string } | null)?.name === "AbortError") return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          setShareMessage("Story link copied.");
          return;
        }
      } catch {
        // Fall through to stable public-safe copy below.
      }
      setShareMessage("Sharing is unavailable on this device.");
    }
  }

  return (
    <V3Screen>
      <Link to="/stories" className="text-xs font-semibold text-primary hover:underline">
        ← Story archive
      </Link>

      <div className="mt-5">
        <V3ScreenHeader
          kicker={`${story.editionNumber != null ? `SSC ${story.editionNumber}` : story.editionName}${story.eventDate ? ` · ${story.eventDate}` : ""}`}
          title={story.title}
          description={story.introduction ?? undefined}
          editorial
        />
        {bundle.artwork ? (
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025]">
            <img
              src={bundle.artwork.src}
              alt={bundle.artwork.alt}
              className="aspect-[16/9] w-full object-cover"
              decoding="async"
            />
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {story.subtitle ? <V3StatusChip tone="neutral">{story.subtitle}</V3StatusChip> : null}
          <span className="text-xs text-white/38">
            Published {formatEventWallTime(story.publishedAt, { locale: "en-GB" })} · {story.items.length} reviewed moments
          </span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {bundle.relatedEdition ? (
            <Link
              to={bundle.relatedEdition.href as any}
              className="inline-flex min-h-11 items-center rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm font-semibold text-white/78 hover:bg-white/[0.06] hover:text-white"
            >
              Explore {bundle.relatedEdition.label}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void shareStory()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm font-semibold text-white/78 hover:bg-white/[0.06] hover:text-white"
          >
            <Share2 className="size-4" aria-hidden="true" />
            Share story
          </button>
          {shareMessage ? (
            <span role="status" className="text-xs text-white/48">
              {shareMessage}
            </span>
          ) : null}
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
                        {formatEventWallTime(item.occurredAt, { locale: "en-GB" })}
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

      {bundle.relatedStories.length ? (
        <V3Section title="More published stories" meta={`${bundle.relatedStories.length} stories`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bundle.relatedStories.map((related) => (
              <V3ActionCard
                key={related.editionId}
                title={related.title}
                description={
                  related.subtitle ??
                  `${related.editionNumber != null ? `SSC ${related.editionNumber}` : related.editionName} · ${related.itemCount} moments`
                }
                tone="neutral"
                to={`/stories/${encodeURIComponent(related.editionSlug)}`}
              />
            ))}
          </div>
        </V3Section>
      ) : null}
    </V3Screen>
  );
}
