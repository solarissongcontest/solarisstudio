"use client";

import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { motion } from "framer-motion";
import confetti from "canvas-confetti";

import { ScoreboardStage } from "@/components/ScoreboardStage";

import { computeStandings } from "@/lib/analysis";

import {
  matchVoterKey,
  resolveShowVoters,
  useAllContestEntities,
  useCountries,
  useJuryVotes,
  useShow,
  useShowParticipants,
  useShowVoters,
  useTelevotes,
  useThemes,
} from "@/lib/data";

import {
  backgroundStyle,
  resolveTheme,
  themeVars,
} from "@/lib/theme";

import { resolveVoting } from "@/lib/voting";

import {
  buildSteps,
  resolveBroadcast,
  SPEEDS,
  stepDuration,
} from "@/lib/broadcast";

import { cn } from "@/lib/utils";

import { entityDisplayMap } from "@/lib/entities";

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

export const Route = createFileRoute(
  "/broadcast/$showId",
)({
  head: () => ({
    meta: [
      {
        title:
          "Broadcast — Solaris Spectacle Suite",
      },
      {
        name: "description",
        content:
          "Full-screen animated results reveal with jury spokespersons, televote climb and winner celebration.",
      },
      {
        property: "og:title",
        content: "SSC broadcast",
      },
      {
        property: "og:description",
        content:
          "Watch the animated results reveal.",
      },
    ],
  }),

  component: BroadcastPage,
});

/* -------------------------------------------------------------------------- */
/* Broadcast                                                                  */
/* -------------------------------------------------------------------------- */

function BroadcastPage() {
  const { showId } = Route.useParams();

  /* ------------------------------------------------------------------------ */
  /* Data                                                                     */
  /* ------------------------------------------------------------------------ */

  const { data: show } =
    useShow(showId);

  const { data: participants } =
    useShowParticipants(showId);

  /**
   * IMPORTANT:
   *
   * Load the REAL configured voting entities.
   *
   * This includes:
   *
   * - participating countries
   * - external countries
   * - organisations
   * - people
   * - custom juries
   */
  const { data: voters } =
    useShowVoters(showId);

  const { data: jury } =
    useJuryVotes(showId);

  const { data: tele } =
    useTelevotes(showId);

  const { data: countries } =
    useCountries();

  const { data: entities } =
    useAllContestEntities();

  const { data: themes } =
    useThemes();

  /* ------------------------------------------------------------------------ */
  /* Theme                                                                    */
  /* ------------------------------------------------------------------------ */

  const theme = useMemo(
    () =>
      resolveTheme(
        (themes ?? []).find(
          (themeRow) =>
            themeRow.id === show?.theme_id,
        )?.config,
      ),
    [
      themes,
      show?.theme_id,
    ],
  );

  /* ------------------------------------------------------------------------ */
  /* Voting configuration                                                     */
  /* ------------------------------------------------------------------------ */

  const voting = useMemo(
    () =>
      resolveVoting(
        show?.voting_config,
      ),
    [show?.voting_config],
  );

  const baseCast = useMemo(
    () =>
      resolveBroadcast(
        show?.broadcast_config,
      ),
    [show?.broadcast_config],
  );

  /* ------------------------------------------------------------------------ */
  /* Playback state                                                           */
  /* ------------------------------------------------------------------------ */

  const [
    speed,
    setSpeed,
  ] = useState(1);

  const cast = useMemo(
    () => ({
      ...baseCast,
      speed,
    }),
    [
      baseCast,
      speed,
    ],
  );

  const [
    i,
    setI,
  ] = useState(0);

  const [
    playing,
    setPlaying,
  ] = useState(false);

  const timer =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  /* ------------------------------------------------------------------------ */
  /* Participants                                                             */
  /* ------------------------------------------------------------------------ */

  /**
   * Resolves both global countries
   * and edition-only custom nations.
   */
  const countryMap = useMemo(
    () =>
      entityDisplayMap(
        entities,
        countries,
      ),
    [
      entities,
      countries,
    ],
  );

  const participantMap = useMemo(
    () =>
      new Map(
        (participants ?? []).map(
          (participant) => [
            participant.country_id,
            participant,
          ],
        ),
      ),
    [participants],
  );

  const ids = useMemo(
    () =>
      (participants ?? []).map(
        (participant) =>
          participant.country_id,
      ),
    [participants],
  );

  /* ------------------------------------------------------------------------ */
  /* Broadcast voters                                                         */
  /* ------------------------------------------------------------------------ */

  /**
   * This is the important fix.
   *
   * If configured voter rows exist,
   * they become the broadcast voting entities.
   *
   * Only old shows with NO voter rows fall
   * back to participating countries.
   */
  const voterOptions = useMemo(
    () =>
      resolveShowVoters(
        voters,
        ids,
        countries ?? [],
      ),
    [
      voters,
      ids,
      countries,
    ],
  );

  /**
   * Canonical map:
   *
   * v:<voterId> -> voter presentation
   *
   * or legacy:
   *
   * c:<countryId> -> voter presentation
   */
  const voterMap = useMemo(
    () =>
      new Map(
        voterOptions.map(
          (voter) => [
            voter.key,
            voter,
          ],
        ),
      ),
    [voterOptions],
  );

  /* ------------------------------------------------------------------------ */
  /* Voting order                                                             */
  /* ------------------------------------------------------------------------ */

  /**
   * Existing saved votingOrder values may contain:
   *
   * - voter keys
   * - raw voter ids
   * - raw country ids
   * - legacy c:<countryId> values
   *
   * Normalise all of those here.
   */
  const juryOrder =
    useMemo(() => {
      const aliases =
        new Map<
          string,
          string
        >();

      voterOptions.forEach(
        (voter) => {
          /**
           * Canonical key.
           */
          aliases.set(
            voter.key,
            voter.key,
          );

          /**
           * Registered voter aliases.
           */
          if (voter.voterId) {
            aliases.set(
              voter.voterId,
              voter.key,
            );

            aliases.set(
              `v:${voter.voterId}`,
              voter.key,
            );
          }

          /**
           * Country / entity aliases.
           */
          if (voter.countryId) {
            aliases.set(
              voter.countryId,
              voter.key,
            );

            aliases.set(
              `c:${voter.countryId}`,
              voter.key,
            );
          }
        },
      );

      const order: string[] =
        [];

      const seen =
        new Set<string>();

      const add = (
        key:
          | string
          | undefined,
      ) => {
        if (!key) {
          return;
        }

        if (
          seen.has(key)
        ) {
          return;
        }

        seen.add(key);

        order.push(key);
      };

      /**
       * First preserve the manually saved voting order.
       */
      for (
        const saved of
        voting.votingOrder
      ) {
        add(
          aliases.get(
            saved,
          ),
        );
      }

      /**
       * Then append any newly-created show voter
       * that wasn't part of the saved order yet.
       *
       * voterOptions already follows voter sort_order.
       */
      voterOptions.forEach(
        (voter) => {
          add(
            voter.key,
          );
        },
      );

      return order;
    }, [
      voterOptions,
      voting.votingOrder,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Jury totals                                                              */
  /* ------------------------------------------------------------------------ */

  const juryTotals = useMemo(
    () => {
      const totals =
        new Map<
          string,
          number
        >();

      (jury ?? []).forEach(
        (vote) => {
          totals.set(
            vote.receiving_country_id,
            (totals.get(
              vote.receiving_country_id,
            ) ?? 0) +
              vote.points,
          );
        },
      );

      return totals;
    },
    [jury],
  );

  /* ------------------------------------------------------------------------ */
  /* Broadcast steps                                                          */
  /* ------------------------------------------------------------------------ */

  const steps = useMemo(
    () =>
      buildSteps(
        cast,
        voting,
        jury ?? [],
        tele ?? [],

        /**
         * IMPORTANT:
         *
         * Use actual show voters,
         * NOT participant ids.
         */
        juryOrder,

        juryTotals,

        theme.reveal
          .juryPresentation,

        /**
         * Use the same canonical voter resolver
         * as Fast Jury Entry and the Studio.
         */
        (vote) =>
          matchVoterKey(
            vote,
            voterOptions,
          ),
      ),
    [
      cast,
      voting,
      jury,
      tele,
      juryOrder,
      juryTotals,
      theme.reveal
        .juryPresentation,
      voterOptions,
    ],
  );

  const step =
    steps[i];

  /* ------------------------------------------------------------------------ */
  /* Playback timer                                                           */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (
      !playing ||
      !step
    ) {
      return;
    }

    timer.current =
      setTimeout(
        () => {
          setI(
            (current) =>
              Math.min(
                current + 1,
                steps.length - 1,
              ),
          );
        },

        stepDuration(
          step,
          cast,
        ),
      );

    return () => {
      if (
        timer.current
      ) {
        clearTimeout(
          timer.current,
        );
      }
    };
  }, [
    playing,
    step,
    steps.length,
    cast,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Votes applied so far                                                     */
  /* ------------------------------------------------------------------------ */

  const applied =
    useMemo(() => {
      const juryApplied:
        NonNullable<
          typeof jury
        > = [];

      const teleApplied:
        NonNullable<
          typeof tele
        > = [];

      for (
        let k = 0;
        k <= i &&
        k < steps.length;
        k++
      ) {
        const currentStep =
          steps[k];

        /* ------------------------------------------------------------------ */
        /* Individual jury point                                               */
        /* ------------------------------------------------------------------ */

        if (
          currentStep.kind ===
          "jury-point"
        ) {
          const voterIdentity =
            voterMap.get(
              currentStep.voter,
            );

          juryApplied.push({
            id: `${k}`,
            edition_id: "",
            show_id: showId,

            /**
             * Preserve the canonical voter row
             * where one exists.
             */
            voter_id:
              voterIdentity?.voterId ??
              null,

            /**
             * This value is irrelevant to standings,
             * but keeping the country/entity identity
             * makes the temporary vote structurally valid.
             */
            voter_country_id:
              voterIdentity
                ?.countryId ??
              "",

            receiving_country_id:
              currentStep.to,

            points:
              currentStep.points,
          });
        }

        /* ------------------------------------------------------------------ */
        /* Batch jury points                                                   */
        /* ------------------------------------------------------------------ */

        if (
          currentStep.kind ===
          "jury-batch"
        ) {
          const voterIdentity =
            voterMap.get(
              currentStep.voter,
            );

          currentStep.entries.forEach(
            (
              entry,
              entryIndex,
            ) => {
              juryApplied.push({
                id: `${k}-${entryIndex}`,
                edition_id: "",
                show_id: showId,

                voter_id:
                  voterIdentity
                    ?.voterId ??
                  null,

                voter_country_id:
                  voterIdentity
                    ?.countryId ??
                  "",

                receiving_country_id:
                  entry.to,

                points:
                  entry.points,
              });
            },
          );
        }

        /* ------------------------------------------------------------------ */
        /* Televote                                                            */
        /* ------------------------------------------------------------------ */

        if (
          currentStep.kind ===
          "televote"
        ) {
          teleApplied.push({
            id: `t${k}`,
            edition_id: "",
            show_id: showId,

            country_id:
              currentStep.to,

            points:
              currentStep.points,
          });
        }
      }

      return {
        juryApplied,
        teleApplied,
      };
    }, [
      i,
      steps,
      showId,
      voterMap,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Standings                                                                */
  /* ------------------------------------------------------------------------ */

  const standings =
    computeStandings(
      ids,
      applied.juryApplied,
      applied.teleApplied,
      voting,
    );

  /* ------------------------------------------------------------------------ */
  /* Currently awarded points                                                 */
  /* ------------------------------------------------------------------------ */

  const awarded:
    Record<
      string,
      number
    > = {};

  if (
    step?.kind ===
    "jury-point"
  ) {
    awarded[
      step.to
    ] = step.points;
  }

  if (
    step?.kind ===
    "jury-batch"
  ) {
    step.entries.forEach(
      (entry) => {
        awarded[
          entry.to
        ] =
          entry.points;
      },
    );
  }

  if (
    step?.kind ===
    "televote"
  ) {
    awarded[
      step.to
    ] = step.points;
  }

  /* ------------------------------------------------------------------------ */
  /* Winner effect                                                            */
  /* ------------------------------------------------------------------------ */

  const isWinnerStep =
    step?.kind ===
    "winner";

  useEffect(() => {
    if (
      isWinnerStep &&
      cast.effects.winner !==
        "none"
    ) {
      confetti({
        particleCount: 180,
        spread: 100,
        origin: {
          y: 0.6,
        },
      });
    }
  }, [
    isWinnerStep,
    cast.effects.winner,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Missing show                                                             */
  /* ------------------------------------------------------------------------ */

  if (!show) {
    return (
      <div className="grid min-h-screen place-items-center">
        <p className="text-sm text-muted-foreground">
          This show is private
          or unavailable.
        </p>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Winner                                                                   */
  /* ------------------------------------------------------------------------ */

  const winner =
    standings[0]
      ? countryMap.get(
          standings[0]
            .countryId,
        )
      : null;

  /* ------------------------------------------------------------------------ */
  /* Current voting entity                                                    */
  /* ------------------------------------------------------------------------ */

  /**
   * IMPORTANT:
   *
   * Previously this used:
   *
   * countryMap.get(step.voter)
   *
   * That meant organisations,
   * people and external voters
   * could never resolve.
   *
   * It now uses voterMap.
   */
  const voter =
    step?.kind ===
      "jury-intro" ||
    step?.kind ===
      "jury-point" ||
    step?.kind ===
      "jury-batch"
      ? voterMap.get(
          step.voter,
        ) ?? null
      : null;

  /* ------------------------------------------------------------------------ */
  /* UI                                                                       */
  /* ------------------------------------------------------------------------ */

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{
        ...backgroundStyle(
          theme,
        ),
        ...themeVars(
          theme,
        ),
      }}
    >
      {/* Background overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: `rgba(0,0,0,${theme.background.overlay})`,
        }}
      />

      <div className="relative mx-auto max-w-6xl px-4 py-6">
        {/* -------------------------------------------------------------- */}
        {/* Controls                                                       */}
        {/* -------------------------------------------------------------- */}

        <header
          className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3"
          style={{
            background:
              "var(--t-header-bg)",
            color:
              "var(--t-header-text)",
          }}
        >
          <Link
            to="/shows/$showId"
            params={{
              showId,
            }}
            className="text-xs opacity-70 hover:opacity-100"
          >
            ← Back to show
          </Link>

          <h1
            className="font-display text-lg font-bold"
            style={{
              fontFamily:
                "var(--t-font-display)",
            }}
          >
            {show.name}
          </h1>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                setPlaying(
                  (current) =>
                    !current,
                )
              }
              className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium backdrop-blur"
            >
              {playing
                ? "Pause"
                : "Play"}
            </button>

            <button
              onClick={() =>
                setI(
                  (current) =>
                    Math.max(
                      0,
                      current - 1,
                    ),
                )
              }
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs"
            >
              Prev
            </button>

            <button
              onClick={() =>
                setI(
                  (current) =>
                    Math.min(
                      steps.length -
                        1,
                      current + 1,
                    ),
                )
              }
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs"
            >
              Next
            </button>

            <button
              onClick={() => {
                setI(0);
                setPlaying(
                  false,
                );
              }}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs"
            >
              Replay
            </button>

            <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
              {SPEEDS.map(
                (
                  speedOption,
                ) => (
                  <button
                    key={
                      speedOption
                    }
                    onClick={() =>
                      setSpeed(
                        speedOption,
                      )
                    }
                    className={cn(
                      "numeric rounded px-1.5 py-0.5 text-[10px]",

                      speed ===
                        speedOption &&
                        "bg-white/25",
                    )}
                  >
                    {
                      speedOption
                    }
                    ×
                  </button>
                ),
              )}
            </div>
          </div>
        </header>

        {/* -------------------------------------------------------------- */}
        {/* Overall reveal progress                                        */}
        {/* -------------------------------------------------------------- */}

        <div
          className="mb-4 h-1 w-full overflow-hidden rounded-full"
          style={{
            background:
              "var(--t-progress-track)",
          }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${
                steps.length
                  ? ((i + 1) /
                      steps.length) *
                    100
                  : 0
              }%`,

              background:
                "var(--t-progress-fill)",
            }}
          />
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Opening                                                        */}
        {/* -------------------------------------------------------------- */}

        {step?.kind ===
          "opening" && (
          <Splash
            title={
              cast.openingTitle ||
              show.name
            }
            subtitle={
              cast.openingSubtitle ||
              "Good evening, Terra Solaris!"
            }
          />
        )}

        {/* -------------------------------------------------------------- */}
        {/* Credits                                                        */}
        {/* -------------------------------------------------------------- */}

        {step?.kind ===
          "credits" && (
          <Splash
            title="Thank you"
            subtitle={
              cast.creditsText
            }
          />
        )}

        {/* -------------------------------------------------------------- */}
        {/* Winner                                                         */}
        {/* -------------------------------------------------------------- */}

        {isWinnerStep &&
          winner && (
            <Splash
              title={
                winner.name
              }
              subtitle={`Winner with ${standings[0].total} points`}
            />
          )}

        {/* -------------------------------------------------------------- */}
        {/* Main results scenes                                            */}
        {/* -------------------------------------------------------------- */}

        {![
          "opening",
          "credits",
          "winner",
        ].includes(
          step?.kind ?? "",
        ) && (
          <>
            {/* ---------------------------------------------------------- */}
            {/* Current jury / spokesperson                                */}
            {/* ---------------------------------------------------------- */}

            {voter &&
              cast.spokesperson
                .show && (
                <motion.div
                  key={
                    voter.key
                  }
                  initial={{
                    opacity: 0,
                    y: -12,
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                  }}
                  className="mb-4 flex items-center gap-3 rounded-2xl px-4 py-3 backdrop-blur"
                  style={{
                    background:
                      "var(--t-spokesperson-bg)",

                    color:
                      "var(--t-spokesperson-text)",
                  }}
                >
                  {voter.flag_image ? (
                    <img
                      src={
                        voter.flag_image
                      }
                      alt={
                        voter.name
                      }
                      className="h-10 w-15 rounded object-cover"
                    />
                  ) : (
                    /**
                     * Deliberate fallback for:
                     *
                     * - organisations
                     * - people
                     * - custom juries
                     * - missing flags
                     */
                    <div
                      className="grid h-10 w-15 place-items-center rounded text-xs font-bold"
                      style={{
                        background:
                          voter.accent_color ||
                          "rgba(255,255,255,.15)",
                      }}
                    >
                      {(
                        voter.short_code ??
                        voter.name
                      )
                        .slice(
                          0,
                          3,
                        )
                        .toUpperCase()}
                    </div>
                  )}

                  <div>
                    <p
                      className="text-[11px] uppercase tracking-widest"
                      style={{
                        color:
                          "var(--t-spokesperson-accent)",

                        opacity:
                          0.9,
                      }}
                    >
                      Now voting
                    </p>

                    <p className="font-display text-lg font-bold">
                      {
                        voter.name
                      }
                    </p>
                  </div>
                </motion.div>
              )}

            {/* ---------------------------------------------------------- */}
            {/* Televote introduction                                      */}
            {/* ---------------------------------------------------------- */}

            {step?.kind ===
              "televote-intro" && (
              <p className="mb-4 text-center font-display text-xl font-bold">
                And now… the
                televote!
              </p>
            )}

            {/* ---------------------------------------------------------- */}
            {/* Scoreboard                                                 */}
            {/* ---------------------------------------------------------- */}

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
              awarded={
                awarded
              }
              /**
               * Only highlight a country on the board
               * if this voter actually corresponds to
               * one.
               *
               * Organisations and people therefore
               * don't incorrectly highlight a contestant.
               */
              votingCountryId={
                voter?.countryId ??
                null
              }
              qualifiers={
                show.qualifier_count
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Splash                                                                     */
/* -------------------------------------------------------------------------- */

function Splash({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <motion.div
      initial={{
        opacity: 0,
        scale: 0.95,
      }}
      animate={{
        opacity: 1,
        scale: 1,
      }}
      className="grid min-h-[60vh] place-items-center text-center"
    >
      <div>
        <h2
          className="font-display text-5xl font-black"
          style={{
            fontFamily:
              "var(--t-font-display)",
          }}
        >
          {title}
        </h2>

        <p className="mt-3 text-lg opacity-75">
          {subtitle}
        </p>
      </div>
    </motion.div>
  );
}
