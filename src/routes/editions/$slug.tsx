import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";

import {
  useMemo,
} from "react";

import {
  AppShell,
  Panel,
  StatTile,
} from "@/components/AppShell";

import {
  FlagChip,
} from "@/components/FlagChip";

import {
  editionLabel,
  useAllResults,
  useContestEntities,
  useCountries,
  useEdition,
  useParticipants,
  useShows,
} from "@/lib/data";

import {
  entityDisplayMap,
  type EntityDisplay,
} from "@/lib/entities";

import {
  hasAnyPublicInformation,
  resolvePublicationConfig,
} from "@/lib/publication";

/* ============================================================
   ROUTE
   ============================================================ */

export const Route =
  createFileRoute(
    "/editions/$slug",
  )({
    head:
      ({
        params,
      }) => ({
        meta: [
          {
            title:
              `${params.slug} — Solaris Song Contest`,
          },
        ],
      }),

    component:
      EditionPage,
  });

/* ============================================================
   PAGE
   ============================================================ */

function EditionPage() {
  const {
    slug,
  } =
    Route.useParams();

  const {
    data:
      edition,

    isLoading,
  } =
    useEdition(
      slug,
    );

  const {
    data:
      shows,
  } =
    useShows(
      edition?.id,
    );

  const {
    data:
      participants,
  } =
    useParticipants(
      edition?.id,
    );

  const {
    data:
      countries,
  } =
    useCountries();

  const {
    data:
      entities,
  } =
    useContestEntities(
      edition?.id,
    );

  const {
    data:
      allResults,
  } =
    useAllResults();

  /* =========================================================
     LOADING
     ========================================================= */

  if (
    isLoading
  ) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">
          Loading edition…
        </p>
      </AppShell>
    );
  }

  /* =========================================================
     NOT FOUND
     ========================================================= */

  if (
    !edition
  ) {
    return (
      <AppShell>
        <div className="glass p-6">
          <h1 className="font-display text-2xl font-bold">
            Edition not found
          </h1>

          <Link
            to="/editions"
            className="mt-4 inline-block text-sm text-primary"
          >
            ← Editions
          </Link>
        </div>
      </AppShell>
    );
  }

  /* =========================================================
     PRIVATE EDITION
     ========================================================= */

  if (
    !edition.published
  ) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl py-12">
          <Panel>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Solaris Song Contest
            </p>

            <h1 className="mt-2 font-display text-3xl font-bold">
              {editionLabel(
                edition,
              )}
            </h1>

            <p className="mt-3 text-sm text-muted-foreground">
              This edition has not been published yet.
            </p>

            <Link
              to="/editions"
              className="mt-5 inline-flex text-sm font-semibold text-primary"
            >
              ← Back to editions
            </Link>
          </Panel>
        </div>
      </AppShell>
    );
  }

  /* =========================================================
     BASE DATA
     ========================================================= */

  const showList =
    shows ?? [];

  const participantList =
    participants ??
    [];

  const displayMap =
    entityDisplayMap(
      entities,
      countries,
    );

  const resultList =
    (
      allResults ??
      []
    ).filter(
      (
        result,
      ) =>
        result.edition_id ===
        edition.id,
    );

  /* =========================================================
     PUBLIC SHOWS ONLY
     ========================================================= */

  const publicShows =
    showList
      .filter(
        (
          show,
        ) => {
          const publication =
            resolvePublicationConfig(
              show.publication_config,
            );

          return (
            show.published &&
            hasAnyPublicInformation(
              publication,
            )
          );
        },
      )
      .sort(
        (
          a,
          b,
        ) =>
          a.sort_order -
          b.sort_order,
      );

  const publicShowIds =
    new Set(
      publicShows.map(
        (
          show,
        ) =>
          show.id,
      ),
    );

  /* =========================================================
     PARTICIPATING COUNTRIES

     Only include participants from shows where participant
     identities themselves have been published.
     ========================================================= */

  const publishedParticipantRows =
    participantList.filter(
      (
        participant,
      ) => {
        if (
          !participant.show_id
        ) {
          return false;
        }

        const show =
          publicShows.find(
            (
              item,
            ) =>
              item.id ===
              participant.show_id,
          );

        if (
          !show
        ) {
          return false;
        }

        const publication =
          resolvePublicationConfig(
            show.publication_config,
          );

        return publication.participants;
      },
    );

  const nationIds =
    [
      ...new Set(
        publishedParticipantRows.map(
          (
            participant,
          ) =>
            participant.country_id,
        ),
      ),
    ];

  const participatingCountries =
    nationIds
      .map(
        (
          id,
        ) =>
          displayMap.get(
            id,
          ),
      )
      .filter(
        (
          country,
        ): country is EntityDisplay =>
          !!country,
      );

  /* =========================================================
     GRAND FINAL
     ========================================================= */

  const grandFinal =
    publicShows.find(
      (
        show,
      ) =>
        show.kind ===
        "grand-final",
    ) ??
    null;

  const grandFinalPublication =
    grandFinal
      ? resolvePublicationConfig(
          grandFinal.publication_config,
        )
      : null;

  /* =========================================================
     FINAL RESULTS

     Only available if overall results have been published.
     ========================================================= */

  const finalResults =
    grandFinal &&
    grandFinalPublication?.results
      ? resultList
          .filter(
            (
              result,
            ) =>
              result.show_id ===
                grandFinal.id &&
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

  /* =========================================================
     WINNER
     ========================================================= */

  const winnerResult =
    finalResults.find(
      (
        result,
      ) =>
        result.final_rank ===
        1,
    ) ??
    finalResults[0] ??
    null;

  const winner =
    winnerResult
      ? displayMap.get(
          winnerResult.country_id,
        ) ??
        null
      : null;

  /* =========================================================
     JURY WINNER
     ========================================================= */

  const juryWinnerResult =
    grandFinalPublication?.jury_results &&
    finalResults.length
      ? [
          ...finalResults,
        ].sort(
          (
            a,
            b,
          ) =>
            b.jury_points -
            a.jury_points,
        )[0]
      : null;

  const juryWinner =
    juryWinnerResult
      ? displayMap.get(
          juryWinnerResult.country_id,
        ) ??
        null
      : null;

  /* =========================================================
     TELEVOTE WINNER
     ========================================================= */

  const teleWinnerResult =
    grandFinalPublication?.televote_results &&
    finalResults.length
      ? [
          ...finalResults,
        ].sort(
          (
            a,
            b,
          ) =>
            b.televote_points -
            a.televote_points,
        )[0]
      : null;

  const teleWinner =
    teleWinnerResult
      ? displayMap.get(
          teleWinnerResult.country_id,
        ) ??
        null
      : null;

  /* =========================================================
     SEMI FINALS
     ========================================================= */

  const semiFinals =
    publicShows.filter(
      (
        show,
      ) =>
        show.kind ===
        "semi-final",
    );

  /* =========================================================
     FINALIST COUNT

     Only expose it if Grand Final participants are public.
     ========================================================= */

  const finalistCount =
    grandFinal &&
    grandFinalPublication?.participants
      ? participantList.filter(
          (
            participant,
          ) =>
            participant.show_id ===
            grandFinal.id,
        ).length
      : null;

  /* =========================================================
     PAGE
     ========================================================= */

  return (
    <AppShell>
      <div className="space-y-7">
        <Link
          to="/editions"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          ← Editions
        </Link>

        {/* ===================================================
            HERO
           =================================================== */}

        <section className="relative min-h-[420px] overflow-hidden rounded-[2rem] border border-white/20 bg-black/25 shadow-2xl sm:min-h-[480px]">
          {winner?.flag_image && (
            <div className="absolute -right-[18%] top-1/2 aspect-square w-[95%] -translate-y-1/2 overflow-hidden rounded-full opacity-[0.22] sm:w-[62%]">
              <img
                src={
                  winner.flag_image
                }
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-r from-[#020817]/96 via-[#041429]/84 to-[#041429]/30" />

          <div className="relative z-20 flex min-h-[420px] flex-col justify-between p-5 sm:min-h-[480px] sm:p-8 lg:p-10">
            <span className="w-fit rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
              {edition.status ===
              "completed"
                ? "Completed edition"
                : "Current edition"}
            </span>

            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {edition.host_city ??
                  "Solaris Song Contest"}
              </p>

              <h1 className="mt-2 font-display text-5xl font-bold leading-[0.9] tracking-[-0.055em] text-white sm:text-7xl">
                {editionLabel(
                  edition,
                )}
              </h1>

              {edition.name !==
                editionLabel(
                  edition,
                ) && (
                <p className="mt-3 text-lg font-medium text-white/80 sm:text-2xl">
                  {
                    edition.name
                  }
                </p>
              )}

              {edition.description && (
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/60">
                  {
                    edition.description
                  }
                </p>
              )}

              {winner &&
                winnerResult &&
                grandFinalPublication?.results && (
                  <div className="mt-7 flex items-center gap-4">
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
                      <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/50">
                        Winner
                      </p>

                      <p className="mt-1 font-display text-xl font-bold text-white">
                        {
                          winner.name
                        }
                      </p>

                      <p className="numeric mt-1 text-xs text-white/55">
                        {
                          winnerResult.total_points
                        }{" "}
                        points
                      </p>
                    </div>
                  </div>
                )}
            </div>
          </div>
        </section>

        {/* ===================================================
            STATS
           =================================================== */}

        <Panel>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <StatTile
              label="Edition"
              value={
                edition.edition_number !=
                null
                  ? `SSC ${edition.edition_number}`
                  : "—"
              }
            />

            <StatTile
              label="Countries"
              value={
                participatingCountries.length ||
                "—"
              }
            />

            <StatTile
              label="Semi-finals"
              value={
                semiFinals.length ||
                "—"
              }
            />

            <StatTile
              label="Finalists"
              value={
                finalistCount ??
                "—"
              }
            />
          </div>
        </Panel>

        {/* ===================================================
            FINAL RESULTS
           =================================================== */}

        {grandFinalPublication?.results &&
          finalResults.length >
            0 && (
            <section className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
              <div className="glass relative overflow-hidden p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                  {editionLabel(
                    edition,
                  )}{" "}
                  winner
                </p>

                {winner && (
                  <>
                    <div className="mt-5 flex items-center gap-4">
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
                        <h2 className="font-display text-2xl font-bold">
                          {
                            winner.name
                          }
                        </h2>

                        <p className="numeric mt-1 text-sm text-muted-foreground">
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
                        className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-aurora px-4 text-sm font-semibold text-primary-foreground"
                      >
                        Grand Final results →
                      </Link>
                    )}
                  </>
                )}
              </div>

              <Panel
                title={`${editionLabel(
                  edition,
                )} Grand Final`}
                description="Top five"
              >
                <div className="divide-y divide-border/60">
                  {finalResults
                    .slice(
                      0,
                      5,
                    )
                    .map(
                      (
                        result,
                        index,
                      ) => {
                        const country =
                          displayMap.get(
                            result.country_id,
                          );

                        if (
                          !country
                        ) {
                          return null;
                        }

                        const content =
                          (
                            <>
                              <span className="numeric text-xs text-muted-foreground">
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

                              <span className="numeric text-sm font-semibold">
                                {
                                  result.total_points
                                }
                              </span>
                            </>
                          );

                        if (
                          country.entityType ===
                            "global" &&
                          country.countryId
                        ) {
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
                              className="grid grid-cols-[32px_40px_1fr_auto] items-center gap-3 py-3"
                            >
                              {
                                content
                              }
                            </Link>
                          );
                        }

                        return (
                          <div
                            key={
                              result.id
                            }
                            className="grid grid-cols-[32px_40px_1fr_auto] items-center gap-3 py-3"
                          >
                            {
                              content
                            }
                          </div>
                        );
                      },
                    )}
                </div>
              </Panel>
            </section>
          )}

        {/* ===================================================
            VOTING HIGHLIGHTS
           =================================================== */}

        {(juryWinner ||
          teleWinner) && (
          <section>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Voting highlights
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {grandFinalPublication?.jury_results &&
                juryWinner &&
                juryWinnerResult && (
                  <VotingWinner
                    label="Jury winner"
                    country={
                      juryWinner
                    }
                    points={
                      juryWinnerResult.jury_points
                    }
                  />
                )}

              {grandFinalPublication?.televote_results &&
                teleWinner &&
                teleWinnerResult && (
                  <VotingWinner
                    label="Televote winner"
                    country={
                      teleWinner
                    }
                    points={
                      teleWinnerResult.televote_points
                    }
                  />
                )}
            </div>
          </section>
        )}

        {/* ===================================================
            SHOWS
           =================================================== */}

        {!!publicShows.length && (
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              {editionLabel(
                edition,
              )}
            </p>

            <h2 className="mt-1 font-display text-2xl font-bold">
              Shows
            </h2>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {publicShows.map(
                (
                  show,
                ) => {
                  const publication =
                    resolvePublicationConfig(
                      show.publication_config,
                    );

                  const line =
                    publication.participants
                      ? participantList.filter(
                          (
                            participant,
                          ) =>
                            participant.show_id ===
                            show.id,
                        )
                      : [];

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
                      className="glass group block p-4 sm:p-5"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-primary">
                            {show.kind.replace(
                              "-",
                              " ",
                            )}
                          </p>

                          <h3 className="mt-1 font-display text-lg font-bold">
                            {
                              show.name
                            }
                          </h3>

                          {publication.participants && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {
                                line.length
                              }{" "}
                              entries
                            </p>
                          )}

                          {!publication.participants && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Information published
                            </p>
                          )}
                        </div>

                        <span className="text-primary">
                          →
                        </span>
                      </div>

                      {publication.participants &&
                        !!line.length && (
                          <div className="mt-4 flex flex-wrap gap-1.5">
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
                                    displayMap.get(
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
                        )}
                    </Link>
                  );
                },
              )}
            </div>
          </section>
        )}

        {/* ===================================================
            PARTICIPATING COUNTRIES
           =================================================== */}

        {!!participatingCountries.length && (
          <section>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                  Delegations
                </p>

                <h2 className="mt-1 font-display text-2xl font-bold">
                  Participating countries
                </h2>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {participatingCountries.map(
                (
                  country,
                ) => {
                  const card =
                    (
                      <div className="glass flex items-center gap-3 p-3">
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
                          size="md"
                        />

                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {
                              country.name
                            }
                          </p>

                          <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            {
                              country.short_code
                            }
                          </p>
                        </div>
                      </div>
                    );

                  if (
                    country.entityType ===
                      "global" &&
                    country.countryId
                  ) {
                    return (
                      <Link
                        key={
                          country.id
                        }
                        to="/countries/$code"
                        params={{
                          code:
                            country.short_code,
                        }}
                      >
                        {
                          card
                        }
                      </Link>
                    );
                  }

                  return (
                    <div
                      key={
                        country.id
                      }
                    >
                      {
                        card
                      }
                    </div>
                  );
                },
              )}
            </div>
          </section>
        )}

        {/* ===================================================
            EMPTY PUBLIC EDITION
           =================================================== */}

        {!publicShows.length && (
          <Panel>
            <p className="text-sm text-muted-foreground">
              This edition is public, but no individual shows have been released yet.
            </p>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}

/* ============================================================
   VOTING WINNER
   ============================================================ */

function VotingWinner({
  label,
  country,
  points,
}: {
  label:
    string;

  country:
    EntityDisplay;

  points:
    number;
}) {
  return (
    <div className="glass flex items-center gap-4 p-4">
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
        size="lg"
      />

      <div className="min-w-0">
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-primary">
          {label}
        </p>

        <p className="mt-1 truncate font-display text-lg font-bold">
          {
            country.name
          }
        </p>

        <p className="numeric mt-1 text-xs text-muted-foreground">
          {points} points
        </p>
      </div>
    </div>
  );
}
