import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";

import {
  useMemo,
} from "react";

import {
  AppShell,
} from "@/components/AppShell";

import {
  BackgroundFlag,
} from "@/components/BackgroundFlag";

import {
  FlagChip,
} from "@/components/FlagChip";

import {
  editionLabel,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

export const Route =
  createFileRoute(
    "/",
  )({
    head: () => ({
      meta: [
        {
          title:
            "Solaris Song Contest",
        },

        {
          name:
            "description",

          content:
            "Latest results, editions, countries and stories from the Solaris Song Contest.",
        },
      ],
    }),

    component:
      HomePage,
  });

function HomePage() {
  const {
    data:
      editions,
  } =
    useEditions();

  const {
    data:
      shows,
  } =
    useAllShows();

  const {
    data:
      countries,
  } =
    useCountries();

  const {
    data:
      results,
  } =
    useAllResults();

  const editionList =
    editions ?? [];

  const showList =
    shows ?? [];

  const countryList =
    countries ?? [];

  const resultList =
    results ?? [];

  const countryMap =
    useMemo(
      () =>
        new Map(
          countryList.map(
            (
              country,
            ) => [
              country.id,
              country,
            ],
          ),
        ),
      [
        countryList,
      ],
    );

  const sortedEditions =
    useMemo(
      () =>
        [
          ...editionList,
        ].sort(
          (
            a,
            b,
          ) =>
            (
              b.edition_number ??
              -1
            ) -
            (
              a.edition_number ??
              -1
            ),
        ),
      [
        editionList,
      ],
    );

  const publishedEditions =
    sortedEditions.filter(
      (
        edition,
      ) =>
        edition.published,
    );

  const latestEdition =
    publishedEditions[
      0
    ] ??
    sortedEditions[
      0
    ] ??
    null;

  const latestEditionShows =
    latestEdition
      ? showList
          .filter(
            (
              show,
            ) =>
              show.edition_id ===
                latestEdition.id &&
              show.published,
          )
          .sort(
            (
              a,
              b,
            ) =>
              a.sort_order -
              b.sort_order,
          )
      : [];

  const featuredShow =
    latestEditionShows.find(
      (
        show,
      ) =>
        show.kind ===
        "grand-final",
    ) ??
    latestEditionShows[
      latestEditionShows.length -
        1
    ] ??
    null;

  const featuredResults =
    featuredShow
      ? resultList
          .filter(
            (
              result,
            ) =>
              result.show_id ===
                featuredShow.id &&
              result.final_rank !=
                null,
          )
          .sort(
            (
              a,
              b,
            ) =>
              (
                a.final_rank ??
                999
              ) -
              (
                b.final_rank ??
                999
              ),
          )
      : [];

  const featuredWinnerResult =
    featuredResults[
      0
    ] ??
    null;

  const featuredWinner =
    featuredWinnerResult
      ? countryMap.get(
          featuredWinnerResult.country_id,
        ) ??
        null
      : null;

  /* =========================================================
     LATEST COMPLETED SHOW
     ========================================================= */

  const latestCompletedShow =
    useMemo(
      () => {
        const completed =
          showList.filter(
            (
              show,
            ) =>
              show.published &&
              resultList.some(
                (
                  result,
                ) =>
                  result.show_id ===
                    show.id &&
                  result.final_rank !=
                    null,
              ),
          );

        return (
          [
            ...completed,
          ].sort(
            (
              a,
              b,
            ) => {
              const editionA =
                editionList.find(
                  (
                    edition,
                  ) =>
                    edition.id ===
                    a.edition_id,
                );

              const editionB =
                editionList.find(
                  (
                    edition,
                  ) =>
                    edition.id ===
                    b.edition_id,
                );

              const editionDiff =
                (
                  editionB?.edition_number ??
                  -1
                ) -
                (
                  editionA?.edition_number ??
                  -1
                );

              if (
                editionDiff !==
                0
              ) {
                return editionDiff;
              }

              return (
                b.sort_order -
                a.sort_order
              );
            },
          )[
            0
          ] ??
          null
        );
      },
      [
        showList,
        resultList,
        editionList,
      ],
    );

  const latestCompletedResults =
    latestCompletedShow
      ? resultList
          .filter(
            (
              result,
            ) =>
              result.show_id ===
                latestCompletedShow.id &&
              result.final_rank !=
                null,
          )
          .sort(
            (
              a,
              b,
            ) =>
              (
                a.final_rank ??
                999
              ) -
              (
                b.final_rank ??
                999
              ),
          )
      : [];

  const latestWinnerResult =
    latestCompletedResults[
      0
    ] ??
    null;

  const latestWinner =
    latestWinnerResult
      ? countryMap.get(
          latestWinnerResult.country_id,
        ) ??
        null
      : null;

  const latestCompletedEdition =
    latestCompletedShow
      ? editionList.find(
          (
            edition,
          ) =>
            edition.id ===
            latestCompletedShow.edition_id,
        ) ??
        null
      : null;

  const topFive =
    latestCompletedResults.slice(
      0,
      5,
    );

  const runnerUpResult =
    latestCompletedResults[
      1
    ] ??
    null;

  const runnerUp =
    runnerUpResult
      ? countryMap.get(
          runnerUpResult.country_id,
        ) ??
        null
      : null;

  const thirdResult =
    latestCompletedResults[
      2
    ] ??
    null;

  const third =
    thirdResult
      ? countryMap.get(
          thirdResult.country_id,
        ) ??
        null
      : null;

  const grandFinals =
    showList.filter(
      (
        show,
      ) =>
        show.kind ===
          "grand-final" &&
        show.published,
    );

  const totalWinners =
    resultList.filter(
      (
        result,
      ) =>
        result.final_rank ===
          1 &&
        grandFinals.some(
          (
            show,
          ) =>
            show.id ===
            result.show_id,
        ),
    ).length;

  const leadEdition =
    latestCompletedEdition ??
    latestEdition;

  const leadWinner =
    latestWinner ??
    featuredWinner;

  const leadWinnerResult =
    latestWinnerResult ??
    featuredWinnerResult;

  const leadShow =
    latestCompletedShow ??
    featuredShow;

  const leadHeadline =
    leadWinner &&
    leadShow
      ? `${leadWinner.name} takes ${leadShow.name} — but the numbers tell a bigger story`
      : latestEdition
        ? `${editionLabel(
            latestEdition,
          )} is here — see what has changed`
        : "The Solaris story continues";

  const leadDek =
    leadWinner &&
    leadWinnerResult &&
    runnerUp &&
    runnerUpResult
      ? `${leadWinner.name} finished on ${leadWinnerResult.total_points} points, ahead of ${runnerUp.name} on ${runnerUpResult.total_points}. Here is the result, the gap and what happened next.`
      : latestEdition?.description ||
        "Results, voting patterns, records and the latest developments from across Terra Solaris.";

  const editionIsLive =
    latestEdition &&
    latestEdition.status !==
      "completed";

  return (
    <AppShell>
      <div className="space-y-7 sm:space-y-9">
        {/* ===================================================
            NEWSROOM MASTHEAD
           =================================================== */}

        <section className="border-b border-border/60 pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.26em] text-primary sm:text-[10px]">
                TSBC Newsroom
              </p>

              <h1 className="mt-1 font-display text-2xl font-black tracking-[-0.035em] sm:text-4xl">
                Solaris Today
              </h1>
            </div>

            <div className="text-right">
              <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Terra Solaris
              </p>

              <p className="mt-1 text-xs font-semibold">
                Song Contest Desk
              </p>
            </div>
          </div>

          <div className="mt-4 flex min-w-0 items-center gap-3 overflow-hidden border-y border-border/60 py-2.5">
            <span className="shrink-0 rounded-md bg-primary px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-primary-foreground">
              {editionIsLive
                ? "Now"
                : "Latest"}
            </span>

            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate text-xs font-semibold sm:text-sm">
                {leadWinner &&
                leadShow
                  ? `${leadWinner.name} leads the conversation after ${leadShow.name}`
                  : latestEdition
                    ? `${editionLabel(
                        latestEdition,
                      )} is the current Solaris edition`
                    : "Follow the latest Solaris developments"}
              </p>
            </div>

            {leadEdition && (
              <Link
                to="/editions/$slug"
                params={{
                  slug:
                    leadEdition.slug,
                }}
                className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-primary"
              >
                Follow →
              </Link>
            )}
          </div>
        </section>

        {/* ===================================================
            LEAD NEWS GRID
           =================================================== */}

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.65fr)]">
          {leadEdition && (
            <Link
              to="/editions/$slug"
              params={{
                slug:
                  leadEdition.slug,
              }}
              className="group relative min-h-[470px] overflow-hidden rounded-[2rem] border border-white/20 bg-black/25 shadow-2xl sm:min-h-[520px]"
            >
              <BackgroundFlag
                image={
                  leadWinner?.flag_image
                }
                className="
                  -right-[14%]
                  top-[42%]
                  w-[92%]
                  -translate-y-1/2
                  sm:w-[62%]
                "
                opacity={
                  0.3
                }
              />

              <div className="absolute inset-0 bg-gradient-to-t from-[#020817]/98 via-[#041329]/70 to-[#061d39]/22" />

              <div className="absolute inset-0 bg-gradient-to-r from-[#020817]/74 via-transparent to-transparent" />

              <div className="relative z-10 flex min-h-[470px] flex-col justify-between p-5 sm:min-h-[520px] sm:p-8 lg:p-9">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-primary px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.16em] text-primary-foreground">
                    Lead story
                  </span>

                  <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-[8px] font-bold uppercase tracking-[0.16em] text-white/65 backdrop-blur">
                    {editionLabel(
                      leadEdition,
                    )}
                  </span>
                </div>

                <div className="max-w-3xl">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                    Results desk
                  </p>

                  <h2 className="mt-3 max-w-3xl font-display text-[2rem] font-black leading-[0.98] tracking-[-0.045em] text-white sm:text-5xl lg:text-6xl">
                    {
                      leadHeadline
                    }
                  </h2>

                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/65 sm:text-base">
                    {
                      leadDek
                    }
                  </p>

                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <span className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-bold text-[#061225] transition-transform group-hover:translate-x-1">
                      Read the full story →
                    </span>

                    {leadWinnerResult && (
                      <span className="numeric text-xs font-semibold text-white/55">
                        {
                          leadWinnerResult.total_points
                        }{" "}
                        points
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          )}

          <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <NewsBrief
              label="Result"
              headline={
                runnerUp &&
                runnerUpResult
                  ? `${runnerUp.name} came closest — the margin was ${
                      Math.max(
                        0,
                        (
                          latestWinnerResult?.total_points ??
                          0
                        ) -
                          runnerUpResult.total_points,
                      )
                    } points`
                  : "See the latest completed scoreboard"
              }
              detail={
                latestCompletedShow
                  ? latestCompletedShow.name
                  : "Latest published results"
              }
              to={
                latestCompletedShow
                  ? `/shows/${latestCompletedShow.id}`
                  : "/editions"
              }
            />

            <NewsBrief
              label="Analysis"
              headline="Where did the jury and televote see things completely differently?"
              detail="Open the voting split and relationship analysis."
              to="/analysis"
              accent
            />

            <NewsBrief
              label="Records"
              headline="The results that changed the all-time record book"
              detail={`${totalWinners} Grand Final winning results are currently in the archive.`}
              to="/records"
            />
          </aside>
        </section>

        {/* ===================================================
            THE STORY IN 30 SECONDS
           =================================================== */}

        {latestCompletedShow &&
          latestWinner && (
            <section>
              <NewsSectionHeader
                kicker="At a glance"
                title="The story in 30 seconds"
                linkLabel="Full results"
                linkTo={`/shows/${latestCompletedShow.id}`}
              />

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <QuickTake
                  number="01"
                  label="Winner"
                  title={
                    latestWinner.name
                  }
                  detail={`${latestWinnerResult?.total_points ?? 0} points`}
                  country={
                    latestWinner
                  }
                />

                <QuickTake
                  number="02"
                  label="Runner-up"
                  title={
                    runnerUp?.name ??
                    "—"
                  }
                  detail={
                    runnerUpResult
                      ? `${runnerUpResult.total_points} points`
                      : "No result"
                  }
                  country={
                    runnerUp
                  }
                />

                <QuickTake
                  number="03"
                  label="Third"
                  title={
                    third?.name ??
                    "—"
                  }
                  detail={
                    thirdResult
                      ? `${thirdResult.total_points} points`
                      : "No result"
                  }
                  country={
                    third
                  }
                />
              </div>
            </section>
          )}

        {/* ===================================================
            NEWS DESK
           =================================================== */}

        <section>
          <NewsSectionHeader
            kicker="News desk"
            title="What people will want to open next"
            linkLabel="All editions"
            linkTo="/editions"
          />

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.25fr_.75fr_.75fr]">
            {latestCompletedShow &&
              latestWinner &&
              latestWinnerResult && (
                <NewsStory
                  label={
                    latestCompletedEdition
                      ? editionLabel(
                          latestCompletedEdition,
                        )
                      : "Results"
                  }
                  headline={`${latestWinner.name} won. The interesting part is what happened underneath.`}
                  detail={`The top five, the scoring gap and the countries that came closest in ${latestCompletedShow.name}.`}
                  to={`/shows/${latestCompletedShow.id}`}
                  country={
                    latestWinner
                  }
                  feature
                />
              )}

            <NewsStory
              label="Voting"
              headline="The jury and televote did not always agree. Here are the biggest splits."
              detail="Compare who benefited from each side of the vote."
              to="/analysis"
            />

            <NewsStory
              label="Relationships"
              headline="Which countries keep finding each other in the voting?"
              detail="See the strongest friendships, similarities and one-sided support."
              to="/relationships"
            />

            {latestEdition && (
              <NewsStory
                label="Edition watch"
                headline={`${editionLabel(
                  latestEdition,
                )}: everything currently public in one place`}
                detail={
                  latestEdition.host_city
                    ? `Hosted in ${latestEdition.host_city}.`
                    : latestEdition.name
                }
                to={`/editions/${latestEdition.slug}`}
              />
            )}

            <NewsStory
              label="Records"
              headline="Who owns Solaris history right now?"
              detail="Wins, streaks, points and the records still standing."
              to="/records"
            />

            <NewsStory
              label="Countries"
              headline="Every delegation has a history. Some are much stranger than others."
              detail="Browse placements, voting patterns and relationships country by country."
              to="/countries"
            />
          </div>
        </section>

        {/* ===================================================
            LATEST SCOREBOARD
           =================================================== */}

        <section className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <NewsSectionHeader
              kicker="Scoreboard"
              title={
                latestCompletedShow
                  ? `${latestCompletedEdition
                      ? `${editionLabel(
                          latestCompletedEdition,
                        )} · `
                      : ""}${latestCompletedShow.name}`
                  : "Latest results"
              }
              linkLabel="Open scoreboard"
              linkTo={
                latestCompletedShow
                  ? `/shows/${latestCompletedShow.id}`
                  : "/editions"
              }
            />

            <div className="glass mt-3 overflow-hidden p-2 sm:p-3">
              {topFive.length ? (
                topFive.map(
                  (
                    result,
                    index,
                  ) => {
                    const country =
                      countryMap.get(
                        result.country_id,
                      );

                    if (
                      !country
                    ) {
                      return null;
                    }

                    return (
                      <Link
                        key={
                          result.id
                        }
                        to="/countries/$code"
                        params={{
                          code:
                            country.short_code,
                        }}
                        className={`grid grid-cols-[38px_42px_1fr_auto] items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface ${
                          index ===
                          0
                            ? "bg-primary/5"
                            : ""
                        }`}
                      >
                        <span className={`numeric text-center text-sm font-bold ${
                          index ===
                          0
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}>
                          #
                          {result.final_rank ??
                            index +
                              1}
                        </span>

                        <FlagChip
                          code={
                            country.short_code
                          }
                          color={
                            country.accent_color
                          }
                          image={
                            country.flag_image
                          }
                          size="sm"
                        />

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {
                              country.name
                            }
                          </p>

                          {index ===
                            0 && (
                            <p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                              Winner
                            </p>
                          )}
                        </div>

                        <span className="numeric text-sm font-bold">
                          {
                            result.total_points
                          }{" "}
                          <span className="text-[9px] font-normal text-muted-foreground">
                            pts
                          </span>
                        </span>
                      </Link>
                    );
                  },
                )
              ) : (
                <p className="p-4 text-sm text-muted-foreground">
                  No published results yet.
                </p>
              )}
            </div>
          </div>

          <div>
            <NewsSectionHeader
              kicker="Edition desk"
              title={
                latestEdition
                  ? editionLabel(
                      latestEdition,
                    )
                  : "Current edition"
              }
            />

            <div className="glass mt-3 p-4">
              {latestEditionShows.length ? (
                <div className="divide-y divide-border/50">
                  {latestEditionShows.map(
                    (
                      show,
                      index,
                    ) => (
                      <Link
                        key={
                          show.id
                        }
                        to="/shows/$showId"
                        params={{
                          showId:
                            show.id,
                        }}
                        className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <span className="numeric w-6 shrink-0 text-[10px] font-bold text-muted-foreground">
                          0
                          {
                            index +
                            1
                          }
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {
                              show.name
                            }
                          </p>

                          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {show.kind.replace(
                              "-",
                              " ",
                            )}
                          </p>
                        </div>

                        <span className="text-primary transition-transform group-hover:translate-x-1">
                          →
                        </span>
                      </Link>
                    ),
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No published shows yet.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ===================================================
            DISCOVER
           =================================================== */}

        <section>
          <NewsSectionHeader
            kicker="Keep exploring"
            title="Go deeper into Solaris"
          />

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <DeskLink
              number="01"
              title="Editions"
              description="Every contest chapter."
              to="/editions"
            />

            <DeskLink
              number="02"
              title="Countries"
              description="Placements and delegation histories."
              to="/countries"
            />

            <DeskLink
              number="03"
              title="Analysis"
              description="Voting patterns and relationships."
              to="/analysis"
            />

            <DeskLink
              number="04"
              title="Records"
              description="The numbers that still stand."
              to="/records"
            />
          </div>
        </section>

        {/* ===================================================
            NUMBERS
           =================================================== */}

        <section className="border-y border-border/60 py-6">
          <p className="text-[9px] font-black uppercase tracking-[0.24em] text-muted-foreground">
            The archive
          </p>

          <div className="mt-4 grid grid-cols-2 gap-5 sm:grid-cols-4">
            <NumberStat
              label="Editions"
              value={
                editionList.length
              }
            />

            <NumberStat
              label="Countries"
              value={
                countryList.length
              }
            />

            <NumberStat
              label="Shows"
              value={
                showList.length
              }
            />

            <NumberStat
              label="Winners"
              value={
                totalWinners
              }
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

/* ============================================================
   SECTION HEADER
   ============================================================ */

function NewsSectionHeader({
  kicker,
  title,
  linkLabel,
  linkTo,
}: {
  kicker:
    string;

  title:
    string;

  linkLabel?:
    string;

  linkTo?:
    string;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-border/60 pb-2.5">
      <div>
        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-primary">
          {
            kicker
          }
        </p>

        <h2 className="mt-1 font-display text-xl font-black tracking-[-0.025em] sm:text-2xl">
          {
            title
          }
        </h2>
      </div>

      {linkLabel &&
        linkTo && (
          <Link
            to={
              linkTo
            }
            className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-primary"
          >
            {
              linkLabel
            }{" "}
            →
          </Link>
        )}
    </div>
  );
}

/* ============================================================
   NEWS BRIEF
   ============================================================ */

function NewsBrief({
  label,
  headline,
  detail,
  to,
  accent = false,
}: {
  label:
    string;

  headline:
    string;

  detail:
    string;

  to:
    string;

  accent?:
    boolean;
}) {
  return (
    <Link
      to={
        to
      }
      className={`group flex min-h-[150px] flex-col rounded-2xl border p-4 transition-transform hover:-translate-y-0.5 ${
        accent
          ? "border-primary/35 bg-primary/10"
          : "border-border/70 bg-surface/45"
      }`}
    >
      <p className="text-[8px] font-black uppercase tracking-[0.2em] text-primary">
        {
          label
        }
      </p>

      <h3 className="mt-2 font-display text-lg font-bold leading-[1.08] tracking-[-0.02em]">
        {
          headline
        }
      </h3>

      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {
          detail
        }
      </p>

      <span className="mt-auto pt-4 text-xs font-bold text-primary transition-transform group-hover:translate-x-1">
        Open →
      </span>
    </Link>
  );
}

/* ============================================================
   QUICK TAKE
   ============================================================ */

function QuickTake({
  number,
  label,
  title,
  detail,
  country,
}: {
  number:
    string;

  label:
    string;

  title:
    string;

  detail:
    string;

  country?:
    {
      short_code:
        string;
      flag_image:
        string | null;
      accent_color:
        string;
    } | null;
}) {
  return (
    <div className="glass relative overflow-hidden p-4">
      <BackgroundFlag
        image={
          country?.flag_image
        }
        className="-bottom-8 -right-8 h-40 w-40"
        opacity={0.14}
      />

      <div className="relative z-10 flex min-h-[120px] flex-col">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[8px] font-black uppercase tracking-[0.18em] text-primary">
            {
              label
            }
          </p>

          <span className="numeric text-[10px] font-bold text-muted-foreground">
            {
              number
            }
          </span>
        </div>

        <h3 className="mt-auto font-display text-xl font-black">
          {
            title
          }
        </h3>

        <p className="mt-1 text-xs text-muted-foreground">
          {
            detail
          }
        </p>
      </div>
    </div>
  );
}

/* ============================================================
   NEWS STORY
   ============================================================ */

function NewsStory({
  label,
  headline,
  detail,
  to,
  country,
  feature = false,
}: {
  label:
    string;

  headline:
    string;

  detail:
    string;

  to:
    string;

  country?:
    {
      flag_image?:
        string | null;
    } | null;

  feature?:
    boolean;
}) {
  return (
    <Link
      to={
        to
      }
      className={`glass group relative block overflow-hidden p-4 transition-transform hover:-translate-y-0.5 sm:p-5 ${
        feature
          ? "min-h-[280px] md:row-span-2"
          : "min-h-[190px]"
      }`}
    >
      <BackgroundFlag
        image={
          country?.flag_image
        }
        className={feature
          ? "-bottom-16 -right-12 h-64 w-64"
          : "-bottom-10 -right-10 h-44 w-44"}
        opacity={feature
          ? 0.2
          : 0.12}
      />

      <div className={`relative z-10 flex ${
        feature
          ? "min-h-[240px]"
          : "min-h-[150px]"
      } flex-col`}>
        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-primary">
          {
            label
          }
        </p>

        <h3 className={`mt-3 font-display font-black leading-[1.05] tracking-[-0.025em] ${
          feature
            ? "text-2xl sm:text-3xl"
            : "text-lg"
        }`}>
          {
            headline
          }
        </h3>

        <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted-foreground">
          {
            detail
          }
        </p>

        <p className="mt-auto pt-5 text-xs font-bold text-primary transition-transform group-hover:translate-x-1">
          Read story →
        </p>
      </div>
    </Link>
  );
}

/* ============================================================
   DESK LINK
   ============================================================ */

function DeskLink({
  number,
  title,
  description,
  to,
}: {
  number:
    string;

  title:
    string;

  description:
    string;

  to:
    | "/editions"
    | "/countries"
    | "/analysis"
    | "/records";
}) {
  return (
    <Link
      to={
        to
      }
      className="group flex min-h-[110px] items-end gap-3 rounded-2xl border border-border/70 bg-surface/35 p-4 transition-colors hover:bg-surface"
    >
      <span className="numeric text-xs font-bold text-primary">
        {
          number
        }
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="font-display text-base font-bold">
          {
            title
          }
        </h3>

        <p className="mt-1 text-[10px] text-muted-foreground">
          {
            description
          }
        </p>
      </div>

      <span className="text-primary transition-transform group-hover:translate-x-1">
        →
      </span>
    </Link>
  );
}

/* ============================================================
   NUMBER STAT
   ============================================================ */

function NumberStat({
  label,
  value,
}: {
  label:
    string;

  value:
    number;
}) {
  return (
    <div>
      <p className="numeric font-display text-2xl font-black sm:text-3xl">
        {
          value
        }
      </p>

      <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {
          label
        }
      </p>
    </div>
  );
}
