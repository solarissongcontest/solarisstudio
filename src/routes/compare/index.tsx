import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";

import {
  useMemo,
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
  PageHeader,
  Panel,
} from "@/components/AppShell";

import {
  FlagChip,
} from "@/components/FlagChip";

import { computeCanonicalCountryStats } from "@/lib/canonical-country-stats";
import { computeCanonicalHeadToHead } from "@/lib/canonical-head-to-head";
import {
  useAllJuryVotes,
  useAllParticipants,
  useAllResults,
  useAllShows,
  useAllTelevotes,
  useCountries,
  useEditions,
} from "@/lib/data";

import {
  computeRelationship,
} from "@/lib/stats";

type Search = {
  a?: string;
  b?: string;
};

export const Route =
  createFileRoute(
    "/compare/",
  )({
    validateSearch: (
      search:
        Record<
          string,
          unknown
        >,
    ): Search => ({
      a:
        typeof search.a ===
        "string"
          ? search.a
          : undefined,

      b:
        typeof search.b ===
        "string"
          ? search.b
          : undefined,
    }),

    head: () => ({
      meta: [
        {
          title:
            "Compare countries — Solaris Studio",
        },
      ],
    }),

    component:
      ComparePage,
  });

function ComparePage() {
  const {
    a,
    b,
  } =
    Route.useSearch();

  const navigate =
    useNavigate({
      from:
        Route.fullPath,
    });

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

  const countryA =
    (
      countries ??
      []
    ).find(
      (country) =>
        country.short_code ===
        a,
    );

  const countryB =
    (
      countries ??
      []
    ).find(
      (country) =>
        country.short_code ===
        b,
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

  const statsA =
    countryA
      ? computeCanonicalCountryStats(
          countryA.id,
          opts,
        )
      : null;

  const statsB =
    countryB
      ? computeCanonicalCountryStats(
          countryB.id,
          opts,
        )
      : null;

  const headToHead =
    countryA &&
    countryB
      ? computeCanonicalHeadToHead(
          countryA.id,
          countryB.id,
          opts,
        )
      : null;

  const relationship =
    countryA &&
    countryB
      ? computeRelationship(
          countryA.id,
          countryB.id,
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
        )
      : null;

  /* =========================================================
     EDITION NUMBER TIMELINE
     ========================================================= */

  const timeline =
    useMemo(
      () => {
        const editions =
          new Map<
            number,
            string
          >();

        statsA?.timeline.forEach(
          (point) => {
            if (
              point.editionNumber !=
              null
            ) {
              editions.set(
                point.editionNumber,
                point.label,
              );
            }
          },
        );

        statsB?.timeline.forEach(
          (point) => {
            if (
              point.editionNumber !=
              null
            ) {
              editions.set(
                point.editionNumber,
                point.label,
              );
            }
          },
        );

        return [
          ...editions.entries(),
        ]
          .sort(
            (a, b) =>
              a[0] -
              b[0],
          )
          .map(
            ([
              editionNumber,
              label,
            ]) => ({
              editionNumber,
              label,

              a:
                statsA?.timeline.find(
                  (point) =>
                    point.editionNumber ===
                    editionNumber,
                )?.rank ??
                null,

              b:
                statsB?.timeline.find(
                  (point) =>
                    point.editionNumber ===
                    editionNumber,
                )?.rank ??
                null,
            }),
          );
      },
      [
        statsA,
        statsB,
      ],
    );

  return (
    <AppShell>
      <PageHeader
        eyebrow="Comparison"
        title={
          countryA &&
          countryB
            ? `${countryA.name} vs ${countryB.name}`
            : "Compare countries"
        }
        description="Compare two delegations across SSC editions."
      />

      <Panel className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <CountryPicker
            label="Country A"
            value={a}
            countries={
              countries ??
              []
            }
            onChange={(
              code,
            ) =>
              navigate({
                search: (
                  previous:
                    Search,
                ) => ({
                  ...previous,

                  a:
                    code ||
                    undefined,
                }),
              })
            }
          />

          <CountryPicker
            label="Country B"
            value={b}
            countries={
              countries ??
              []
            }
            onChange={(
              code,
            ) =>
              navigate({
                search: (
                  previous:
                    Search,
                ) => ({
                  ...previous,

                  b:
                    code ||
                    undefined,
                }),
              })
            }
          />
        </div>
      </Panel>

      {!countryA ||
      !countryB ||
      !statsA ||
      !statsB ? (
        <Panel>
          <p className="text-sm text-muted-foreground">
            Select two countries to compare them.
          </p>
        </Panel>
      ) : (
        <div className="space-y-5">
          <Panel>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <CountryHead
                country={
                  countryA
                }
              />

              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                vs
              </span>

              <CountryHead
                country={
                  countryB
                }
                align="right"
              />
            </div>
          </Panel>

          <Panel title="Key metrics">
            <div className="divide-y divide-border/60">
              <CompareRow
                label="Participations"
                a={
                  statsA.participations
                }
                b={
                  statsB.participations
                }
              />

              <CompareRow
                label="Wins"
                a={
                  statsA.wins
                }
                b={
                  statsB.wins
                }
              />

              <CompareRow
                label="Avg. placement"
                a={
                  statsA.avgCombinedPlacement?.toFixed(
                    1,
                  ) ??
                  "—"
                }
                b={
                  statsB.avgCombinedPlacement?.toFixed(
                    1,
                  ) ??
                  "—"
                }
              />

              <CompareRow
                label="Avg. points"
                a={
                  statsA.avgPointsPerParticipation?.toFixed(
                    1,
                  ) ??
                  "—"
                }
                b={
                  statsB.avgPointsPerParticipation?.toFixed(
                    1,
                  ) ??
                  "—"
                }
              />

              <CompareRow
                label="Qualification"
                a={
                  statsA.qualificationPct !=
                  null
                    ? `${statsA.qualificationPct.toFixed(
                        0,
                      )}%`
                    : "—"
                }
                b={
                  statsB.qualificationPct !=
                  null
                    ? `${statsB.qualificationPct.toFixed(
                        0,
                      )}%`
                    : "—"
                }
              />
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Head-to-head">
              {headToHead?.sharedEditions ? (
                <div className="divide-y divide-border/60">
                  <Row
                    label={`${countryA.name} finished higher`}
                    value={
                      headToHead.aWins
                    }
                  />

                  <Row
                    label={`${countryB.name} finished higher`}
                    value={
                      headToHead.bWins
                    }
                  />

                  <Row
                    label="Ties"
                    value={
                      headToHead.ties
                    }
                  />

                  <Row
                    label="Shared editions"
                    value={
                      headToHead.sharedEditions
                    }
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No shared final history.
                </p>
              )}
            </Panel>

            <Panel title="Voting relationship">
              {relationship ? (
                <div className="divide-y divide-border/60">
                  <Row
                    label={`${countryA.short_code} → ${countryB.short_code}`}
                    value={`${relationship.totalAtoB} pts`}
                  />

                  <Row
                    label={`${countryB.short_code} → ${countryA.short_code}`}
                    value={`${relationship.totalBtoA} pts`}
                  />

                  <Row
                    label="Friendship score"
                    value={
                      relationship.friendshipScore.toFixed(
                        0,
                      )
                    }
                  />

                  <Row
                    label="Mutual top scores"
                    value={
                      relationship.mutualTopScores
                    }
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No voting data.
                </p>
              )}
            </Panel>
          </div>

          <Panel
            title="Placement timeline"
            description="SSC edition number is the historical axis. Lower placement is better."
          >
            {timeline.length ? (
              <div className="h-[280px]">
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <LineChart
                    data={
                      timeline
                    }
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--border)"
                    />

                    <XAxis
                      dataKey="label"
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
                      dataKey="a"
                      name={
                        countryA.name
                      }
                      stroke={
                        countryA.accent_color
                      }
                      strokeWidth={
                        3
                      }
                      connectNulls
                      dot
                    />

                    <Line
                      type="monotone"
                      dataKey="b"
                      name={
                        countryB.name
                      }
                      stroke={
                        countryB.accent_color
                      }
                      strokeWidth={
                        3
                      }
                      connectNulls
                      dot
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No placement timeline available.
              </p>
            )}
          </Panel>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/countries/$code"
              params={{
                code:
                  countryA.short_code,
              }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            >
              {countryA.name} profile
            </Link>

            <Link
              to="/countries/$code"
              params={{
                code:
                  countryB.short_code,
              }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            >
              {countryB.name} profile
            </Link>

            <Link
              to="/relationships/$pair"
              params={{
                pair:
                  `${countryA.short_code}-vs-${countryB.short_code}`.toUpperCase(),
              }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-xs"
            >
              Relationship page
            </Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function CountryPicker({
  label,
  value,
  countries,
  onChange,
}: {
  label: string;

  value?:
    string;

  countries:
    Array<{
      id: string;
      name: string;
      short_code: string;
    }>;

  onChange: (
    code: string,
  ) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>

      <select
        value={
          value ??
          ""
        }
        onChange={(
          event,
        ) =>
          onChange(
            event.target.value,
          )
        }
        className="min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      >
        <option value="">
          Choose country
        </option>

        {countries
          .slice()
          .sort(
            (a, b) =>
              a.name.localeCompare(
                b.name,
              ),
          )
          .map(
            (country) => (
              <option
                key={
                  country.id
                }
                value={
                  country.short_code
                }
              >
                {
                  country.name
                }
              </option>
            ),
          )}
      </select>
    </label>
  );
}

function CountryHead({
  country,
  align = "left",
}: {
  country: any;

  align?:
    | "left"
    | "right";
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 ${
        align ===
        "right"
          ? "flex-row-reverse text-right"
          : ""
      }`}
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
        size="md"
      />

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">
          {
            country.name
          }
        </p>

        <p className="text-[11px] text-muted-foreground">
          {
            country.short_code
          }
        </p>
      </div>
    </div>
  );
}

function CompareRow({
  label,
  a,
  b,
}: {
  label: string;

  a:
    | string
    | number;

  b:
    | string
    | number;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="numeric text-left text-sm font-semibold">
        {a}
      </span>

      <span className="text-center text-xs text-muted-foreground">
        {label}
      </span>

      <span className="numeric text-right text-sm font-semibold">
        {b}
      </span>
    </div>
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
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="text-sm text-muted-foreground">
        {label}
      </span>

      <span className="numeric text-sm font-semibold">
        {value}
      </span>
    </div>
  );
}
