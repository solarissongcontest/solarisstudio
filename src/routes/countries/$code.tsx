import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";

import {
  useMemo,
  useState,
} from "react";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AppShell,
  Panel,
  StatTile,
} from "@/components/AppShell";

import {
  FlagChip,
} from "@/components/FlagChip";

import {
  ResponsiveTabs,
} from "@/components/ResponsiveTabs";

import {
  editionLabel,
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data";

import {
  computeCountryStats,
  computeHeadToHead,
  computeRelationship,
} from "@/lib/stats";

export const Route =
  createFileRoute(
    "/countries/$code",
  )({
    head: ({ params }) => ({
      meta: [
        {
          title:
            `${params.code} — Country profile — Solaris Studio`,
        },
      ],
    }),

    component:
      CountryProfilePage,
  });

const TABS = [
  {
    value:
      "overview",
    label:
      "Overview",
  },

  {
    value:
      "results",
    label:
      "Results",
  },

  {
    value:
      "voting",
    label:
      "Voting",
  },

  {
    value:
      "relationships",
    label:
      "Relationships",
  },
] as const;

type Tab =
  (typeof TABS)[number]["value"];

function CountryProfilePage() {
  const {
    code,
  } =
    Route.useParams();

  const {
    data: countries,
  } =
    useCountries();

  const {
    data: editions,
  } =
    useEditions();

  const {
    data: shows,
  } =
    useAllShows();

  const {
    data: participants,
  } =
    useAllParticipants();

  const {
    data: results,
  } =
    useAllResults();

  const {
    data: jury,
  } =
    useAllJuryVotes();

  const {
    data: televote,
  } =
    useAllTelevotes();

  const [
    tab,
    setTab,
  ] =
    useState<Tab>(
      "overview",
    );

  const country =
    (
      countries ??
      []
    ).find(
      (item) =>
        item.short_code.toUpperCase() ===
        code.toUpperCase(),
    );

  const opts =
    useMemo(
      () => ({
        editions:
          editions ??
          [],

        shows:
          shows ??
          [],

        participants:
          participants ??
          [],

        results:
          results ??
          [],

        jury:
          jury ??
          [],

        televote:
          televote ??
          [],
      }),
      [
        editions,
        shows,
        participants,
        results,
        jury,
        televote,
      ],
    );

  const stats =
    useMemo(
      () =>
        country
          ? computeCountryStats(
              country.id,
              opts,
            )
          : null,
      [
        country,
        opts,
      ],
    );

  if (
    !country
  ) {
    return (
      <AppShell>
        <div className="glass p-6">
          <h1 className="font-display text-2xl font-bold">
            Country not found
          </h1>

          <Link
            to="/countries"
            className="mt-4 inline-block text-sm text-primary"
          >
            ← Countries
          </Link>
        </div>
      </AppShell>
    );
  }

  const countryMap =
    new Map(
      (
        countries ??
        []
      ).map(
        (item) => [
          item.id,
          item,
        ],
      ),
    );

  const editionMap =
    new Map(
      (
        editions ??
        []
      ).map(
        (edition) => [
          edition.id,
          edition,
        ],
      ),
    );

  const showMap =
    new Map(
      (
        shows ??
        []
      ).map(
        (show) => [
          show.id,
          show,
        ],
      ),
    );

  /* =========================================================
     RESULTS
     ========================================================= */

  const myResults =
    (
      results ??
      []
    )
      .filter(
        (result) =>
          result.country_id ===
          country.id,
      )
      .sort(
        (a, b) =>
          (editionMap.get(
            b.edition_id,
          )?.edition_number ??
            -1) -
          (editionMap.get(
            a.edition_id,
          )?.edition_number ??
            -1),
      );

  const finalResults =
    myResults.filter(
      (result) =>
        showMap.get(
          result.show_id ??
            "",
        )?.kind ===
        "grand-final",
    );

  const semiRows =
    (
      participants ??
      []
    )
      .filter(
        (participant) =>
          participant.country_id ===
            country.id &&
          showMap.get(
            participant.show_id ??
              "",
          )?.kind ===
            "semi-final",
      )
      .map(
        (participant) => ({
          participant,

          edition:
            editionMap.get(
              participant.edition_id,
            ),

          result:
            myResults.find(
              (result) =>
                result.show_id ===
                participant.show_id,
            ),
        }),
      )
      .sort(
        (a, b) =>
          (b.edition
            ?.edition_number ??
            -1) -
          (a.edition
            ?.edition_number ??
            -1),
      );

  /* =========================================================
     VOTING
     ========================================================= */

  const given =
    (
      jury ??
      []
    ).filter(
      (vote) =>
        vote.voter_country_id ===
        country.id,
    );

  const received =
    (
      jury ??
      []
    ).filter(
      (vote) =>
        vote.receiving_country_id ===
        country.id,
    );

  const aggregate = (
    rows:
      typeof given,

    key:
      | "receiving_country_id"
      | "voter_country_id",
  ) => {
    const totals =
      new Map<
        string,
        number
      >();

    rows.forEach(
      (vote) => {
        const id =
          vote[key];

        if (
          !id
        ) {
          return;
        }

        totals.set(
          id,

          (totals.get(
            id,
          ) ?? 0) +
            vote.points,
        );
      },
    );

    return [
      ...totals.entries(),
    ]
      .map(
        ([
          id,
          points,
        ]) => ({
          country:
            countryMap.get(
              id,
            ),

          points,
        }),
      )
      .filter(
        (
          item,
        ): item is {
          country: NonNullable<
            typeof item.country
          >;
          points: number;
        } =>
          !!item.country,
      )
      .sort(
        (a, b) =>
          b.points -
          a.points,
      )
      .slice(
        0,
        8,
      );
  };

  const topGiven =
    aggregate(
      given,
      "receiving_country_id",
    );

  const topReceived =
    aggregate(
      received,
      "voter_country_id",
    );

  /* =========================================================
     RELATIONSHIPS
     ========================================================= */

  const myEditionIds =
    new Set(
      myResults.map(
        (result) =>
          result.edition_id,
      ),
    );

  const sharedIds =
    new Set<string>();

  (
    results ??
    []
  ).forEach(
    (result) => {
      if (
        result.country_id !==
          country.id &&
        myEditionIds.has(
          result.edition_id,
        )
      ) {
        sharedIds.add(
          result.country_id,
        );
      }
    },
  );

  const relationshipRows =
    [
      ...sharedIds,
    ]
      .map(
        (id) => {
          const other =
            countryMap.get(
              id,
            );

          if (
            !other
          ) {
            return null;
          }

          return {
            other,

            relationship:
              computeRelationship(
                country.id,
                id,
                {
                  editions:
                    editions ??
                    [],

                  jury:
                    jury ??
                    [],

                  results:
                    results ??
                    [],

                  shows:
                    shows ??
                    [],
                },
              ),

            headToHead:
              computeHeadToHead(
                country.id,
                id,
                {
                  editions:
                    editions ??
                    [],

                  results:
                    results ??
                    [],
                },
              ),
          };
        },
      )
      .filter(
        (
          row,
        ): row is NonNullable<
          typeof row
        > =>
          !!row,
      )
      .sort(
        (a, b) =>
          b.relationship
            .friendshipScore -
          a.relationship
            .friendshipScore,
      );

  /* =========================================================
     CHART
     ========================================================= */

  const chartData =
    stats?.timeline
      .filter(
        (point) =>
          point.rank !=
          null,
      )
      .map(
        (point) => ({
          edition:
            point.label,

          editionNumber:
            point.editionNumber,

          rank:
            point.rank,
        }),
      ) ?? [];

  return (
    <AppShell>
      {/* =====================================================
          COUNTRY HERO
         ===================================================== */}

      <section
        className="
          glass
          relative
          mb-6
          overflow-hidden
          p-5
          sm:p-6
        "
      >
        {country.flag_image && (
          <div
            className="
              absolute
              -right-20
              -top-20
              h-72
              w-72
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
              className="h-full w-full object-cover"
            />
          </div>
        )}

        <div className="relative z-10">
          <div
            className="
              flex
              items-center
              gap-4
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
              size="xl"
            />

            <div className="min-w-0">
              <p
                className="
                  text-[10px]
                  font-semibold
                  uppercase
                  tracking-[0.18em]
                  text-primary
                "
              >
                {country.region}
              </p>

              <h1
                className="
                  mt-1
                  truncate
                  font-display
                  text-3xl
                  font-bold
                  sm:text-4xl
                "
              >
                {country.name}
              </h1>

              {country.native_name &&
                country.native_name !==
                  country.name && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {
                      country.native_name
                    }
                  </p>
                )}
            </div>
          </div>

          {country.description && (
            <p
              className="
                mt-4
                max-w-2xl
                text-sm
                leading-relaxed
                text-muted-foreground
              "
            >
              {
                country.description
              }
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/countries"
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            >
              ← Countries
            </Link>

            <Link
              to="/compare"
              search={{
                a:
                  country.short_code,
              }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            >
              Compare
            </Link>
          </div>
        </div>
      </section>

      <ResponsiveTabs
        value={tab}
        options={TABS}
        onChange={
          setTab
        }
        label="Country section"
        className="mb-5"
      />

      {!stats ||
      stats.participations ===
        0 ? (
        <Panel>
          <p className="text-sm text-muted-foreground">
            No contest data is available for this country yet.
          </p>
        </Panel>
      ) : (
        <>
          {/* =================================================
              OVERVIEW
             ================================================= */}

          {tab ===
            "overview" && (
            <div className="space-y-5">
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
                    label="Participations"
                    value={
                      stats.participations
                    }
                  />

                  <StatTile
                    label="Wins"
                    value={
                      stats.wins
                    }
                  />

                  <StatTile
                    label="Avg. placement"
                    value={
                      stats.avgCombinedPlacement?.toFixed(
                        1,
                      ) ??
                      "—"
                    }
                  />

                  <StatTile
                    label="Qualification"
                    value={
                      stats.qualificationPct !=
                      null
                        ? `${stats.qualificationPct.toFixed(
                            0,
                          )}%`
                        : "—"
                    }
                  />
                </div>
              </Panel>

              <div
                className="
                  grid
                  gap-5
                  lg:grid-cols-[1.2fr_.8fr]
                "
              >
                <Panel title="Recent editions">
                  <div className="divide-y divide-border/60">
                    {myResults
                      .slice(
                        0,
                        6,
                      )
                      .map(
                        (
                          result,
                        ) => {
                          const edition =
                            editionMap.get(
                              result.edition_id,
                            );

                          const show =
                            showMap.get(
                              result.show_id ??
                                "",
                            );

                          return (
                            <div
                              key={`${result.edition_id}-${result.show_id}`}
                              className="
                                grid
                                grid-cols-[1fr_auto]
                                gap-3
                                py-3
                                first:pt-0
                                last:pb-0
                              "
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {edition
                                    ? editionLabel(
                                        edition,
                                      )
                                    : "Edition"}
                                </p>

                                <p className="mt-0.5 text-[11px] text-muted-foreground">
                                  {show?.name ??
                                    "Show"}
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="numeric text-sm font-semibold">
                                  {result.final_rank
                                    ? `#${result.final_rank}`
                                    : "—"}
                                </p>

                                <p className="numeric mt-0.5 text-[11px] text-muted-foreground">
                                  {
                                    result.total_points
                                  }{" "}
                                  pts
                                </p>
                              </div>
                            </div>
                          );
                        },
                      )}
                  </div>
                </Panel>

                <Panel title="Career">
                  <div className="divide-y divide-border/60">
                    <Row
                      label="Finals reached"
                      value={
                        stats.finals
                      }
                    />

                    <Row
                      label="Podiums"
                      value={
                        stats.podiums
                      }
                    />

                    <Row
                      label="Top 10 finishes"
                      value={
                        stats.top10
                      }
                    />

                    <Row
                      label="Highest score"
                      value={
                        stats.highestScore ??
                        "—"
                      }
                    />

                    <Row
                      label="Current qualification streak"
                      value={
                        stats.consecutiveQualifications
                      }
                    />
                  </div>
                </Panel>
              </div>
            </div>
          )}

          {/* =================================================
              RESULTS
             ================================================= */}

          {tab ===
            "results" && (
            <div className="space-y-5">
              <Panel
                title="Placement timeline"
                description="Edition numbers are used as the historical timeline. Lower placement is better."
              >
                {chartData.length ? (
                  <div className="h-[270px]">
                    <ResponsiveContainer
                      width="100%"
                      height="100%"
                    >
                      <LineChart
                        data={
                          chartData
                        }
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="var(--border)"
                        />

                        <XAxis
                          dataKey="edition"
                          stroke="var(--muted-foreground)"
                          fontSize={
                            11
                          }
                        />

                        <YAxis
                          reversed
                          allowDecimals={
                            false
                          }
                          stroke="var(--muted-foreground)"
                          fontSize={
                            11
                          }
                        />

                        <Tooltip
                          contentStyle={{
                            background:
                              "var(--popover)",

                            border:
                              "1px solid var(--border)",

                            borderRadius:
                              14,
                          }}
                        />

                        <Line
                          type="monotone"
                          dataKey="rank"
                          name="Placement"
                          stroke="var(--primary)"
                          strokeWidth={
                            3
                          }
                          dot
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No ranked results recorded yet.
                  </p>
                )}
              </Panel>

              <div className="grid gap-5 lg:grid-cols-2">
                <Panel title="Grand finals">
                  <ResultList
                    rows={
                      finalResults
                    }
                    editionMap={
                      editionMap
                    }
                    showMap={
                      showMap
                    }
                  />
                </Panel>

                <Panel title="Qualification history">
                  {semiRows.length ? (
                    <div className="divide-y divide-border/60">
                      {semiRows.map(
                        ({
                          participant,
                          edition,
                          result,
                        }) => (
                          <div
                            key={
                              participant.id
                            }
                            className="
                              flex
                              items-center
                              justify-between
                              gap-3
                              py-3
                              first:pt-0
                              last:pb-0
                            "
                          >
                            <div>
                              <p className="text-sm font-medium">
                                {edition
                                  ? editionLabel(
                                      edition,
                                    )
                                  : "Edition"}
                              </p>

                              <p className="numeric mt-0.5 text-[11px] text-muted-foreground">
                                {result?.total_points ??
                                  "—"}{" "}
                                pts
                              </p>
                            </div>

                            <span
                              className={
                                participant.qualified
                                  ? "rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary"
                                  : "rounded-full bg-surface px-2 py-1 text-[10px] text-muted-foreground"
                              }
                            >
                              {participant.qualified
                                ? "Qualified"
                                : "Eliminated"}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No semi-final history recorded.
                    </p>
                  )}
                </Panel>
              </div>
            </div>
          )}

          {/* =================================================
              VOTING
             ================================================= */}

          {tab ===
            "voting" && (
            <div className="space-y-5">
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
                    label="Avg. received"
                    value={
                      stats.avgReceivedPerContest?.toFixed(
                        0,
                      ) ??
                      "—"
                    }
                  />

                  <StatTile
                    label="Avg. given"
                    value={
                      stats.avgGivenPerContest?.toFixed(
                        0,
                      ) ??
                      "—"
                    }
                  />

                  <StatTile
                    label="Top scores received"
                    value={
                      stats.topScoresReceived
                    }
                  />

                  <StatTile
                    label="Top scores given"
                    value={
                      stats.topScoresGiven
                    }
                  />
                </div>
              </Panel>

              <div className="grid gap-5 lg:grid-cols-2">
                <CountryPointList
                  title="Most support received"
                  rows={
                    topReceived
                  }
                />

                <CountryPointList
                  title="Most points given"
                  rows={
                    topGiven
                  }
                />
              </div>
            </div>
          )}

          {/* =================================================
              RELATIONSHIPS
             ================================================= */}

          {tab ===
            "relationships" && (
            <Panel
              title="Closest relationships"
              description="Ranked by historical friendship score across SSC editions."
            >
              {relationshipRows.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {relationshipRows
                    .slice(
                      0,
                      10,
                    )
                    .map(
                      ({
                        other,
                        relationship,
                        headToHead,
                      }) => (
                        <Link
                          key={
                            other.id
                          }
                          to="/relationships/$pair"
                          params={{
                            pair:
                              `${country.short_code}-vs-${other.short_code}`.toUpperCase(),
                          }}
                          className="
                            rounded-xl
                            bg-surface
                            px-3
                            py-3
                            hover:bg-surface-strong
                          "
                        >
                          <div className="flex items-center gap-3">
                            <FlagChip
                              code={
                                other.short_code
                              }
                              color={
                                other.accent_color
                              }
                              image={
                                other.flag_image
                              }
                              size="sm"
                            />

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">
                                {
                                  other.name
                                }
                              </p>

                              <p className="mt-1 text-[10px] text-muted-foreground">
                                {
                                  relationship.friendshipScore.toFixed(
                                    0,
                                  )
                                }{" "}
                                friendship ·{" "}
                                {
                                  headToHead.sharedEditions
                                }{" "}
                                shared editions
                              </p>
                            </div>
                          </div>
                        </Link>
                      ),
                    )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No relationships recorded yet.
                </p>
              )}
            </Panel>
          )}
        </>
      )}
    </AppShell>
  );
}

/* =========================================================
   RESULT LIST
   ========================================================= */

function ResultList({
  rows,
  editionMap,
  showMap,
}: {
  rows: Array<{
    id: string;
    edition_id: string;
    show_id: string | null;
    final_rank: number | null;
    total_points: number;
  }>;

  editionMap:
    Map<
      string,
      any
    >;

  showMap:
    Map<
      string,
      any
    >;
}) {
  if (
    !rows.length
  ) {
    return (
      <p className="text-sm text-muted-foreground">
        No Grand Final results recorded.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {rows.map(
        (row) => {
          const edition =
            editionMap.get(
              row.edition_id,
            );

          const show =
            showMap.get(
              row.show_id ??
                "",
            );

          return (
            <div
              key={
                row.id
              }
              className="
                flex
                items-center
                justify-between
                gap-3
                py-3
                first:pt-0
                last:pb-0
              "
            >
              <div>
                <p className="text-sm font-medium">
                  {edition
                    ? editionLabel(
                        edition,
                      )
                    : "Edition"}
                </p>

                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {show?.name ??
                    "Grand Final"}
                </p>
              </div>

              <div className="text-right">
                <p className="numeric text-sm font-semibold">
                  {row.final_rank
                    ? `#${row.final_rank}`
                    : "—"}
                </p>

                <p className="numeric mt-0.5 text-[11px] text-muted-foreground">
                  {
                    row.total_points
                  }{" "}
                  pts
                </p>
              </div>
            </div>
          );
        },
      )}
    </div>
  );
}

/* =========================================================
   COUNTRY POINT LIST
   ========================================================= */

function CountryPointList({
  title,
  rows,
}: {
  title: string;

  rows: Array<{
    country: any;
    points: number;
  }>;
}) {
  return (
    <Panel
      title={title}
    >
      {rows.length ? (
        <div className="divide-y divide-border/60">
          {rows.map(
            ({
              country,
              points,
            }) => (
              <Link
                key={
                  country.id
                }
                to="/countries/$code"
                params={{
                  code:
                    country.short_code,
                }}
                className="
                  flex
                  items-center
                  gap-3
                  py-3
                  first:pt-0
                  last:pb-0
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

                <span className="min-w-0 flex-1 truncate text-sm">
                  {
                    country.name
                  }
                </span>

                <span className="numeric text-sm font-semibold">
                  {
                    points
                  }
                </span>
              </Link>
            ),
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No voting data.
        </p>
      )}
    </Panel>
  );
}

function Row({
  label,
  value,
}: {
  label: string;

  value:
    | string
    | number;
}) {
  return (
    <div
      className="
        flex
        items-center
        justify-between
        gap-4
        py-3
        first:pt-0
        last:pb-0
      "
    >
      <span className="text-sm text-muted-foreground">
        {label}
      </span>

      <span className="numeric text-sm font-semibold">
        {value}
      </span>
    </div>
  );
}
