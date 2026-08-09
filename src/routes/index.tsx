import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { AppShell } from "@/components/AppShell";
import { FlagChip } from "@/components/FlagChip";
import {
  editionLabel,
  useAllResults,
  useAllShows,
  useCountries,
  useEditions,
} from "@/lib/data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Solaris Song Contest",
      },
      {
        name: "description",
        content:
          "Latest results, editions, countries and stories from the Solaris Song Contest.",
      },
    ],
  }),

  component: HomePage,
});

/* =========================================================
   HOME PAGE
   ========================================================= */

function HomePage() {
  const { data: editions } = useEditions();
  const { data: shows } = useAllShows();
  const { data: countries } = useCountries();
  const { data: results } = useAllResults();

  const editionList = editions ?? [];
  const showList = shows ?? [];
  const countryList = countries ?? [];
  const resultList = results ?? [];

  const countryMap = useMemo(
    () =>
      new Map(
        countryList.map((country) => [
          country.id,
          country,
        ]),
      ),
    [countryList],
  );

  /* =========================================================
     PUBLISHED EDITIONS
     ========================================================= */

  const publishedEditions = useMemo(
    () =>
      editionList.filter(
        (edition) => edition.published,
      ),
    [editionList],
  );

  /*
   * useEditions is already ordered newest first in the
   * existing site, so the first published edition becomes
   * the current/latest edition.
   */
  const latestEdition =
    publishedEditions[0] ??
    editionList[0] ??
    null;

  /* =========================================================
     SHOWS IN LATEST EDITION
     ========================================================= */

  const latestEditionShows = useMemo(() => {
    if (!latestEdition) {
      return [];
    }

    return showList.filter(
      (show) =>
        show.edition_id === latestEdition.id &&
        show.published,
    );
  }, [showList, latestEdition]);

  /*
   * Prefer the grand final as the lead results story.
   * If there isn't one yet, use the latest published show.
   */
  const featuredShow =
    latestEditionShows.find(
      (show) => show.kind === "grand-final",
    ) ??
    latestEditionShows[
      latestEditionShows.length - 1
    ] ??
    null;

  /* =========================================================
     FEATURED SHOW RESULTS
     ========================================================= */

  const featuredResults = useMemo(() => {
    if (!featuredShow) {
      return [];
    }

    return resultList
      .filter(
        (result) =>
          result.show_id === featuredShow.id &&
          result.final_rank != null,
      )
      .sort(
        (a, b) =>
          (a.final_rank ?? 999) -
          (b.final_rank ?? 999),
      );
  }, [resultList, featuredShow]);

  const featuredWinnerResult =
    featuredResults[0] ?? null;

  const featuredWinner =
    featuredWinnerResult
      ? countryMap.get(
          featuredWinnerResult.country_id,
        ) ?? null
      : null;

  /* =========================================================
     LATEST COMPLETED RESULT ANYWHERE

     Useful if SSC22 exists but no final has happened yet.
     ========================================================= */

  const completedShows = useMemo(
    () =>
      showList.filter(
        (show) =>
          show.published &&
          resultList.some(
            (result) =>
              result.show_id === show.id &&
              result.final_rank != null,
          ),
      ),
    [showList, resultList],
  );

  const latestCompletedShow =
    completedShows[
      completedShows.length - 1
    ] ??
    featuredShow ??
    null;

  const latestCompletedResults =
    latestCompletedShow
      ? resultList
          .filter(
            (result) =>
              result.show_id ===
                latestCompletedShow.id &&
              result.final_rank != null,
          )
          .sort(
            (a, b) =>
              (a.final_rank ?? 999) -
              (b.final_rank ?? 999),
          )
      : [];

  const latestCompletedWinnerResult =
    latestCompletedResults[0] ?? null;

  const latestCompletedWinner =
    latestCompletedWinnerResult
      ? countryMap.get(
          latestCompletedWinnerResult.country_id,
        ) ?? null
      : null;

  const latestCompletedEdition =
    latestCompletedShow
      ? editionList.find(
          (edition) =>
            edition.id ===
            latestCompletedShow.edition_id,
        ) ?? null
      : null;

  /* =========================================================
     GRAND FINAL HISTORY
     ========================================================= */

  const publishedGrandFinals = useMemo(
    () =>
      showList.filter(
        (show) =>
          show.published &&
          show.kind === "grand-final",
      ),
    [showList],
  );

  const totalWinners = useMemo(
    () =>
      resultList.filter((result) => {
        if (result.final_rank !== 1) {
          return false;
        }

        return publishedGrandFinals.some(
          (show) =>
            show.id === result.show_id,
        );
      }).length,
    [resultList, publishedGrandFinals],
  );

  /* =========================================================
     TOP RESULT ROWS
     ========================================================= */

  const latestTopFive =
    latestCompletedResults.slice(0, 5);

  /* =========================================================
     VIEW
     ========================================================= */

  return (
    <AppShell>
      <div className="space-y-8">
        {/* =====================================================
            MASTHEAD
           ===================================================== */}

        <section className="pt-1 sm:pt-2">
          <p
            className="
              text-[10px]
              font-semibold
              uppercase
              tracking-[0.24em]
              text-primary
              sm:text-xs
            "
          >
            Terra Solaris Broadcasting Union
          </p>

          <div
            className="
              mt-3
              flex
              flex-col
              gap-3
              border-b
              border-border/60
              pb-5
              sm:flex-row
              sm:items-end
              sm:justify-between
            "
          >
            <div>
              <h1
                className="
                  max-w-3xl
                  font-display
                  text-3xl
                  font-bold
                  leading-[0.95]
                  tracking-[-0.04em]
                  sm:text-5xl
                  lg:text-6xl
                "
              >
                Solaris Song Contest
              </h1>

              <p
                className="
                  mt-3
                  max-w-xl
                  text-sm
                  leading-relaxed
                  text-muted-foreground
                  sm:text-base
                "
              >
                Results, editions and stories
                from across Terra Solaris.
              </p>
            </div>

            {latestEdition && (
              <Link
                to="/editions/$slug"
                params={{
                  slug: latestEdition.slug,
                }}
                className="
                  inline-flex
                  shrink-0
                  items-center
                  gap-2
                  text-xs
                  font-semibold
                  uppercase
                  tracking-[0.14em]
                  text-primary
                  hover:underline
                "
              >
                Latest edition
                <span>→</span>
              </Link>
            )}
          </div>
        </section>

        {/* =====================================================
            LEAD STORY
           ===================================================== */}

        <section>
          <SectionLabel>
            Latest
          </SectionLabel>

          {latestEdition ? (
            <Link
              to="/editions/$slug"
              params={{
                slug: latestEdition.slug,
              }}
              className="
                group
                relative
                mt-3
                block
                min-h-[390px]
                overflow-hidden
                rounded-[2rem]
                border
                border-white/20
                bg-black/20
                shadow-2xl
                sm:min-h-[440px]
              "
            >
              {/* Faded winner flag becomes the editorial image */}

              {featuredWinner?.flag_image && (
                <div
                  className="
                    absolute
                    -right-[12%]
                    top-1/2
                    aspect-square
                    w-[78%]
                    -translate-y-1/2
                    overflow-hidden
                    rounded-full
                    opacity-[0.20]
                    blur-[1px]
                    sm:w-[55%]
                  "
                >
                  <img
                    src={
                      featuredWinner.flag_image
                    }
                    alt=""
                    className="
                      h-full
                      w-full
                      object-cover
                    "
                  />
                </div>
              )}

              {/* deep readability gradient */}

              <div
                className="
                  absolute
                  inset-0
                  bg-gradient-to-r
                  from-[#020817]/95
                  via-[#06162d]/78
                  to-[#06162d]/20
                "
              />

              <div
                className="
                  absolute
                  inset-x-0
                  bottom-0
                  top-0
                  flex
                  flex-col
                  justify-between
                  p-5
                  sm:p-8
                  lg:p-10
                "
              >
                <div
                  className="
                    flex
                    items-start
                    justify-between
                    gap-3
                  "
                >
                  <span
                    className="
                      rounded-full
                      border
                      border-primary/30
                      bg-primary/10
                      px-3
                      py-1.5
                      text-[9px]
                      font-bold
                      uppercase
                      tracking-[0.18em]
                      text-primary
                      backdrop-blur-md
                      sm:text-[10px]
                    "
                  >
                    Current edition
                  </span>

                  <span
                    className="
                      text-xs
                      text-white/55
                    "
                  >
                    {latestEdition.year ??
                      ""}
                  </span>
                </div>

                <div
                  className="
                    relative
                    z-10
                    max-w-3xl
                  "
                >
                  <p
                    className="
                      text-xs
                      font-semibold
                      uppercase
                      tracking-[0.18em]
                      text-primary
                    "
                  >
                    {editionLabel(
                      latestEdition,
                    )}
                  </p>

                  <h2
                    className="
                      mt-2
                      max-w-2xl
                      font-display
                      text-3xl
                      font-bold
                      leading-[1.02]
                      tracking-[-0.035em]
                      text-white
                      sm:text-5xl
                    "
                  >
                    {featuredWinner
                      ? `${featuredWinner.name} takes the spotlight`
                      : latestEdition.name}
                  </h2>

                  <p
                    className="
                      mt-4
                      max-w-xl
                      text-sm
                      leading-relaxed
                      text-white/65
                      sm:text-base
                    "
                  >
                    {featuredWinnerResult &&
                    featuredShow
                      ? `${featuredWinner.name} finished first in ${featuredShow.name} with ${featuredWinnerResult.total_points} points.`
                      : latestEdition.description ||
                        [
                          latestEdition.host_city,
                          latestEdition.year,
                        ]
                          .filter(Boolean)
                          .join(" · ") ||
                        "The latest chapter of the Solaris Song Contest."}
                  </p>

                  <div
                    className="
                      mt-6
                      inline-flex
                      items-center
                      gap-2
                      rounded-xl
                      bg-white
                      px-4
                      py-2.5
                      text-sm
                      font-semibold
                      text-[#051223]
                      transition-transform
                      group-hover:translate-x-1
                    "
                  >
                    Open edition
                    <span>→</span>
                  </div>
                </div>
              </div>
            </Link>
          ) : (
            <div
              className="
                glass
                mt-3
                p-8
                text-sm
                text-muted-foreground
              "
            >
              No edition has been published yet.
            </div>
          )}
        </section>

        {/* =====================================================
            TOP STORIES
           ===================================================== */}

        <section>
          <div
            className="
              flex
              items-end
              justify-between
              gap-4
            "
          >
            <SectionLabel>
              Top stories
            </SectionLabel>

            <Link
              to="/editions"
              className="
                text-xs
                font-medium
                text-primary
                hover:underline
              "
            >
              All editions →
            </Link>
          </div>

          <div
            className="
              mt-3
              grid
              gap-3
              md:grid-cols-2
              xl:grid-cols-4
            "
          >
            {/* STORY 1 */}

            {latestCompletedShow &&
              latestCompletedWinner &&
              latestCompletedWinnerResult && (
                <StoryCard
                  eyebrow="Results"
                  title={`${latestCompletedWinner.name} wins ${latestCompletedShow.name}`}
                  body={`${latestCompletedWinnerResult.total_points} points secured first place.`}
                  to={`/shows/${latestCompletedShow.id}`}
                  country={
                    latestCompletedWinner
                  }
                  large
                />
              )}

            {/* STORY 2 */}

            {latestEdition && (
              <StoryCard
                eyebrow="Edition"
                title={`${editionLabel(
                  latestEdition,
                )} is the current Solaris edition`}
                body={
                  [
                    latestEdition.host_city,
                    latestEdition.year,
                  ]
                    .filter(Boolean)
                    .join(" · ") ||
                  latestEdition.name
                }
                to={`/editions/${latestEdition.slug}`}
              />
            )}

            {/* STORY 3 */}

            <StoryCard
              eyebrow="Data"
              title="Who did the juries and televote disagree on?"
              body="Explore every result and compare how each side shaped the scoreboard."
              to={
                latestCompletedShow
                  ? `/shows/${latestCompletedShow.id}`
                  : "/analysis"
              }
            />

            {/* STORY 4 */}

            <StoryCard
              eyebrow="Records"
              title="The all-time Solaris record book"
              body="Wins, streaks, voting records and the delegations that defined the contest."
              to="/records"
            />
          </div>
        </section>

        {/* =====================================================
            LATEST RESULTS
           ===================================================== */}

        <section
          className="
            grid
            gap-5
            lg:grid-cols-[1.25fr_.75fr]
          "
        >
          <div>
            <div
              className="
                flex
                items-end
                justify-between
                gap-4
              "
            >
              <div>
                <SectionLabel>
                  Latest results
                </SectionLabel>

                {latestCompletedShow && (
                  <h2
                    className="
                      mt-2
                      font-display
                      text-xl
                      font-bold
                      sm:text-2xl
                    "
                  >
                    {latestCompletedEdition
                      ? `${editionLabel(
                          latestCompletedEdition,
                        )} · `
                      : ""}
                    {latestCompletedShow.name}
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
                  className="
                    shrink-0
                    text-xs
                    font-medium
                    text-primary
                    hover:underline
                  "
                >
                  Full results →
                </Link>
              )}
            </div>

            <div
              className="
                glass
                mt-3
                overflow-hidden
                p-2
                sm:p-3
              "
            >
              {latestTopFive.length ? (
                <div>
                  {latestTopFive.map(
                    (
                      result,
                      index,
                    ) => {
                      const country =
                        countryMap.get(
                          result.country_id,
                        );

                      if (!country) {
                        return null;
                      }

                      return (
                        <Link
                          key={`${result.country_id}-${index}`}
                          to="/countries/$code"
                          params={{
                            code:
                              country.short_code,
                          }}
                          className="
                            grid
                            grid-cols-[34px_42px_1fr_auto]
                            items-center
                            gap-3
                            rounded-xl
                            px-2
                            py-3
                            transition-colors
                            hover:bg-surface
                            sm:grid-cols-[44px_48px_1fr_auto]
                          "
                        >
                          <span
                            className="
                              numeric
                              text-center
                              text-sm
                              font-semibold
                              text-muted-foreground
                            "
                          >
                            #
                            {result.final_rank ??
                              index + 1}
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

                          <div
                            className="
                              min-w-0
                            "
                          >
                            <p
                              className="
                                truncate
                                text-sm
                                font-semibold
                              "
                            >
                              {
                                country.name
                              }
                            </p>

                            <p
                              className="
                                mt-0.5
                                text-[10px]
                                uppercase
                                tracking-[0.12em]
                                text-muted-foreground
                              "
                            >
                              {
                                country.short_code
                              }
                            </p>
                          </div>

                          <span
                            className="
                              numeric
                              text-right
                              text-sm
                              font-bold
                            "
                          >
                            {
                              result.total_points
                            }
                            <span
                              className="
                                ml-1
                                text-[10px]
                                font-normal
                                text-muted-foreground
                              "
                            >
                              pts
                            </span>
                          </span>
                        </Link>
                      );
                    },
                  )}
                </div>
              ) : (
                <div
                  className="
                    p-6
                    text-sm
                    text-muted-foreground
                  "
                >
                  No published result is available yet.
                </div>
              )}
            </div>
          </div>

          {/* =================================================
              CURRENT EDITION SHOWS
             ================================================= */}

          <div>
            <div
              className="
                flex
                items-end
                justify-between
                gap-3
              "
            >
              <div>
                <SectionLabel>
                  Current edition
                </SectionLabel>

                {latestEdition && (
                  <h2
                    className="
                      mt-2
                      font-display
                      text-xl
                      font-bold
                      sm:text-2xl
                    "
                  >
                    {editionLabel(
                      latestEdition,
                    )}
                  </h2>
                )}
              </div>
            </div>

            <div
              className="
                glass
                mt-3
                p-3
              "
            >
              {latestEditionShows.length ? (
                <div
                  className="
                    divide-y
                    divide-border/50
                  "
                >
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
                        className="
                          flex
                          items-center
                          justify-between
                          gap-3
                          py-3
                          first:pt-1
                          last:pb-1
                        "
                      >
                        <div
                          className="
                            min-w-0
                          "
                        >
                          <p
                            className="
                              truncate
                              text-sm
                              font-semibold
                            "
                          >
                            {
                              show.name
                            }
                          </p>

                          <p
                            className="
                              mt-1
                              text-[10px]
                              uppercase
                              tracking-[0.14em]
                              text-muted-foreground
                            "
                          >
                            {show.kind.replace(
                              "-",
                              " ",
                            )}
                          </p>
                        </div>

                        <span
                          className="
                            shrink-0
                            text-xs
                            text-primary
                          "
                        >
                          →
                        </span>
                      </Link>
                    ),
                  )}
                </div>
              ) : (
                <p
                  className="
                    p-2
                    text-sm
                    text-muted-foreground
                  "
                >
                  No published shows yet.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* =====================================================
            EXPLORE
           ===================================================== */}

        <section>
          <SectionLabel>
            Explore Solaris
          </SectionLabel>

          <div
            className="
              mt-3
              grid
              gap-2
              sm:grid-cols-2
              lg:grid-cols-4
            "
          >
            <ExploreLink
              title="Editions"
              description="Every edition and show."
              to="/editions"
            />

            <ExploreLink
              title="Countries"
              description="Delegation histories and results."
              to="/countries"
            />

            <ExploreLink
              title="Relationships"
              description="Voting alliances and rivalries."
              to="/relationships"
            />

            <ExploreLink
              title="Records"
              description="The all-time record book."
              to="/records"
            />
          </div>
        </section>

        {/* =====================================================
            COUNTRIES STRIP
           ===================================================== */}

        <section>
          <div
            className="
              flex
              items-end
              justify-between
              gap-3
            "
          >
            <SectionLabel>
              Across Terra Solaris
            </SectionLabel>

            <Link
              to="/countries"
              className="
                text-xs
                text-primary
                hover:underline
              "
            >
              All countries →
            </Link>
          </div>

          <div
            className="
              glass
              mt-3
              overflow-hidden
              p-4
            "
          >
            <div
              className="
                flex
                flex-wrap
                gap-2
              "
            >
              {countryList
                .slice(0, 32)
                .map(
                  (country) => (
                    <Link
                      key={
                        country.id
                      }
                      to="/countries/$code"
                      params={{
                        code:
                          country.short_code,
                      }}
                      title={
                        country.name
                      }
                      className="
                        transition-transform
                        hover:-translate-y-0.5
                      "
                    >
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
                    </Link>
                  ),
                )}
            </div>
          </div>
        </section>

        {/* =====================================================
            SOLARIS IN NUMBERS
           ===================================================== */}

        <section
          className="
            border-y
            border-border/60
            py-6
          "
        >
          <SectionLabel>
            Solaris in numbers
          </SectionLabel>

          <div
            className="
              mt-4
              grid
              grid-cols-2
              gap-x-6
              gap-y-5
              sm:grid-cols-4
            "
          >
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

        {/* =====================================================
            STUDIO LINK
           ===================================================== */}

        <section
          className="
            flex
            flex-col
            gap-4
            rounded-[2rem]
            border
            border-border/70
            bg-black/10
            p-5
            sm:flex-row
            sm:items-center
            sm:justify-between
          "
        >
          <div>
            <p
              className="
                text-[10px]
                font-semibold
                uppercase
                tracking-[0.16em]
                text-muted-foreground
              "
            >
              TSBC production
            </p>

            <h2
              className="
                mt-1
                font-display
                text-lg
                font-bold
              "
            >
              Solaris Studio
            </h2>

            <p
              className="
                mt-1
                text-xs
                text-muted-foreground
              "
            >
              Contest administration and
              broadcast production.
            </p>
          </div>

          <Link
            to="/admin"
            className="
              inline-flex
              min-h-11
              items-center
              justify-center
              rounded-xl
              border
              border-border
              bg-surface
              px-4
              text-sm
              font-medium
            "
          >
            Open Studio →
          </Link>
        </section>
      </div>
    </AppShell>
  );
}

/* =========================================================
   SECTION LABEL
   ========================================================= */

function SectionLabel({
  children,
}: {
  children: string;
}) {
  return (
    <p
      className="
        text-[10px]
        font-bold
        uppercase
        tracking-[0.2em]
        text-muted-foreground
        sm:text-xs
      "
    >
      {children}
    </p>
  );
}

/* =========================================================
   STORY CARD
   ========================================================= */

function StoryCard({
  eyebrow,
  title,
  body,
  to,
  country,
  large = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  to: string;
  country?: {
    name: string;
    short_code: string;
    flag_image: string | null;
    accent_color: string | null;
  } | null;
  large?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`
        glass
        group
        relative
        block
        min-h-[190px]
        overflow-hidden
        p-4
        transition-transform
        hover:-translate-y-0.5
        sm:p-5
        ${
          large
            ? "md:col-span-2 xl:col-span-2"
            : ""
        }
      `}
    >
      {country?.flag_image && (
        <div
          className="
            absolute
            -bottom-8
            -right-8
            h-40
            w-40
            overflow-hidden
            rounded-full
            opacity-[0.13]
          "
        >
          <img
            src={
              country.flag_image
            }
            alt=""
            className="
              h-full
              w-full
              object-cover
            "
          />
        </div>
      )}

      <div
        className="
          relative
          z-10
          flex
          h-full
          min-h-[158px]
          flex-col
        "
      >
        <p
          className="
            text-[9px]
            font-bold
            uppercase
            tracking-[0.18em]
            text-primary
          "
        >
          {eyebrow}
        </p>

        <h3
          className={`
            mt-3
            max-w-lg
            font-display
            font-bold
            leading-tight
            ${
              large
                ? "text-xl sm:text-2xl"
                : "text-lg"
            }
          `}
        >
          {title}
        </h3>

        <p
          className="
            mt-2
            max-w-md
            text-xs
            leading-relaxed
            text-muted-foreground
          "
        >
          {body}
        </p>

        <p
          className="
            mt-auto
            pt-5
            text-xs
            font-semibold
            text-primary
            transition-transform
            group-hover:translate-x-1
          "
        >
          Read more →
        </p>
      </div>
    </Link>
  );
}

/* =========================================================
   EXPLORE LINK
   ========================================================= */

function ExploreLink({
  title,
  description,
  to,
}: {
  title: string;
  description: string;
  to:
    | "/editions"
    | "/countries"
    | "/relationships"
    | "/records";
}) {
  return (
    <Link
      to={to}
      className="
        group
        flex
        min-h-[110px]
        items-end
        justify-between
        gap-3
        rounded-2xl
        border
        border-border/70
        bg-surface/40
        p-4
        transition-colors
        hover:bg-surface
      "
    >
      <div>
        <h3
          className="
            font-display
            text-base
            font-semibold
          "
        >
          {title}
        </h3>

        <p
          className="
            mt-1
            text-[11px]
            leading-relaxed
            text-muted-foreground
          "
        >
          {description}
        </p>
      </div>

      <span
        className="
          shrink-0
          text-lg
          text-primary
          transition-transform
          group-hover:translate-x-1
        "
      >
        →
      </span>
    </Link>
  );
}

/* =========================================================
   NUMBER STAT
   ========================================================= */

function NumberStat({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div>
      <p
        className="
          numeric
          font-display
          text-2xl
          font-bold
          sm:text-3xl
        "
      >
        {value}
      </p>

      <p
        className="
          mt-1
          text-[10px]
          uppercase
          tracking-[0.15em]
          text-muted-foreground
        "
      >
        {label}
      </p>
    </div>
  );
}
