import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BookOpen, CalendarDays } from "lucide-react";

import type { V3StoriesIndexBundle, V3StorySummary } from "@/lib/v3-stories";
import {
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

export function V3StoriesIndexScreen({
  bundle,
  hideSpoilers,
}: {
  bundle: V3StoriesIndexBundle;
  hideSpoilers: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const protectedView = hideSpoilers && !revealed;
  const hasClassifiedStories = Boolean(bundle.currentStory) || bundle.historicalStories.length > 0;

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Solaris archive"
        title="Stories"
        description="Reviewed narratives and published moments from Solaris history. Drafts stay private until an organizer explicitly publishes them."
        editorial
      />

      {protectedView ? (
        <V3Surface level="raised" className="p-5" data-v3-stories-spoiler-protected="">
          <div className="flex flex-wrap items-center gap-2">
            <V3StatusChip tone="warning">Spoiler-free</V3StatusChip>
            <V3StatusChip tone="neutral">Published stories hidden</V3StatusChip>
          </div>
          <h2 className="mt-4 text-lg font-bold">Stories are available</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52">
            Story titles, summaries, defining moments and archive previews stay hidden because spoiler-free mode is on.
          </p>
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-4 min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)]"
          >
            Reveal published stories
          </button>
        </V3Surface>
      ) : (
        <>
          <V3Section
            title="On this day"
            meta={
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/42">{bundle.anniversary.referenceDate}</span>
                {bundle.anniversary.sscAnniversary ? (
                  <V3StatusChip tone="success">
                    {bundle.anniversary.sscAnniversary.label}
                  </V3StatusChip>
                ) : null}
              </div>
            }
          >
            {bundle.anniversary.onThisDay.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {bundle.anniversary.onThisDay.slice(0, 6).map((moment, index) => (
                  <V3Surface
                    key={`${moment.editionSlug ?? "moment"}:${moment.occurredAt}:${index}`}
                    level="raised"
                    className="p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[0.65rem] font-bold uppercase tracking-[0.13em] text-primary">
                        {moment.yearsAgo != null ? `${moment.yearsAgo} years ago` : "Archive moment"}
                      </span>
                      <span className="text-[0.65rem] text-white/38">
                        importance {moment.importance}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-bold leading-tight">{moment.headline}</h3>
                    <p className="mt-2 text-xs leading-5 text-white/48">{moment.summary}</p>
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span className="text-xs text-white/38">
                        {moment.editionName ?? "Solaris Song Contest"}
                      </span>
                      {moment.editionSlug ? (
                        <Link
                          to="/stories/$editionSlug"
                          params={{ editionSlug: moment.editionSlug }}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Open story
                        </Link>
                      ) : null}
                    </div>
                  </V3Surface>
                ))}
              </div>
            ) : (
              <V3Surface className="p-5">
                <div role="status" className="text-center">
                  <CalendarDays className="mx-auto size-5 text-white/32" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold">No published moments for today</p>
                  <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-white/45">
                    As reviewed edition stories are published, the calendar archive fills itself from those public moments.
                  </p>
                </div>
              </V3Surface>
            )}
          </V3Section>

          {bundle.currentStory ? (
            <V3Section
              title="Current edition story"
              meta={
                bundle.currentStory.editionNumber != null
                  ? `SSC ${bundle.currentStory.editionNumber}`
                  : bundle.currentStory.editionName
              }
            >
              <div className="max-w-3xl">
                <StoryCard story={bundle.currentStory} />
              </div>
            </V3Section>
          ) : null}

          {bundle.historicalStories.length ? (
            <V3Section title="Story archive" meta={`${bundle.historicalStories.length} historical`}>
              <div className="grid gap-4 md:grid-cols-2">
                {bundle.historicalStories.map((story) => (
                  <StoryCard key={story.editionId} story={story} />
                ))}
              </div>
            </V3Section>
          ) : null}

          {!hasClassifiedStories ? (
            <V3Section title="Edition stories" meta={`${bundle.stories.length} published`}>
              {bundle.stories.length ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {bundle.stories.map((story) => (
                    <StoryCard key={story.editionId} story={story} />
                  ))}
                </div>
              ) : (
                <V3Surface className="p-6">
                  <div role="status" className="text-center">
                    <BookOpen className="mx-auto size-5 text-white/32" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold">No edition stories published yet</p>
                    <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-white/45">
                      Drafts remain private until organizers explicitly publish them.
                    </p>
                  </div>
                </V3Surface>
              )}
            </V3Section>
          ) : null}
        </>
      )}
    </V3Screen>
  );
}

function StoryCard({ story }: { story: V3StorySummary }) {
  return (
    <Link
      to="/stories/$editionSlug"
      params={{ editionSlug: story.editionSlug }}
      className="block rounded-[var(--v3-radius-xl)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
    >
      <V3Surface level="raised" className="h-full p-5 transition hover:bg-white/[0.045]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.13em] text-primary">
            {story.editionNumber != null ? `SSC ${story.editionNumber}` : story.editionName}
          </span>
          <span className="text-xs text-white/38">{story.itemCount} moments</span>
        </div>
        <h3 className="mt-3 text-2xl font-black tracking-[-0.03em]">{story.title}</h3>
        {story.subtitle ? (
          <p className="mt-1 text-sm font-semibold text-white/70">{story.subtitle}</p>
        ) : null}
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/48">
          {story.introduction ?? story.heroMoment?.summary ?? "Open the reviewed edition timeline."}
        </p>
        {story.heroMoment ? (
          <div className="mt-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-white/35">
              Defining moment
            </p>
            <p className="mt-1 text-sm font-semibold">{story.heroMoment.headline}</p>
          </div>
        ) : null}
      </V3Surface>
    </Link>
  );
}
