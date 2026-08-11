import { useState } from "react";

import type { ResultStory } from "@/lib/stories";
import { cn } from "@/lib/utils";

export function StoryCards({
  stories,
  selectedStory,
  limit,
}: {
  stories: ResultStory[];
  selectedStory?: string | null;
  limit?: number;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const visible = limit == null ? stories : stories.slice(0, limit);

  const share = async (story: ResultStory) => {
    const url = new URL(story.href, window.location.origin).toString();

    try {
      if (navigator.share) {
        await navigator.share({
          title: story.headline,
          text: story.explanation,
          url,
        });
        return;
      }

      await navigator.clipboard.writeText(url);
      setCopied(story.id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        console.error("Could not share result story", error);
      }
    }
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {visible.map((story) => (
        <article
          id={`story-${story.id}`}
          key={story.id}
          className={cn(
            "scroll-mt-28 rounded-2xl border border-border/70 bg-surface/80 p-4",
            selectedStory === story.id && "ring-2 ring-primary",
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
              Result story
            </p>

            <span className="numeric rounded-full bg-background/50 px-2 py-1 text-[10px] font-semibold text-muted-foreground">
              {story.metricValue}
            </span>
          </div>

          <h3 className="mt-3 font-display text-lg font-semibold leading-tight">
            {story.headline}
          </h3>

          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{story.explanation}</p>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {story.metricLabel}
            </span>

            <button
              type="button"
              onClick={() => void share(story)}
              className="min-h-10 rounded-xl border border-border bg-background/40 px-3 text-xs font-semibold hover:bg-surface-strong"
            >
              {copied === story.id ? "Link copied" : "Share story"}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
