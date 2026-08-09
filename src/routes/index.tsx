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
    data: editions,
  } =
    useEditions();

  const {
    data: shows,
  } =
    useAllShows();

  const {
    data: countries,
  } =
    useCountries();

  const {
    data: results,
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
            (country) => [
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
        [...editionList].sort(
          (a, b) =>
            (b.edition_number ??
              -1) -
            (a.edition_number ??
              -1),
        ),
      [
        editionList,
      ],
    );

  const publishedEditions =
    sortedEditions.filter(
      (edition) =>
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
            (show) =>
              show.edition_id ===
                latestEdition.id &&
              show.published,
          )
          .sort(
            (a, b) =>
              a.sort_order -
              b.sort_order,
          )
      : [];

  const featuredShow =
    latestEditionShows.find(
      (show) =>
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
            (result) =>
              result.show_id ===
                featuredShow.id &&
              result.final_rank !=
                null,
          )
          .sort(
            (a, b) =>
              (a.final_rank ??
                999) -
              (b.final_rank ??
                999),
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
     LATEST COMPLETED SHOW BY EDITION NUMBER
     ========================================================= */

  const latestCompletedShow =
    useMemo(
      () => {
        const completed =
          showList.filter(
            (show) =>
              show.published &&
              resultList.some(
                (result) =>
                  result.show_id ===
                    show.id &&
                  result.final_rank !=
                    null,
              ),
          );

        return (
          [...completed].sort(
            (a, b) => {
              const editionA =
                editionList.find(
                  (edition) =>
                    edition.id ===
                    a.edition_id,
                );

              const editionB =
                editionList.find(
                  (edition) =>
                    edition.id ===
                    b.edition_id,
                );

              const editionDiff =
                (editionB?.edition_number ??
                  -1) -
                (editionA?.edition_number ??
                  -1);

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
          )[0] ?? null
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
            (result) =>
              result.show_id ===
                latestCompletedShow.id &&
              result.final_rank !=
                null,
          )
          .sort(
            (a, b) =>
              (a.final_rank ??
                999) -
              (b.final_rank ??
                999),
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
          (edition) =>
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

  const grandFinals =
    showList.filter(
      (show) =>
        show.kind ===
          "grand-final" &&
        show.published,
    );

  const totalWinners =
    resultList.filter(
      (result) =>
        result.final_rank ===
          1 &&
        grandFinals.some(
          (show) =>
            show.id ===
            result.show_id,
        ),
    ).length;

  return (
    <AppShell>
      <div className="space-y-8">
        {/* MASTHEAD */}

        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary sm:text-xs">
            Terra Solaris Broadcasting Union
          </p>

          <div className="mt-3 flex flex-col gap-3 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="max-w-3xl font-display text-3xl font-bold leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                Solaris Song Contest
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Results, editions and stories from across Terra Solaris.
              </p>
            </div>

            {latestEdition && (
              <Link
                to="/editions/$slug"
                params={{
                  slug:
                    latestEdition.slug,
                }}
                className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary hover:underline"
              >
                {editionLabel(
                  latestEdition,
                )}{" "}
                →
              </Link>
            )}
          </div>
        </section>

        {/* LEAD */}

        {latestEdition && (
          <section>
            <SectionLabel>
              Latest
            </SectionLabel>

            <Link
              to="/editions/$slug"
              params={{
                slug:
                  latestEdition.slug,
              }}
              className="group relative mt-3 block min-h-[390px] overflow-hidden rounded-[2rem] border border-white/20 bg-black/20 shadow-2xl sm:min-h-[440px]"
            >
              {featuredWinner?.flag_image && (
                <div className="absolute -right-[12%] top-1/2 aspect-square w-[78%] -translate-y-1/2 overflow-hidden rounded-full opacity-[0.20] sm:w-[55%]">
                  <img
                    src={
                      featuredWinner.flag_image
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-r from-[#020817]/95 via-[#06162d]/78 to-[#06162d]/20" />

              <div className="absolute inset-0 flex flex-col justify-between p-5 sm:p-8 lg:p-10">
                <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
                  Current edition
                </span>

                <div className="relative z-10 max-w-3xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                    {editionLabel(
                      latestEdition,
                    )}
                  </p>

                  <h2 className="mt-2 max-w-2xl font-display text-3xl font-bold leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl">
                    {featuredWinner
                      ? `${featuredWinner.name} takes the spotlight`
                      : latestEdition.name}
                  </h2>

                  <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
                    {featuredWinner &&
                    featuredWinnerResult &&
                    featuredShow
                      ? `${featuredWinner.name} finished first in ${featuredShow.name} with ${featuredWinnerResult.total_points} points.`
                      : latestEdition.description ||
                        `${editionLabel(
                          latestEdition,
                        )} is the latest chapter of the Solaris Song Contest.`}
                  </p>

                  <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#051223] transition-transform group-hover:translate-x-1">
                    Open edition →
                  </div>
                </div>
              </div>
            </Link>
          </section>
        )}

        {/* TOP STORIES */}

        <section>
          <div className="flex items-end justify-between gap-4">
            <SectionLabel>
              Top stories
            </SectionLabel>

            <Link
              to="/editions"
              className="text-xs font-medium text-primary hover:underline"
            >
              All editions →
            </Link>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {latestCompletedShow &&
              latestWinner &&
              latestWinnerResult && (
                <StoryCard
                  eyebrow={
                    latestCompletedEdition
                      ? editionLabel(
                          latestCompletedEdition,
                        )
                      : "Results"
                  }
                  title={`${latestWinner.name} wins ${latestCompletedShow.name}`}
                  body={`${latestWinnerResult.total_points} points secured first place.`}
                  to={`/shows/${latestCompletedShow.id}`}
                  country={
                    latestWinner
                  }
                  large
                />
              )}

            {latestEdition && (
              <StoryCard
                eyebrow="Edition"
                title={`${editionLabel(
                  latestEdition,
                )} is the current Solaris edition`}
                body={
                  latestEdition.host_city
                    ? `Hosted in ${latestEdition.host_city}.`
                    : latestEdition.name
                }
                to={`/editions/${latestEdition.slug}`}
              />
            )}

            <StoryCard
              eyebrow="Voting"
              title="Jury vs televote"
              body="See where juries and the public agreed, and where they absolutely did not."
              to={
                latestCompletedShow
                  ? `/shows/${latestCompletedShow.id}`
                  : "/analysis"
              }
            />

            <StoryCard
              eyebrow="Records"
              title="The Solaris record book"
              body="Wins, streaks and all-time contest records."
              to="/records"
            />
          </div>
        </section>

        {/* RESULTS */}

        <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <SectionLabel>
                  Latest results
                </SectionLabel>

                {latestCompletedShow && (
                  <h2 className="mt-2 font-display text-xl font-bold sm:text-2xl">
                    {latestCompletedEdition
                      ? `${editionLabel(
                          latestCompletedEdition,
                        )} · `
                      : ""}
                    {
                      latestCompletedShow.name
                    }
                  </h2>
                )}
              </div>

              {latestCompletedShow && (
                <Link
                  to="/shows/$showId"
                  params={{
                    showId:
                      latestCompletedShow.id,
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Full results →
                </Link>
              )}
            </div>

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
                        className="grid grid-cols-[34px_42px_1fr_auto] items-center gap-3 rounded-xl px-2 py-3 hover:bg-surface"
                      >
                        <span className="numeric text-center text-sm text-muted-foreground">
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

                        <span className="truncate text-sm font-semibold">
                          {
                            country.name
                          }
                        </span>

                        <span className="numeric text-sm font-bold">
                          {
                            result.total_points
                          }{" "}
                          <span className="text-[10px] font-normal text-muted-foreground">
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
            <SectionLabel>
              Current edition
            </SectionLabel>

            {latestEdition && (
              <h2 className="mt-2 font-display text-xl font-bold sm:text-2xl">
                {editionLabel(
                  latestEdition,
                )}
              </h2>
            )}

            <div className="glass mt-3 p-3">
              {latestEditionShows.length ? (
                <div className="divide-y divide-border/50">
                  {latestEditionShows.map(
                    (show) => (
                      <Link
                        key={
                          show.id
                        }
                        to="/shows/$showId"
                        params={{
                          showId:
                            show.id,
                        }}
                        className="flex items-center justify-between gap-3 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold">
                            {
                              show.name
                            }
                          </p>

                          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {show.kind.replace(
                              "-",
                              " ",
                            )}
                          </p>
                        </div>

                        <span className="text-primary">
                          →
                        </span>
                      </Link>
                    ),
                  )}
                </div>
              ) : (
                <p className="p-2 text-sm text-muted-foreground">
                  No published shows yet.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* EXPLORE */}

        <section>
          <SectionLabel>
            Explore Solaris
          </SectionLabel>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <ExploreLink
              title="Editions"
              description="Every SSC edition."
              to="/editions"
            />

            <ExploreLink
              title="Countries"
              description="Delegation histories."
              to="/countries"
            />

            <ExploreLink
              title="Relationships"
              description="Voting alliances and rivalries."
              to="/relationships"
            />

            <ExploreLink
              title="Records"
              description="All-time records."
              to="/records"
            />
          </div>
        </section>

        {/* NUMBERS */}

        <section className="border-y border-border/60 py-6">
          <SectionLabel>
            Solaris in numbers
          </SectionLabel>

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

function SectionLabel({
  children,
}: {
  children:
    string;
}) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">
      {children}
    </p>
  );
}

function StoryCard({
  eyebrow,
  title,
  body,
  to,
  country,
  large = false,
}: {
  eyebrow:
    string;

  title:
    string;

  body:
    string;

  to:
    string;

  country?: {
    id?: string;
    name?: string;
    short_code?: string;
    flag_image?: string | null;
    accent_color?: string | null;
  } | null;

  large?:
    boolean;
}) {
  return (
    <Link
      to={to}
      className={`glass group relative block min-h-[190px] overflow-hidden p-4 transition-transform hover:-translate-y-0.5 sm:p-5 ${
        large
          ? "md:col-span-2 xl:col-span-2"
          : ""
      }`}
    >
      {country?.flag_image && (
        <div className="absolute -bottom-8 -right-8 h-40 w-40 overflow-hidden rounded-full opacity-[0.13]">
          <img
            src={
              country.flag_image
            }
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      )}

      <div className="relative z-10 flex min-h-[158px] flex-col">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>

        <h3
          className={`mt-3 font-display font-bold leading-tight ${
            large
              ? "text-xl sm:text-2xl"
              : "text-lg"
          }`}
        >
          {title}
        </h3>

        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {body}
        </p>

        <p className="mt-auto pt-5 text-xs font-semibold text-primary">
          Read more →
        </p>
      </div>
    </Link>
  );
}

function ExploreLink({
  title,
  description,
  to,
}: {
  title:
    string;

  description:
    string;

  to:
    | "/editions"
    | "/countries"
    | "/relationships"
    | "/records";
}) {
  return (
    <Link
      to={to}
      className="group flex min-h-[110px] items-end justify-between gap-3 rounded-2xl border border-border/70 bg-surface/40 p-4 hover:bg-surface"
    >
      <div>
        <h3 className="font-display text-base font-semibold">
          {title}
        </h3>

        <p className="mt-1 text-[11px] text-muted-foreground">
          {description}
        </p>
      </div>

      <span className="text-lg text-primary">
        →
      </span>
    </Link>
  );
}

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
      <p className="numeric font-display text-2xl font-bold sm:text-3xl">
        {value}
      </p>

      <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}
