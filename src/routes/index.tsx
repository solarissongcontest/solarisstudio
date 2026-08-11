import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import { BackgroundFlag } from "@/components/BackgroundFlag";
import { FlagChip } from "@/components/FlagChip";
import { PulseStrip } from "@/components/PulseStrip";
import {
  editionLabel,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";
import {
  buildHomeNewsroomStories,
  namedResults,
  winnerLeadStory,
  type HomeNewsStory,
} from "@/lib/home-newsroom";
import {
  isShowPublic,
  showPublishesResults,
} from "@/lib/publication";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Solaris Today — Solaris Song Contest" },
      {
        name: "description",
        content:
          "The Solaris Song Contest newsroom: latest results, voting stories, predictions, records, interactive tools and archive analysis.",
      },
    ],
  }),
  component: HomePage,
});

const FEATURE_DESKS = [
  {
    to: "/pulse",
    label: "Live desk",
    title: "Solaris Pulse",
    description: "Follow the countries, editions and shows you care about and get the important changes in one feed.",
  },
  {
    to: "/predictions",
    label: "Prediction desk",
    title: "Prediction Arena",
    description: "Call the winner, qualifiers and rankings before the round locks, then see how your prediction survived reality.",
  },
  {
    to: "/result-lab",
    label: "What-if desk",
    title: "Result Lab",
    description: "Change the jury/televote balance, remove juries and recalculate a published result without touching the official score.",
  },
  {
    to: "/taste-dna",
    label: "Personal desk",
    title: "Taste DNA",
    description: "Rank a field and discover whether your taste is jury-coded, televote-coded, mainstream or gloriously difficult.",
  },
  {
    to: "/broadcast-intelligence",
    label: "Results desk",
    title: "Broadcast Intelligence",
    description: "Replay the televote reveal and inspect lead changes, collapses, comebacks and jury-versus-public drama.",
  },
  {
    to: "/archive-games",
    label: "Games desk",
    title: "Archive Games",
    description: "Turn historical results into quick Higher or Lower, Jury vs Televote and Edition Detective rounds.",
  },
  {
    to: "/analysis",
    label: "Data desk",
    title: "Analysis",
    description: "Explore voting patterns, scoring behaviour and the deeper numbers behind the final rankings.",
  },
  {
    to: "/relationships",
    label: "Network desk",
    title: "Relationships",
    description: "See which countries repeatedly support each other, share taste or develop suspiciously persistent rivalries.",
  },
  {
    to: "/compare",
    label: "Head-to-head",
    title: "Compare countries",
    description: "Put two delegations side by side across placements, points and voting history.",
  },
  {
    to: "/records",
    label: "Archive desk",
    title: "Records",
    description: "Track the wins, streaks, points and all-time marks that still define Solaris history.",
  },
  {
    to: "/editions",
    label: "Contest archive",
    title: "Editions",
    description: "Open every published contest chapter, show and result from the Solaris archive.",
  },
  {
    to: "/countries",
    label: "Delegation desk",
    title: "Countries",
    description: "Browse every delegation's placements, voting profile and contest history.",
  },
] as const;

function HomePage() {
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: countries } = useCountries();
  const { data: results } = useAllResults();

  const editionList = useMemo(
    () => (editions ?? []).filter((edition) => edition.published),
    [editions],
  );
  const showList = shows ?? [];
  const countryList = countries ?? [];
  const resultList = results ?? [];

  const countryMap = useMemo(
    () => new Map(countryList.map((country) => [country.id, country])),
    [countryList],
  );

  const sortedEditions = useMemo(
    () =>
      [...editionList].sort(
        (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
      ),
    [editionList],
  );

  const latestEdition = sortedEditions[0] ?? null;

  const latestEditionShows = useMemo(
    () =>
      latestEdition
        ? showList
            .filter(
              (show) => show.edition_id === latestEdition.id && isShowPublic(show),
            )
            .sort((a, b) => a.sort_order - b.sort_order)
        : [],
    [latestEdition, showList],
  );

  const latestCompletedShow = useMemo(() => {
    const completed = showList.filter(
      (show) =>
        showPublishesResults(show) &&
        resultList.some(
          (result) => result.show_id === show.id && result.final_rank != null,
        ),
    );

    return (
      [...completed].sort((a, b) => {
        const editionA = editionList.find((edition) => edition.id === a.edition_id);
        const editionB = editionList.find((edition) => edition.id === b.edition_id);
        const editionDifference =
          (editionB?.edition_number ?? -1) - (editionA?.edition_number ?? -1);
        if (editionDifference !== 0) return editionDifference;
        return b.sort_order - a.sort_order;
      })[0] ?? null
    );
  }, [showList, resultList, editionList]);

  const latestCompletedEdition = latestCompletedShow
    ? editionList.find((edition) => edition.id === latestCompletedShow.edition_id) ?? null
    : null;

  const latestCompletedResults = useMemo(
    () =>
      latestCompletedShow
        ? resultList
            .filter(
              (result) =>
                result.show_id === latestCompletedShow.id && result.final_rank != null,
            )
            .sort((a, b) => (a.final_rank ?? 999) - (b.final_rank ?? 999))
        : [],
    [latestCompletedShow, resultList],
  );

  const namedLatestResults = useMemo(
    () =>
      namedResults(
        latestCompletedResults,
        (id) => countryMap.get(id)?.name ?? "Unknown country",
      ),
    [latestCompletedResults, countryMap],
  );

  const winner = namedLatestResults.find((entry) => entry.finalRank === 1) ?? namedLatestResults[0] ?? null;
  const winnerCountry = winner ? countryMap.get(winner.countryId) ?? null : null;
  const leadStory = latestCompletedShow
    ? winnerLeadStory(namedLatestResults, latestCompletedShow.name)
    : null;
  const newsroomStories = buildHomeNewsroomStories(namedLatestResults);
  const topFive = latestCompletedResults.slice(0, 5);

  const grandFinalIds = new Set(
    showList
      .filter((show) => show.kind === "grand-final" && showPublishesResults(show))
      .map((show) => show.id),
  );
  const totalWinners = resultList.filter(
    (result) => result.final_rank === 1 && result.show_id && grandFinalIds.has(result.show_id),
  ).length;
  const publicShowCount = showList.filter(isShowPublic).length;
  const latestEditionIsActive = Boolean(
    latestEdition && !["complete", "completed"].includes(latestEdition.status.toLowerCase()),
  );

  const breakingStory = newsroomStories.find((story) => story.intensity === "breaking") ?? newsroomStories[0] ?? leadStory;

  return (
    <AppShell>
      <div className="min-w-0 space-y-6 sm:space-y-10">
        <header className="min-w-0 border-b border-border/70 pb-4">
          <div className="flex min-w-0 items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-primary sm:text-[10px]">
                TSBC Newsroom
              </p>
              <h1 className="mt-1 break-words font-display text-3xl font-black tracking-[-0.045em] sm:text-5xl">
                Solaris Today
              </h1>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
                Results, voting drama, predictions and the stories hiding inside the scoreboard.
              </p>
            </div>

            <div className="hidden shrink-0 text-right sm:block">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Terra Solaris
              </p>
              <p className="mt-1 text-xs font-semibold">Song Contest Desk</p>
            </div>
          </div>

          <div className="mt-4 flex min-w-0 items-center gap-3 border-y border-border/60 py-2.5">
            <span className="shrink-0 rounded-md bg-primary px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-primary-foreground">
              {latestEditionIsActive ? "Live" : breakingStory?.intensity === "breaking" ? "Breaking" : "Latest"}
            </span>
            <p className="min-w-0 flex-1 truncate text-xs font-semibold sm:text-sm">
              {breakingStory?.headline ??
                (latestEdition
                  ? `${editionLabel(latestEdition)} is the latest published Solaris edition`
                  : "The Solaris newsroom is waiting for its next story")}
            </p>
            <Link
              to="/tools"
              className="shrink-0 text-[9px] font-black uppercase tracking-[0.13em] text-primary sm:text-[10px]"
            >
              All desks →
            </Link>
          </div>
        </header>

        <PulseStrip />

        <section className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,.65fr)]">
          {latestCompletedEdition && latestCompletedShow && leadStory ? (
            <Link
              to="/shows/$showId"
              params={{ showId: latestCompletedShow.id }}
              className="group relative min-h-[390px] min-w-0 overflow-hidden rounded-[1.8rem] border border-white/15 bg-[#020817] shadow-2xl sm:min-h-[540px]"
            >
              <BackgroundFlag
                image={winnerCountry?.flag_image}
                className="-right-[18%] top-[45%] w-[105%] -translate-y-1/2 sm:w-[66%]"
                opacity={0.32}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#020817] via-[#041329]/78 to-[#061d39]/24" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#020817]/75 via-transparent to-transparent" />

              <div className="relative z-10 flex min-h-[390px] flex-col justify-between p-5 sm:min-h-[540px] sm:p-8 lg:p-9">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-primary px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.16em] text-primary-foreground">
                    {leadStory.label}
                  </span>
                  <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.15em] text-white/70 backdrop-blur">
                    {editionLabel(latestCompletedEdition)} · {latestCompletedShow.name}
                  </span>
                </div>

                <div className="min-w-0 max-w-4xl">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">
                    Lead story
                  </p>
                  <h2 className="mt-3 break-words font-display text-[2rem] font-black leading-[0.96] tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
                    {leadStory.headline}
                  </h2>
                  <p className="mt-4 max-w-2xl break-words text-sm leading-relaxed text-white/65 sm:text-base">
                    {leadStory.detail}
                  </p>
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <span className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-black text-[#061225] transition-transform group-hover:translate-x-1">
                      Open result →
                    </span>
                    {winner && (
                      <span className="numeric text-xs font-semibold text-white/55">
                        {winner.totalPoints} winner points
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ) : latestEdition ? (
            <Link
              to="/editions/$slug"
              params={{ slug: latestEdition.slug }}
              className="glass flex min-h-[300px] min-w-0 items-end p-5 sm:min-h-[420px] sm:p-8"
            >
              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Edition desk</p>
                <h2 className="mt-2 break-words font-display text-3xl font-black sm:text-5xl">
                  {editionLabel(latestEdition)} is now in focus
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  Open the edition for every show, entry, publication and result currently available.
                </p>
              </div>
            </Link>
          ) : (
            <div className="glass flex min-h-[280px] items-end p-5 sm:min-h-[360px] sm:p-8">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary">Newsroom</p>
                <h2 className="mt-2 font-display text-3xl font-black">No public edition yet</h2>
                <p className="mt-3 text-sm text-muted-foreground">The homepage will build itself around the first published edition.</p>
              </div>
            </div>
          )}

          <aside className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {newsroomStories.slice(0, 3).map((story) => (
              <HeadlineCard
                key={story.id}
                story={story}
                to={storyRoute(story, latestCompletedShow?.id)}
              />
            ))}
            {!newsroomStories.length && (
              <HeadlineCard
                story={{
                  id: "analysis-fallback",
                  label: "Data desk",
                  headline: "The scoreboard is only the beginning",
                  detail: "Open Solaris analysis to explore voting patterns, records and country relationships.",
                  intensity: "standard",
                }}
                to="/analysis"
              />
            )}
          </aside>
        </section>

        {newsroomStories.length > 3 && (
          <section>
            <SectionHeader
              kicker="Newswire"
              title="The stories behind the result"
              linkLabel="Replay the result"
              linkTo="/broadcast-intelligence"
            />
            <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {newsroomStories.slice(3, 8).map((story) => (
                <HeadlineCard
                  key={story.id}
                  story={story}
                  to={storyRoute(story, latestCompletedShow?.id)}
                  compact
                />
              ))}
            </div>
          </section>
        )}

        <section className="grid min-w-0 gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <div className="min-w-0">
            <SectionHeader
              kicker="Scoreboard"
              title={
                latestCompletedShow
                  ? `${latestCompletedEdition ? `${editionLabel(latestCompletedEdition)} · ` : ""}${latestCompletedShow.name}`
                  : "Latest result"
              }
              linkLabel="Full scoreboard"
              linkTo={latestCompletedShow ? `/shows/${latestCompletedShow.id}` : "/editions"}
            />

            <div className="glass mt-3 min-w-0 overflow-hidden p-2 sm:p-3">
              {topFive.length ? (
                topFive.map((result, index) => {
                  const country = countryMap.get(result.country_id);
                  if (!country) return null;

                  return (
                    <Link
                      key={result.id}
                      to="/countries/$code"
                      params={{ code: country.short_code }}
                      className={`grid min-w-0 grid-cols-[34px_38px_minmax(0,1fr)_auto] items-center gap-2 rounded-xl px-2 py-3 transition-colors hover:bg-surface sm:grid-cols-[42px_44px_minmax(0,1fr)_auto] sm:gap-3 ${index === 0 ? "bg-primary/5" : ""}`}
                    >
                      <span className={`numeric text-center text-xs font-black sm:text-sm ${index === 0 ? "text-primary" : "text-muted-foreground"}`}>
                        #{result.final_rank ?? index + 1}
                      </span>
                      <FlagChip
                        code={country.short_code}
                        color={country.accent_color}
                        image={country.flag_image}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{country.name}</p>
                        {index === 0 && (
                          <p className="mt-0.5 text-[8px] font-black uppercase tracking-[0.14em] text-primary">Winner</p>
                        )}
                      </div>
                      <span className="numeric shrink-0 text-xs font-black sm:text-sm">
                        {result.total_points} <span className="text-[8px] font-normal text-muted-foreground">pts</span>
                      </span>
                    </Link>
                  );
                })
              ) : (
                <p className="p-4 text-sm text-muted-foreground">No published result yet.</p>
              )}
            </div>
          </div>

          <div className="min-w-0">
            <SectionHeader
              kicker="Edition desk"
              title={latestEdition ? editionLabel(latestEdition) : "Current edition"}
              linkLabel="Open edition"
              linkTo={latestEdition ? `/editions/${latestEdition.slug}` : "/editions"}
            />
            <div className="glass mt-3 min-w-0 p-4">
              {latestEditionShows.length ? (
                <div className="divide-y divide-border/50">
                  {latestEditionShows.map((show, index) => (
                    <Link
                      key={show.id}
                      to="/shows/$showId"
                      params={{ showId: show.id }}
                      className="group flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <span className="numeric w-6 shrink-0 text-[10px] font-black text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{show.name}</p>
                        <p className="mt-1 truncate text-[8px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                          {show.kind.replaceAll("-", " ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-primary transition-transform group-hover:translate-x-1">→</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  No public shows from this edition yet.
                </p>
              )}
            </div>
          </div>
        </section>

        <section>
          <SectionHeader
            kicker="Interactive newsroom"
            title="Every Solaris desk, from predictions to archive games"
            linkLabel="Open all tools"
            linkTo="/tools"
          />

          <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {FEATURE_DESKS.map((desk, index) => (
              <DeskCard key={desk.to} {...desk} number={String(index + 1).padStart(2, "0")} />
            ))}
          </div>
        </section>

        <section className="border-y border-border/60 py-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.24em] text-primary">Public archive</p>
              <h2 className="mt-1 font-display text-xl font-black sm:text-2xl">The size of Solaris right now</h2>
            </div>
            <Link to="/archive-games" className="text-[10px] font-black uppercase tracking-[0.12em] text-primary">
              Play the archive →
            </Link>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
            <NumberStat label="Editions" value={editionList.length} />
            <NumberStat label="Countries" value={countryList.length} />
            <NumberStat label="Public shows" value={publicShowCount} />
            <NumberStat label="Grand Final winners" value={totalWinners} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function storyRoute(story: HomeNewsStory, showId?: string) {
  if (story.id.includes("jury") || story.id.includes("tele") || story.id.includes("rise") || story.id.includes("fall")) {
    return "/broadcast-intelligence";
  }
  if (story.id.includes("runner-up") || story.id.includes("podium")) {
    return showId ? `/shows/${showId}` : "/result-lab";
  }
  return "/analysis";
}

function HeadlineCard({
  story,
  to,
  compact = false,
}: {
  story: HomeNewsStory;
  to: string;
  compact?: boolean;
}) {
  const breaking = story.intensity === "breaking";
  const strong = story.intensity === "strong";

  return (
    <Link
      to={to}
      className={`group flex min-w-0 flex-col rounded-2xl border p-4 transition-transform hover:-translate-y-0.5 ${
        breaking
          ? "border-primary/45 bg-primary/12"
          : strong
            ? "border-border/80 bg-surface-strong/55"
            : "border-border/70 bg-surface/45"
      } ${compact ? "sm:min-h-[180px]" : "sm:min-h-[165px]"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[8px] font-black uppercase tracking-[0.19em] text-primary">
          {breaking ? "● Breaking · " : ""}{story.label}
        </p>
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {story.intensity}
        </span>
      </div>
      <h3 className={`mt-2 break-words font-display font-black leading-[1.04] tracking-[-0.025em] ${breaking ? "text-xl sm:text-2xl" : "text-lg"}`}>
        {story.headline}
      </h3>
      <p className="mt-2 break-words text-[10px] leading-relaxed text-muted-foreground sm:text-xs">
        {story.detail}
      </p>
      <span className="mt-auto pt-4 text-xs font-black text-primary transition-transform group-hover:translate-x-1">
        Read more →
      </span>
    </Link>
  );
}

function SectionHeader({
  kicker,
  title,
  linkLabel,
  linkTo,
}: {
  kicker: string;
  title: string;
  linkLabel?: string;
  linkTo?: string;
}) {
  return (
    <div className="flex min-w-0 items-end justify-between gap-4 border-b border-border/60 pb-2.5">
      <div className="min-w-0">
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary">{kicker}</p>
        <h2 className="mt-1 break-words font-display text-xl font-black tracking-[-0.025em] sm:text-2xl">{title}</h2>
      </div>
      {linkLabel && linkTo && (
        <Link to={linkTo} className="shrink-0 text-right text-[9px] font-black uppercase tracking-[0.11em] text-primary sm:text-[10px]">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

function DeskCard({
  number,
  label,
  title,
  description,
  to,
}: {
  number: string;
  label: string;
  title: string;
  description: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex min-w-0 flex-col rounded-2xl border border-border/70 bg-surface/45 p-4 transition-colors hover:bg-surface-strong"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[8px] font-black uppercase tracking-[0.18em] text-primary">{label}</p>
        <span className="numeric text-[9px] font-black text-muted-foreground">{number}</span>
      </div>
      <h3 className="mt-2 break-words font-display text-lg font-black">{title}</h3>
      <p className="mt-2 break-words text-[10px] leading-relaxed text-muted-foreground sm:text-xs">{description}</p>
      <span className="mt-auto pt-4 text-xs font-black text-primary transition-transform group-hover:translate-x-1">Open desk →</span>
    </Link>
  );
}

function NumberStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <p className="numeric font-display text-3xl font-black tracking-[-0.04em] sm:text-4xl">{value}</p>
      <p className="mt-1 break-words text-[9px] font-black uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    </div>
  );
}
