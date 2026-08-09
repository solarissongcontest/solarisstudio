import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import {
  AppShell,
  Panel,
  StatTile,
} from "@/components/AppShell";

import { FlagChip } from "@/components/FlagChip";

import {
  editionLabel,
  useAllResults,
  useCountries,
  useEdition,
  useParticipants,
  useShows,
} from "@/lib/data";

export const Route =
  createFileRoute(
    "/editions/$slug",
  )({
    head: ({ params }) => ({
      meta: [
        {
          title: `${params.slug} — Solaris Song Contest`,
        },
      ],
    }),

    component:
      EditionPage,
  });

function EditionPage() {
  const {
    slug,
  } =
    Route.useParams();

  const {
    data: edition,
    isLoading,
  } =
    useEdition(slug);

  const {
    data: shows,
  } =
    useShows(
      edition?.id,
    );

  const {
    data: participants,
  } =
    useParticipants(
      edition?.id,
    );

  const {
    data: countries,
  } =
    useCountries();

  const {
    data: allResults,
  } =
    useAllResults();

  /* =========================================================
     LOADING / MISSING
     ========================================================= */

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">
          Loading edition…
        </p>
      </AppShell>
    );
  }

  if (!edition) {
    return (
      <AppShell>
        <div className="glass p-6">
          <h1
            className="
              font-display
              text-2xl
              font-bold
            "
          >
            Edition not found
          </h1>

          <Link
            to="/editions"
            className="
              mt-4
              inline-block
              text-sm
              text-primary
            "
          >
            ← All editions
          </Link>
        </div>
      </AppShell>
    );
  }

  const showList =
    shows ?? [];

  const participantList =
    participants ?? [];

  const resultList =
    (allResults ?? []).filter(
      (result) =>
        result.edition_id ===
        edition.id,
    );

  const countryMap =
    new Map(
      (countries ?? []).map(
        (country) => [
          country.id,
          country,
        ],
      ),
    );

  /* =========================================================
     PARTICIPATING COUNTRIES
     ========================================================= */

  const nationIds =
    [
      ...new Set(
        participantList
          .map(
            (participant) =>
              participant.country_id,
          )
          .filter(Boolean),
      ),
    ];

  const participatingCountries =
    nationIds
      .map(
        (id) =>
          countryMap.get(id),
      )
      .filter(
        (
          country,
        ): country is NonNullable<
          typeof country
        > =>
          !!country,
      );

  /* =========================================================
     GRAND FINAL
     ========================================================= */

  const grandFinal =
    showList.find(
      (show) =>
        show.kind ===
        "grand-final",
    ) ?? null;

  const finalResults =
    grandFinal
      ? resultList
          .filter(
            (result) =>
              result.show_id ===
              grandFinal.id,
          )
          .sort(
            (a, b) =>
              (a.final_rank ??
                999) -
              (b.final_rank ??
                999),
          )
      : [];

  const winnerResult =
    finalResults.find(
      (result) =>
        result.final_rank ===
        1,
    ) ??
    finalResults[0] ??
    null;

  const winner =
    winnerResult
      ? countryMap.get(
          winnerResult.country_id,
        ) ?? null
      : null;

  const topFive =
    finalResults.slice(
      0,
      5,
    );

  /* =========================================================
     JURY / TELEVOTE WINNERS
     ========================================================= */

  const juryWinnerResult =
    finalResults.length
      ? [...finalResults].sort(
          (a, b) =>
            b.jury_points -
            a.jury_points,
        )[0]
      : null;

  const televoteWinnerResult =
    finalResults.length
      ? [...finalResults].sort(
          (a, b) =>
            b.televote_points -
            a.televote_points,
        )[0]
      : null;

  const juryWinner =
    juryWinnerResult
      ? countryMap.get(
          juryWinnerResult.country_id,
        ) ?? null
      : null;

  const televoteWinner =
    televoteWinnerResult
      ? countryMap.get(
          televoteWinnerResult.country_id,
        ) ?? null
      : null;

  /* =========================================================
     FINAL PARTICIPANTS
     ========================================================= */

  const finalistCount =
    grandFinal
      ? participantList.filter(
          (participant) =>
            participant.show_id ===
            grandFinal.id,
        ).length
      : 0;

  /* =========================================================
     SEMI COUNT
     ========================================================= */

  const semiFinals =
    showList.filter(
      (show) =>
        show.kind ===
        "semi-final",
    );

  /* =========================================================
     PAGE
     ========================================================= */

  return (
    <AppShell>
      <div className="space-y-7">
        {/* =====================================================
            BACK
           ===================================================== */}

        <div>
          <Link
            to="/editions"
            className="
              inline-flex
              items-center
              gap-1
              text-xs
              font-medium
              text-muted-foreground
              hover:text-foreground
            "
          >
            ← Editions
          </Link>
        </div>

        {/* =====================================================
            HERO
           ===================================================== */}

        <section
          className="
            relative
            min-h-[420px]
            overflow-hidden
            rounded-[2rem]
            border
            border-white/20
            bg-black/25
            shadow-2xl
            sm:min-h-[480px]
          "
        >
          {/* Winner visual */}

          {winner?.flag_image && (
            <div
              className="
                absolute
                -right-[18%]
                top-1/2
                aspect-square
                w-[95%]
                -translate-y-1/2
                overflow-hidden
                rounded-full
                opacity-[0.22]
                sm:w-[62%]
              "
            >
              <img
                src={
                  winner.flag_image
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

          {/* Edition logo */}

          {edition.logo && (
            <img
              src={
                edition.logo
              }
              alt=""
              className="
                absolute
                right-5
                top-5
                z-10
                h-20
                w-20
                object-contain
                opacity-80
                sm:h-32
                sm:w-32
              "
            />
          )}

          {/* Gradient */}

          <div
            className="
              absolute
              inset-0
              bg-gradient-to-r
              from-[#020817]/96
              via-[#041429]/84
              to-[#041429]/30
            "
          />

          <div
            className="
              relative
              z-20
              flex
              min-h-[420px]
              flex-col
              justify-between
              p-5
              sm:min-h-[480px]
              sm:p-8
              lg:p-10
            "
          >
            <div>
              <span
                className="
                  inline-flex
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
                "
              >
                {edition.published
                  ? "Contest archive"
                  : "Upcoming edition"}
              </span>
            </div>

            <div className="max-w-3xl">
              <p
                className="
                  text-xs
                  font-semibold
                  uppercase
                  tracking-[0.2em]
                  text-primary
                "
              >
                {[
                  edition.host_city,
                  edition.year,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              <h1
                className="
                  mt-2
                  font-display
                  text-5xl
                  font-bold
                  leading-[0.9]
                  tracking-[-0.055em]
                  text-white
                  sm:text-7xl
                "
              >
                {editionLabel(
                  edition,
                )}
              </h1>

              <p
                className="
                  mt-3
                  text-lg
                  font-medium
                  text-white/80
                  sm:text-2xl
                "
              >
                {edition.name}
              </p>

              {edition.description && (
                <p
                  className="
                    mt-4
                    max-w-xl
                    text-sm
                    leading-relaxed
                    text-white/60
                  "
                >
                  {
                    edition.description
                  }
                </p>
              )}

              {winner && (
                <div
                  className="
                    mt-7
                    flex
                    items-center
                    gap-4
                  "
                >
                  <FlagChip
                    code={
                      winner.short_code
                    }
                    color={
                      winner.accent_color
                    }
                    image={
                      winner.flag_image
                    }
                    size="xl"
                  />

                  <div>
                    <p
                      className="
                        text-[9px]
                        font-bold
                        uppercase
                        tracking-[0.18em]
                        text-white/50
                      "
                    >
                      Winner
                    </p>

                    <p
                      className="
                        mt-1
                        font-display
                        text-xl
                        font-bold
                        text-white
                        sm:text-2xl
                      "
                    >
                      {winner.name}
                    </p>

                    {winnerResult && (
                      <p
                        className="
                          numeric
                          mt-1
                          text-xs
                          text-white/55
                        "
                      >
                        {
                          winnerResult.total_points
                        }{" "}
                        points
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* =====================================================
            EDITION NUMBERS
           ===================================================== */}

        <Panel>
          <div
            className="
              grid
              grid-cols-2
              gap-x-5
              gap-y-5
              sm:grid-cols-4
            "
          >
            <StatTile
              label="Countries"
              value={
                nationIds.length
              }
            />

            <StatTile
              label="Shows"
              value={
                showList.length
              }
            />

            <StatTile
              label="Semi-finals"
              value={
                semiFinals.length
              }
            />

            <StatTile
              label="Finalists"
              value={
                finalistCount ||
                "—"
              }
            />
          </div>
        </Panel>

        {/* =====================================================
            WINNER + TOP FIVE
           ===================================================== */}

        {finalResults.length >
          0 && (
          <section
            className="
              grid
              gap-5
              lg:grid-cols-[.85fr_1.15fr]
            "
          >
            {/* WINNER */}

            <div
              className="
                glass
                relative
                overflow-hidden
                p-5
                sm:p-6
              "
            >
              {winner?.flag_image && (
                <div
                  className="
                    absolute
                    -bottom-16
                    -right-16
                    h-64
                    w-64
                    overflow-hidden
                    rounded-full
                    opacity-[0.10]
                  "
                >
                  <img
                    src={
                      winner.flag_image
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

              <div className="relative z-10">
                <p
                  className="
                    text-[10px]
                    font-bold
                    uppercase
                    tracking-[0.18em]
                    text-primary
                  "
                >
                  Grand Final winner
                </p>

                {winner ? (
                  <>
                    <div
                      className="
                        mt-5
                        flex
                        items-center
                        gap-4
                      "
                    >
                      <FlagChip
                        code={
                          winner.short_code
                        }
                        color={
                          winner.accent_color
                        }
                        image={
                          winner.flag_image
                        }
                        size="xl"
                      />

                      <div>
                        <h2
                          className="
                            font-display
                            text-2xl
                            font-bold
                          "
                        >
                          {
                            winner.name
                          }
                        </h2>

                        <p
                          className="
                            numeric
                            mt-1
                            text-sm
                            text-muted-foreground
                          "
                        >
                          {
                            winnerResult?.total_points
                          }{" "}
                          points
                        </p>
                      </div>
                    </div>

                    {grandFinal && (
                      <Link
                        to="/shows/$showId"
                        params={{
                          showId:
                            grandFinal.id,
                        }}
                        className="
                          mt-6
                          inline-flex
                          min-h-11
                          items-center
                          rounded-xl
                          bg-aurora
                          px-4
                          text-sm
                          font-semibold
                          text-primary-foreground
                        "
                      >
                        Grand Final results →
                      </Link>
                    )}
                  </>
                ) : (
                  <p
                    className="
                      mt-4
                      text-sm
                      text-muted-foreground
                    "
                  >
                    Winner unavailable.
                  </p>
                )}
              </div>
            </div>

            {/* TOP FIVE */}

            <Panel
              title="Grand Final"
              description="Top five"
            >
              <div
                className="
                  divide-y
                  divide-border/60
                "
              >
                {topFive.map(
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
                        className="
                          grid
                          grid-cols-[32px_40px_1fr_auto]
                          items-center
                          gap-3
                          py-3
                          first:pt-0
                          last:pb-0
                        "
                      >
                        <span
                          className="
                            numeric
                            text-center
                            text-xs
                            text-muted-foreground
                          "
                        >
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

                        <p
                          className="
                            min-w-0
                            truncate
                            text-sm
                            font-semibold
                          "
                        >
                          {
                            country.name
                          }
                        </p>

                        <span
                          className="
                            numeric
                            text-sm
                            font-semibold
                          "
                        >
                          {
                            result.total_points
                          }
                        </span>
                      </Link>
                    );
                  },
                )}
              </div>
            </Panel>
          </section>
        )}

        {/* =====================================================
            JURY / TELE WINNERS
           ===================================================== */}

        {finalResults.length >
          0 && (
          <section>
            <p
              className="
                mb-3
                text-[10px]
                font-bold
                uppercase
                tracking-[0.2em]
                text-muted-foreground
              "
            >
              Voting highlights
            </p>

            <div
              className="
                grid
                gap-3
                sm:grid-cols-2
              "
            >
              <VotingWinner
                label="Jury winner"
                country={
                  juryWinner
                }
                points={
                  juryWinnerResult?.jury_points ??
                  0
                }
                kind="jury"
              />

              <VotingWinner
                label="Televote winner"
                country={
                  televoteWinner
                }
                points={
                  televoteWinnerResult?.televote_points ??
                  0
                }
                kind="televote"
              />
            </div>
          </section>
        )}

        {/* =====================================================
            SHOWS
           ===================================================== */}

        <section>
          <div
            className="
              mb-3
              flex
              items-end
              justify-between
              gap-4
            "
          >
            <div>
              <p
                className="
                  text-[10px]
                  font-bold
                  uppercase
                  tracking-[0.2em]
                  text-muted-foreground
                "
              >
                The edition
              </p>

              <h2
                className="
                  mt-1
                  font-display
                  text-2xl
                  font-bold
                "
              >
                Shows
              </h2>
            </div>

            <span
              className="
                text-xs
                text-muted-foreground
              "
            >
              {
                showList.length
              }{" "}
              total
            </span>
          </div>

          {showList.length ? (
            <div
              className="
                grid
                gap-3
                md:grid-cols-2
              "
            >
              {showList.map(
                (show) => {
                  const line =
                    participantList.filter(
                      (
                        participant,
                      ) =>
                        participant.show_id ===
                        show.id,
                    );

                  const showResults =
                    resultList.filter(
                      (result) =>
                        result.show_id ===
                        show.id,
                    );

                  const showWinnerResult =
                    [...showResults]
                      .filter(
                        (result) =>
                          result.final_rank !=
                          null,
                      )
                      .sort(
                        (a, b) =>
                          (a.final_rank ??
                            999) -
                          (b.final_rank ??
                            999),
                      )[0] ??
                    null;

                  const showWinner =
                    showWinnerResult
                      ? countryMap.get(
                          showWinnerResult.country_id,
                        ) ??
                        null
                      : null;

                  return (
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
                        glass
                        group
                        block
                        p-4
                        transition-transform
                        hover:-translate-y-0.5
                        sm:p-5
                      "
                    >
                      <div
                        className="
                          flex
                          items-start
                          justify-between
                          gap-4
                        "
                      >
                        <div>
                          <p
                            className="
                              text-[9px]
                              font-semibold
                              uppercase
                              tracking-[0.16em]
                              text-primary
                            "
                          >
                            {show.kind.replace(
                              "-",
                              " ",
                            )}
                          </p>

                          <h3
                            className="
                              mt-1
                              font-display
                              text-lg
                              font-bold
                            "
                          >
                            {
                              show.name
                            }
                          </h3>

                          <p
                            className="
                              mt-1
                              text-xs
                              text-muted-foreground
                            "
                          >
                            {
                              line.length
                            }{" "}
                            entries
                            {show.qualifier_count !=
                            null
                              ? ` · ${show.qualifier_count} qualifiers`
                              : ""}
                          </p>
                        </div>

                        <span
                          className="
                            text-lg
                            text-primary
                            transition-transform
                            group-hover:translate-x-1
                          "
                        >
                          →
                        </span>
                      </div>

                      {showWinner && (
                        <div
                          className="
                            mt-4
                            flex
                            items-center
                            gap-2
                            border-t
                            border-border/60
                            pt-3
                          "
                        >
                          <FlagChip
                            code={
                              showWinner.short_code
                            }
                            color={
                              showWinner.accent_color
                            }
                            image={
                              showWinner.flag_image
                            }
                            size="sm"
                          />

                          <div>
                            <p
                              className="
                                text-[9px]
                                uppercase
                                tracking-[0.12em]
                                text-muted-foreground
                              "
                            >
                              Winner
                            </p>

                            <p
                              className="
                                text-xs
                                font-semibold
                              "
                            >
                              {
                                showWinner.name
                              }
                            </p>
                          </div>
                        </div>
                      )}

                      <div
                        className="
                          mt-4
                          flex
                          flex-wrap
                          gap-1.5
                        "
                      >
                        {line
                          .slice(
                            0,
                            14,
                          )
                          .map(
                            (
                              participant,
                            ) => {
                              const country =
                                countryMap.get(
                                  participant.country_id,
                                );

                              return country ? (
                                <FlagChip
                                  key={
                                    participant.id
                                  }
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
                              ) : null;
                            },
                          )}
                      </div>
                    </Link>
                  );
                },
              )}
            </div>
          ) : (
            <div
              className="
                glass
                p-6
                text-sm
                text-muted-foreground
              "
            >
              No shows yet.
            </div>
          )}
        </section>

        {/* =====================================================
            PARTICIPATING COUNTRIES
           ===================================================== */}

        <section>
          <div
            className="
              mb-3
              flex
              items-end
              justify-between
              gap-4
            "
          >
            <div>
              <p
                className="
                  text-[10px]
                  font-bold
                  uppercase
                  tracking-[0.2em]
                  text-muted-foreground
                "
              >
                Delegations
              </p>

              <h2
                className="
                  mt-1
                  font-display
                  text-2xl
                  font-bold
                "
              >
                Participating countries
              </h2>
            </div>

            <span
              className="
                numeric
                text-xs
                text-muted-foreground
              "
            >
              {
                participatingCountries.length
              }
            </span>
          </div>

          <div
            className="
              glass
              p-4
              sm:p-5
            "
          >
            {participatingCountries.length ? (
              <div
                className="
                  flex
                  flex-wrap
                  gap-2
                "
              >
                {participatingCountries.map(
                  (
                    country,
                  ) => (
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
            ) : (
              <p
                className="
                  text-sm
                  text-muted-foreground
                "
              >
                No participating countries recorded yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

/* =========================================================
   VOTING WINNER
   ========================================================= */

function VotingWinner({
  label,
  country,
  points,
  kind,
}: {
  label: string;

  country:
    | {
        id: string;
        name: string;
        short_code: string;
        flag_image: string | null;
        accent_color: string;
      }
    | null;

  points: number;

  kind:
    | "jury"
    | "televote";
}) {
  return (
    <div
      className="
        glass
        relative
        overflow-hidden
        p-4
        sm:p-5
      "
    >
      {country?.flag_image && (
        <div
          className="
            absolute
            -bottom-12
            -right-12
            h-44
            w-44
            overflow-hidden
            rounded-full
            opacity-[0.08]
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

      <div className="relative z-10">
        <div
          className="
            flex
            items-center
            gap-2
          "
        >
          <span
            className="
              h-2.5
              w-2.5
              rounded-full
            "
            style={{
              backgroundColor:
                kind ===
                "jury"
                  ? "var(--jury)"
                  : "var(--televote)",
            }}
          />

          <p
            className="
              text-[9px]
              font-bold
              uppercase
              tracking-[0.16em]
              text-muted-foreground
            "
          >
            {label}
          </p>
        </div>

        {country ? (
          <div
            className="
              mt-4
              flex
              items-center
              gap-3
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

            <div>
              <p
                className="
                  text-sm
                  font-semibold
                "
              >
                {country.name}
              </p>

              <p
                className="
                  numeric
                  mt-1
                  text-xs
                  text-muted-foreground
                "
              >
                {points} points
              </p>
            </div>
          </div>
        ) : (
          <p
            className="
              mt-4
              text-sm
              text-muted-foreground
            "
          >
            No result available.
          </p>
        )}
      </div>
    </div>
  );
}
