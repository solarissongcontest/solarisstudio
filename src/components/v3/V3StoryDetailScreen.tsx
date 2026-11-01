import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BookOpen, CalendarDays, ChevronRight, Share2 } from "lucide-react";

import type { V3StoryDetailBundle } from "@/lib/v3-stories";
import {
  V3Screen,
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
        <Link to="/stories" className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
          ← Story archive
        </Link>
        <div className="mt-6 border-y border-white/[0.07] py-9 text-center" role="status">
          <BookOpen className="mx-auto size-6 text-white/32" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-semibold">No published story for this edition</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-white/48">
            The edition may not have a reviewed storyline yet, or its storyline has been returned to draft for editing.
          </p>
        </div>
      </V3Screen>
    );
  }

  if (hideSpoilers && !revealed) {
    return (
      <V3Screen>
        <Link to="/stories" className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
          ← Story archive
        </Link>
        <V3Surface level="raised" className="mt-5 p-5" data-v3-story-spoiler-protected="">
          <div className="flex flex-wrap items-center gap-2">
            <V3StatusChip tone="warning">Spoiler-free</V3StatusChip>
            <V3StatusChip tone="neutral">Story content hidden</V3StatusChip>
          </div>
          <h1 className="mt-4 text-xl font-semibold">A published edition story is available</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
            The title, introduction and timeline moments stay hidden because spoiler-free mode is on.
          </p>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-4 min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
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
      <Link to="/stories" className="text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
        ← Story archive
      </Link>

      <header className="mt-5 max-w-3xl" data-v3-story-detail-header="">
        <p className="v3-kicker">
          {story.editionNumber != null ? `SSC ${story.editionNumber}` : story.editionName}
          {story.eventDate ? ` · ${story.eventDate}` : ""}
        </p>
        <h1 className="mt-2 max-w-[18ch] text-[clamp(2rem,9vw,3.4rem)] font-semibold leading-[0.96] tracking-[-0.055em]">
          {story.title}
        </h1>
        {story.subtitle ? (
          <p className="mt-2 text-sm font-semibold text-white/68">{story.subtitle}</p>
        ) : null}
        {story.introduction ? (
          <p className="mt-4 max-w-2xl text-sm leading-6 text-white/52 sm:text-base">{story.introduction}</p>
        ) : null}
        <p className="mt-3 text-xs text-white/38">
          Published {formatDate(story.publishedAt)} · {story.items.length} reviewed moments
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {bundle.relatedEdition ? (
            <Link
              to={bundle.relatedEdition.href as any}
              className="inline-flex min-h-11 items-center rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm font-semibold text-white/78 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              Explore {bundle.relatedEdition.label}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void shareStory()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-4 text-sm font-semibold text-white/78 hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
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
      </header>

      <V3Section title="Edition timeline" meta={`${story.items.length} moments`}>
        {story.items.length ? (
          <div className="relative" data-v3-story-timeline="">
            <div
              className="absolute bottom-4 left-[8px] top-4 w-px bg-white/[0.09]"
              aria-hidden="true"
            />
            <div className="divide-y divide-white/[0.06]">
              {story.items.map((item, index) => (
                <article
                  key={item.id ?? `${item.occurredAt}:${index}`}
                  className="relative py-5 pl-8"
                >
                  <span
                    className="absolute left-[3px] top-7 grid size-[11px] place-items-center rounded-full border border-primary/55 bg-[var(--v3-bg-base)]"
                    aria-hidden="true"
                  >
                    <span className="size-1 rounded-full bg-primary" />
                  </span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.12em] text-white/42">
                      <CalendarDays className="size-3.5" aria-hidden="true" />
                      {formatDate(item.occurredAt)}
                    </span>
                    <span className="text-[0.65rem] text-white/30">importance {item.importance}</span>
                  </div>
                  <h2 className="mt-2 max-w-[30ch] text-[1.2rem] font-semibold leading-tight tracking-[-0.03em] sm:text-[1.4rem]">
                    {item.headline}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/52 sm:text-[0.95rem]">
                    {item.summary}
                  </p>
                  {item.sourceEventType ? (
                    <p className="mt-3 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-white/30">
                      {item.sourceEventType}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="border-y border-white/[0.07] py-6">
            <p role="status" className="text-sm text-white/48">
              This published story does not contain timeline moments yet.
            </p>
          </div>
        )}
      </V3Section>

      {bundle.relatedStories.length ? (
        <V3Section title="More published stories" meta={`${bundle.relatedStories.length} stories`}>
          <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]" data-v3-related-stories="">
            {bundle.relatedStories.map((related) => (
              <Link
                key={related.editionId}
                to={`/stories/${encodeURIComponent(related.editionSlug)}` as any}
                className="group flex min-h-16 items-center gap-3 py-3.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold tracking-[-0.015em]">{related.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-white/44">
                    {related.subtitle ?? `${related.editionNumber != null ? `SSC ${related.editionNumber}` : related.editionName} · ${related.itemCount} moments`}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-white/24 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </V3Section>
      ) : null}
    </V3Screen>
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
