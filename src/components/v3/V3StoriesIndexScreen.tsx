import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BookOpen, CalendarDays, ChevronRight } from "lucide-react";

import type { V3StoriesIndexBundle } from "@/lib/v3-stories";
import {
  V3Screen,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

function EmptyStoryState({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof BookOpen;
  title: string;
  description: string;
}) {
  return (
    <div role="status" className="border-y border-white/[0.07] py-9 text-center">
      <Icon className="mx-auto size-5 text-white/30" aria-hidden="true" />
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-white/45">{description}</p>
    </div>
  );
}

export function V3StoriesIndexScreen({
  bundle,
  hideSpoilers,
}: {
  bundle: V3StoriesIndexBundle;
  hideSpoilers: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const protectedView = hideSpoilers && !revealed;

  return (
    <V3Screen>
      <header className="mb-6 max-w-3xl" data-v3-stories-header="">
        <p className="v3-kicker">Solaris archive</p>
        <h1 className="mt-2 max-w-[13ch] text-[clamp(2rem,9vw,3.3rem)] font-semibold leading-[0.96] tracking-[-0.055em]">
          Stories that shaped the contest
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50 sm:text-[0.95rem]">
          Reviewed narratives and published moments from Solaris history. Drafts remain private until organizers publish them.
        </p>
      </header>

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
            className="mt-4 min-h-11 rounded-xl bg-[var(--v3-accent)] px-4 font-semibold text-[var(--v3-bg-base)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
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
              <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]" data-v3-stories-on-this-day="">
                {bundle.anniversary.onThisDay.slice(0, 6).map((moment, index) => {
                  const body = (
                    <>
                      <div className="min-w-0 flex-1 py-4">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em]">
                          <span className="text-primary">
                            {moment.yearsAgo != null ? `${moment.yearsAgo} years ago` : "Archive moment"}
                          </span>
                          <span className="text-white/32">{moment.editionName ?? "Solaris Song Contest"}</span>
                        </div>
                        <h3 className="mt-2 text-[1.05rem] font-semibold leading-tight tracking-[-0.025em]">
                          {moment.headline}
                        </h3>
                        <p className="mt-1.5 max-w-3xl text-xs leading-5 text-white/48">{moment.summary}</p>
                      </div>
                      {moment.editionSlug ? (
                        <ChevronRight className="size-4 shrink-0 text-white/25" aria-hidden="true" />
                      ) : null}
                    </>
                  );

                  return moment.editionSlug ? (
                    <Link
                      key={`${moment.editionSlug}:${moment.occurredAt}:${index}`}
                      to="/stories/$editionSlug"
                      params={{ editionSlug: moment.editionSlug }}
                      className="flex min-h-20 items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    >
                      {body}
                    </Link>
                  ) : (
                    <article
                      key={`moment:${moment.occurredAt}:${index}`}
                      className="flex min-h-20 items-center gap-3"
                    >
                      {body}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyStoryState
                icon={CalendarDays}
                title="No published moments for today"
                description="As reviewed edition stories are published, the calendar archive fills itself from those public moments."
              />
            )}
          </V3Section>

          <V3Section title="Edition stories" meta={`${bundle.stories.length} published`}>
            {bundle.stories.length ? (
              <div className="divide-y divide-white/[0.065] border-y border-white/[0.07]" data-v3-stories-edition-list="">
                {bundle.stories.map((story, index) => (
                  <Link
                    key={story.editionId}
                    to="/stories/$editionSlug"
                    params={{ editionSlug: story.editionSlug }}
                    className="group grid min-h-28 grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-3 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
                  >
                    <div className="pt-0.5">
                      <span className="block text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">
                        {story.editionNumber != null ? `SSC ${story.editionNumber}` : "Edition"}
                      </span>
                      <span className="mt-1 block text-[0.68rem] text-white/34">{story.itemCount} moments</span>
                    </div>
                    <article className="min-w-0">
                      <h3 className="text-[1.18rem] font-semibold leading-[1.08] tracking-[-0.035em] transition-colors group-hover:text-primary sm:text-[1.3rem]">
                        {story.title}
                      </h3>
                      {story.subtitle ? (
                        <p className="mt-1 text-xs font-medium text-white/64">{story.subtitle}</p>
                      ) : null}
                      <p className="mt-2 line-clamp-2 max-w-3xl text-xs leading-5 text-white/46">
                        {story.introduction ?? story.heroMoment?.summary ?? "Open the reviewed edition timeline."}
                      </p>
                      {index === 0 && story.heroMoment ? (
                        <p className="mt-2 text-[0.69rem] leading-5 text-white/38">
                          <span className="font-semibold text-white/55">Defining moment:</span>{" "}
                          {story.heroMoment.headline}
                        </p>
                      ) : null}
                    </article>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-white/24 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyStoryState
                icon={BookOpen}
                title="No edition stories published yet"
                description="Drafts remain private until organizers explicitly publish them."
              />
            )}
          </V3Section>

          <nav aria-label="Story archive links" className="mt-8 flex flex-wrap gap-x-5 gap-y-3 border-t border-white/[0.07] pt-5 text-sm">
            <Link to="/archive" className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
              Browse the full archive
            </Link>
            <Link to="/wiki" className="font-semibold text-white/62 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70">
              Open the encyclopedia
            </Link>
          </nav>
        </>
      )}
    </V3Screen>
  );
}
