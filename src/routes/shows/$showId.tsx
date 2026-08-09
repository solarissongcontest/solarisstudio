import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";
import {
  useMemo,
  useState,
} from "react";

import {
  AppShell,
  PageHeader,
  Panel,
  StatTile,
} from "@/components/AppShell";

import {
  JuryTelevoteComparison,
} from "@/components/JuryTelevoteComparison";

import {
  RadialPointsView,
} from "@/components/RadialPointsView";

import {
  ResponsiveTabs,
} from "@/components/ResponsiveTabs";

import {
  ScoreboardStage,
} from "@/components/ScoreboardStage";

import {
  VotingMatrix,
} from "@/components/VotingMatrix";

import {
  computeStandings,
} from "@/lib/analysis";

import {
  useCountries,
  useJuryVotes,
  useShow,
  useShowParticipants,
  useShowVoters,
  useTelevotes,
  useThemes,
} from "@/lib/data";

import {
  resolveTheme,
} from "@/lib/theme";

import {
  resolveVoting,
} from "@/lib/voting";

export const Route =
  createFileRoute(
    "/shows/$showId",
  )({
    head: () => ({
      meta: [
        {
          title:
            "Show results — Solaris Studio",
        },
      ],
    }),

    component:
      ShowPage,
  });

const TABS = [
  {
    value:
      "scoreboard",
    label:
      "Scoreboard",
  },

  {
    value:
      "points",
    label:
      "Points",
  },

  {
    value:
      "split",
    label:
      "Jury / Tele",
  },

  {
    value:
      "matrix",
    label:
      "Matrix",
  },

  {
    value:
      "lineup",
    label:
      "Line-up",
  },
] as const;

type Tab =
  (typeof TABS)[number]["value"];

function ShowPage() {
  const {
    showId,
  } =
    Route.useParams();

  const {
    data: show,
    isLoading,
  } =
    useShow(
      showId,
    );

  const {
    data:
      participants,
  } =
    useShowParticipants(
      showId,
    );

  const {
    data: jury,
  } =
    useJuryVotes(
      showId,
    );

  const {
    data: tele,
  } =
    useTelevotes(
      showId,
    );

  const {
    data: voters,
  } =
    useShowVoters(
      showId,
    );

  const {
    data:
      countries,
  } =
    useCountries();

  const {
    data: themes,
  } =
    useThemes();

  const [
    tab,
    setTab,
  ] =
    useState<Tab>(
      "scoreboard",
    );

  /* =========================================================
     THEME
     ========================================================= */

  const theme =
    useMemo(
      () =>
        resolveTheme(
          (
            themes ??
            []
          ).find(
            (item) =>
              item.id ===
              show?.theme_id,
          )?.config,
        ),
      [
        themes,
        show?.theme_id,
      ],
    );

  /* =========================================================
     VOTING CONFIG
     ========================================================= */

  const voting =
    useMemo(
      () =>
        resolveVoting(
          show?.voting_config,
        ),
      [
        show?.voting_config,
      ],
    );

  /* =========================================================
     COUNTRY / PARTICIPANT MAPS
     ========================================================= */

  const countryMap =
    new Map(
      (
        countries ??
        []
      ).map(
        (
          country,
        ) => [
          country.id,
          country,
        ],
      ),
    );

  const participantMap =
    new Map(
      (
        participants ??
        []
      ).map(
        (
          participant,
        ) => [
          participant.country_id,
          participant,
        ],
      ),
    );

  const ids =
    (
      participants ??
      []
    ).map(
      (
        participant,
      ) =>
        participant.country_id,
    );

  /* =========================================================
     STANDINGS
     ========================================================= */

  const standings =
    computeStandings(
      ids,
      jury ??
        [],
      tele ??
        [],
      voting,
    );

  /* =========================================================
     LOADING
     ========================================================= */

  if (
    isLoading
  ) {
    return (
      <AppShell>
        <p
          className="
            text-sm
            text-muted-foreground
          "
        >
          Loading show…
        </p>
      </AppShell>
    );
  }

  /* =========================================================
     SHOW NOT FOUND
     ========================================================= */

  if (
    !show
  ) {
    return (
      <AppShell>
        <PageHeader
          title=
            "Show unavailable"
        />

        <Link
          to="/editions"
          className="
            text-sm
            text-primary
          "
        >
          ← Editions
        </Link>
      </AppShell>
    );
  }

  /* =========================================================
     WINNER
     ========================================================= */

  const winner =
    standings[0]
      ? countryMap.get(
          standings[0]
            .countryId,
        )
      : null;

  /* =========================================================
     TOTALS
     ========================================================= */

  const juryTotal =
    standings.reduce(
      (
        total,
        row,
      ) =>
        total +
        row.jury,
      0,
    );

  const televoteTotal =
    standings.reduce(
      (
        total,
        row,
      ) =>
        total +
        row.televote,
      0,
    );

  /* =========================================================
     PAGE
     ========================================================= */

  return (
    <AppShell>
      {/* =====================================================
          HEADER
         ===================================================== */}

      <PageHeader
        eyebrow={
          show.kind.replace(
            "-",
            " ",
          )
        }
        title={
          show.name
        }
        description={
          winner
            ? `${winner.name} won with ${standings[0].total} points.`
            : "Results are not available yet."
        }
        actions={
          <Link
            to="/broadcast/$showId"
            params={{
              showId:
                show.id,
            }}
            className="
              bg-aurora
              rounded-xl
              px-4
              py-2.5
              text-sm
              font-medium
              text-primary-foreground
            "
          >
            Watch broadcast
          </Link>
        }
      />

      {/* =====================================================
          SUMMARY
         ===================================================== */}

      <Panel
        className="
          mb-5
        "
      >
        <div
          className="
            grid
            grid-cols-3
            gap-5
          "
        >
          <StatTile
            label=
              "Entries"
            value={
              ids.length
            }
          />

          <StatTile
            label=
              "Jury points"
            value={
              juryTotal
            }
          />

          <StatTile
            label=
              "Televote points"
            value={
              televoteTotal
            }
          />
        </div>
      </Panel>

      {/* =====================================================
          TABS
         ===================================================== */}

      <ResponsiveTabs
        value={
          tab
        }
        options={
          TABS
        }
        onChange={
          setTab
        }
        label=
          "Show view"
        className=
          "mb-5"
      />

      {/* =====================================================
          SCOREBOARD
         ===================================================== */}

      {tab ===
        "scoreboard" && (
        <ScoreboardStage
          theme={
            theme
          }
          standings={
            standings
          }
          countries={
            countryMap
          }
          participants={
            participantMap
          }
          qualifiers={
            show.qualifier_count
          }
        />
      )}

      {/* =====================================================
          POINTS
         ===================================================== */}

      {tab ===
        "points" && (
        <RadialPointsView
          participants={
            participants ??
            []
          }
          countries={
            countryMap
          }
          jury={
            jury ??
            []
          }
          televote={
            tele ??
            []
          }
          voters={
            voters
          }
        />
      )}

      {/* =====================================================
          EXISTING JURY / TELE TAB
          Now redesigned visually.
         ===================================================== */}

      {tab ===
        "split" && (
        <JuryTelevoteComparison
          standings={
            standings
          }
          countries={
            countryMap
          }
        />
      )}

      {/* =====================================================
          MATRIX
         ===================================================== */}

      {tab ===
        "matrix" && (
        <Panel
          title=
            "Voting matrix"
          description=
            "Rows receive points, columns give them."
        >
          <VotingMatrix
            votes={
              jury ??
              []
            }
            countries={
              countryMap
            }
            order={
              ids
            }
            topPoint={
              voting
                .juryPoints[
                  0
                ] ??
              12
            }
            voters={
              voters
            }
          />
        </Panel>
      )}

      {/* =====================================================
          LINE-UP
         ===================================================== */}

      {tab ===
        "lineup" && (
        <Panel
          title=
            "Running order"
        >
          <div
            className="
              divide-y
              divide-border/60
            "
          >
            {(
              participants ??
              []
            ).map(
              (
                participant,
              ) => {
                const country =
                  countryMap.get(
                    participant.country_id,
                  );

                return (
                  <div
                    key={
                      participant.id
                    }
                    className="
                      grid
                      grid-cols-[32px_42px_1fr]
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
                        text-sm
                        text-muted-foreground
                      "
                    >
                      {participant.running_order ??
                        "—"}
                    </span>

                    {country?.flag_image ? (
                      <img
                        src={
                          country.flag_image
                        }
                        alt=""
                        className="
                          h-6
                          w-9
                          rounded
                          object-cover
                        "
                      />
                    ) : (
                      <div />
                    )}

                    <div
                      className="
                        min-w-0
                      "
                    >
                      <p
                        className="
                          truncate
                          text-sm
                          font-medium
                        "
                      >
                        {country?.name ??
                          "Unknown"}
                      </p>

                      {(
                        participant.artist ||
                        participant.song
                      ) && (
                        <p
                          className="
                            truncate
                            text-[11px]
                            text-muted-foreground
                          "
                        >
                          {[
                            participant.artist,
                            participant.song,
                          ]
                            .filter(
                              Boolean,
                            )
                            .join(
                              " · ",
                            )}
                        </p>
                      )}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </Panel>
      )}
    </AppShell>
  );
}
