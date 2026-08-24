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
import { archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";

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
  type Step,
} from "@/lib/broadcast";

import {
  resolveScoreboard,
  type BroadcastRowData,
} from "@/lib/scoreboard";

import { entityDisplayMap } from "@/lib/entities";

import {
  BroadcastControlDock,
  useControlDockState,
} from "@/components/broadcast/ControlDock";

import { ScoreboardBoard } from "@/components/broadcast/ScoreboardBoard";

import { YouTubeMusic } from "@/components/broadcast/YouTubeMusic";

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
          "Full-screen animated Solaris Song Contest results broadcast.",
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
/* Broadcast page                                                             */
/* -------------------------------------------------------------------------- */

function BroadcastPage() {
  const { showId } = Route.useParams();

  /* ------------------------------------------------------------------------ */
  /* Data                                                                     */
  /* ------------------------------------------------------------------------ */

  const showQuery = useShow(showId);
  const participantsQuery = useShowParticipants(showId);
  const votersQuery = useShowVoters(showId);
  const juryQuery = useJuryVotes(showId);
  const televoteQuery = useTelevotes(showId);
  const countriesQuery = useCountries();
  const entitiesQuery = useAllContestEntities();
  const themesQuery = useThemes();
  const { data: show } = showQuery;
  const { data: participants } = participantsQuery;
  const { data: voters } = votersQuery;
  const { data: jury } = juryQuery;
  const { data: tele } = televoteQuery;
  const { data: countries } = countriesQuery;
  const { data: entities } = entitiesQuery;
  const { data: themes } = themesQuery;

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
  /* Existing broadcast reveal config                                         */
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
  /* New scoreboard config                                                    */
  /* ------------------------------------------------------------------------ */

  /**
   * Reads broadcast_config.scoreboard when available.
   *
   * Old broadcasts automatically fall back to the default
   * scoreboard preset through resolveScoreboard().
   */
 const scoreboardConfig =
  useMemo(
    () =>
      resolveScoreboard(
        show?.broadcast_config,
        {
          theme,
          rowCount:
            participants?.length ??
            0,
        },
      ),
    [
      show?.broadcast_config,
      theme,
      participants?.length,
    ],
  );
  /* ------------------------------------------------------------------------ */
  /* Playback                                                                 */
  /* ------------------------------------------------------------------------ */

  const [
    speed,
    setSpeed,
  ] = useState(
    baseCast.speed || 1,
  );

  useEffect(() => {
    setSpeed(
      baseCast.speed || 1,
    );
  }, [baseCast.speed]);

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
    stepIndex,
    setStepIndex,
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
  /* Control dock                                                             */
  /* ------------------------------------------------------------------------ */

  const [
    dockState,
    updateDockState,
  ] = useControlDockState({
    mode:
      scoreboardConfig.controls
        .mode,

    position:
      scoreboardConfig.controls
        .position,

    cleanOutput:
      scoreboardConfig.controls
        .cleanOutput,
  });

  /* ------------------------------------------------------------------------ */
  /* Countries / entities                                                     */
  /* ------------------------------------------------------------------------ */

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

  const participantMap =
    useMemo(
      () =>
        new Map(
          (
            participants ?? []
          ).map(
            (participant) => [
              participant.country_id,
              participant,
            ],
          ),
        ),
      [participants],
    );

  const participantIds =
    useMemo(
      () =>
        (
          participants ?? []
        ).map(
          (participant) =>
            participant.country_id,
        ),
      [participants],
    );

  /* ------------------------------------------------------------------------ */
  /* Broadcast voters                                                         */
  /* ------------------------------------------------------------------------ */

  /**
   * Uses real show voters when they exist.
   *
   * This includes:
   *
   * - participating countries
   * - external countries
   * - organisations
   * - people
   * - custom voters
   *
   * Old shows with no voter rows fall back to participants.
   */
  const voterOptions =
    useMemo(
      () =>
        resolveShowVoters(
          voters,
          participantIds,
          countries ?? [],
        ),
      [
        voters,
        participantIds,
        countries,
      ],
    );

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
  /* Jury order                                                               */
  /* ------------------------------------------------------------------------ */

  const juryOrder =
    useMemo(() => {
      const aliases =
        new Map<
          string,
          string
        >();

      for (
        const voter of
        voterOptions
      ) {
        aliases.set(
          voter.key,
          voter.key,
        );

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
      }

      const result: string[] =
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
        result.push(key);
      };

      /**
       * Keep any manually-configured voting order.
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
       * Append voters missing from the saved order.
       */
      for (
        const voter of
        voterOptions
      ) {
        add(
          voter.key,
        );
      }

      return result;
    }, [
      voterOptions,
      voting.votingOrder,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Jury totals                                                              */
  /* ------------------------------------------------------------------------ */

  const juryTotals =
    useMemo(() => {
      const totals =
        new Map<
          string,
          number
        >();

      for (
        const vote of
        jury ?? []
      ) {
        totals.set(
          vote.receiving_country_id,

          (
            totals.get(
              vote.receiving_country_id,
            ) ?? 0
          ) + vote.points,
        );
      }

      return totals;
    }, [jury]);

  /* ------------------------------------------------------------------------ */
  /* Reveal steps                                                             */
  /* ------------------------------------------------------------------------ */

  const steps = useMemo(
    () =>
      buildSteps(
        cast,
        voting,
        jury ?? [],
        tele ?? [],
        juryOrder,
        juryTotals,
        theme.reveal
          .juryPresentation,

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

  /* ------------------------------------------------------------------------ */
  /* Clamp index if step list changes                                         */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (
      steps.length === 0
    ) {
      setStepIndex(0);
      return;
    }

    setStepIndex(
      (current) =>
        Math.min(
          current,
          steps.length - 1,
        ),
    );
  }, [steps.length]);

  const step =
    steps[stepIndex];

  /* ------------------------------------------------------------------------ */
  /* Auto play                                                                */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    if (
      !playing ||
      !step ||
      steps.length === 0
    ) {
      return;
    }

    timer.current =
      setTimeout(
        () => {
          setStepIndex(
            (current) => {
              const next =
                Math.min(
                  current + 1,
                  steps.length - 1,
                );

              /**
               * Stop playing when the final step is reached.
               */
              if (
                next ===
                steps.length - 1
              ) {
                setPlaying(
                  false,
                );
              }

              return next;
            },
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
  /* Applied votes up to current step                                         */
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
        let index = 0;
        index <= stepIndex &&
        index < steps.length;
        index += 1
      ) {
        const currentStep =
          steps[index];

        /* ------------------------------------------------------------------ */
        /* Jury point                                                         */
        /* ------------------------------------------------------------------ */

        if (
          currentStep.kind ===
          "jury-point"
        ) {
          const voter =
            voterMap.get(
              currentStep.voter,
            );

          juryApplied.push({
            id: `broadcast-jury-${index}`,
            edition_id:
              show?.edition_id ??
              "",
            show_id: showId,

            voter_id:
              voter?.voterId ??
              null,

            voter_country_id:
              voter?.countryId ??
              "",

            receiving_country_id:
              currentStep.to,

            points:
              currentStep.points,
          });
        }

        /* ------------------------------------------------------------------ */
        /* Jury batch                                                         */
        /* ------------------------------------------------------------------ */

        if (
          currentStep.kind ===
          "jury-batch"
        ) {
          const voter =
            voterMap.get(
              currentStep.voter,
            );

          currentStep.entries.forEach(
            (
              entry,
              entryIndex,
            ) => {
              juryApplied.push({
                id: `broadcast-jury-${index}-${entryIndex}`,
                edition_id:
                  show?.edition_id ??
                  "",
                show_id:
                  showId,

                voter_id:
                  voter?.voterId ??
                  null,

                voter_country_id:
                  voter?.countryId ??
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
        /* Televote                                                           */
        /* ------------------------------------------------------------------ */

        if (
          currentStep.kind ===
          "televote"
        ) {
          teleApplied.push({
            id: `broadcast-tele-${index}`,
            edition_id:
              show?.edition_id ??
              "",
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
      stepIndex,
      steps,
      voterMap,
      showId,
      show?.edition_id,
    ]);

  /* ------------------------------------------------------------------------ */
  /* Current standings                                                        */
  /* ------------------------------------------------------------------------ */

  const standings =
    useMemo(
      () =>
        computeStandings(
          participantIds,
          applied.juryApplied,
          applied.teleApplied,
          voting,
        ),
      [
        participantIds,
        applied,
        voting,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Current point award                                                      */
  /* ------------------------------------------------------------------------ */

  const awarded =
    useMemo(() => {
      const result:
        Record<
          string,
          number
        > = {};

      if (
        step?.kind ===
        "jury-point"
      ) {
        result[
          step.to
        ] = step.points;
      }

      if (
        step?.kind ===
        "jury-batch"
      ) {
        for (
          const entry of
          step.entries
        ) {
          result[
            entry.to
          ] = entry.points;
        }
      }

      if (
        step?.kind ===
        "televote"
      ) {
        result[
          step.to
        ] = step.points;
      }

      return result;
    }, [step]);

  /* ------------------------------------------------------------------------ */
  /* Current voter                                                            */
  /* ------------------------------------------------------------------------ */

  const currentVoter =
    step &&
    (
      step.kind ===
        "jury-intro" ||
      step.kind ===
        "jury-point" ||
      step.kind ===
        "jury-batch"
    )
      ? voterMap.get(
          step.voter,
        ) ?? null
      : null;

  /* ------------------------------------------------------------------------ */
  /* Convert standings into new BroadcastRowData                              */
  /* ------------------------------------------------------------------------ */

  const rows:
    BroadcastRowData[] =
    useMemo(
      () =>
        standings.map(
          (
            standing,
            index,
          ) => {
            const display =
              countryMap.get(
                standing.countryId,
              );

            const participant =
              participantMap.get(
                standing.countryId,
              );

            const isAwarded =
              awarded[
                standing.countryId
              ] != null;

            const isVotingCountry =
              currentVoter?.countryId ===
              standing.countryId;

            const qualified =
              participant?.qualified ??
              null;

            return {
              id:
                standing.countryId,

              entityType:
                display?.entityType ??
                "global",

              name:
                display?.name ??
                standing.countryId,

              abbreviation:
                display?.short_code ??
                "",

              flagImage:
                display?.flag_image ??
                null,

              accent:
                display?.accent_color ??
                theme.colors.accent,

              rank:
                standing.rank,

              runningOrder:
                participant?.running_order ??
                null,

              score:
                standing.total,

              juryScore:
                standing.jury,

              televoteScore:
                standing.televote,

              movement:
                null,

              qualified,

              eliminated:
                qualified === false
                  ? true
                  : qualified === true
                    ? false
                    : null,

              active:
                isVotingCountry,

              highlighted:
                isAwarded,

              leader:
                index === 0,

              winner:
                step?.kind ===
                  "winner" &&
                index === 0,

              subtitle:
                participant?.artist &&
                participant?.song
                  ? `${participant.artist} — ${participant.song}`
                  : participant?.artist ??
                    participant?.song ??
                    null,
            };
          },
        ),
      [
        standings,
        countryMap,
        participantMap,
        awarded,
        currentVoter,
        step,
        theme.colors.accent,
      ],
    );

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
  /* Winner effect                                                            */
  /* ------------------------------------------------------------------------ */

  const isWinnerStep =
    step?.kind ===
    "winner";

  useEffect(() => {
    if (
      !isWinnerStep
    ) {
      return;
    }

    if (
      cast.effects.winner ===
      "none"
    ) {
      return;
    }

    confetti({
      particleCount: 180,
      spread: 100,
      origin: {
        y: 0.6,
      },
    });
  }, [
    isWinnerStep,
    cast.effects.winner,
  ]);

  /* ------------------------------------------------------------------------ */
  /* Progress                                                                 */
  /* ------------------------------------------------------------------------ */

  const progress =
    steps.length > 0
      ? (
          stepIndex + 1
        ) / steps.length
      : 0;

  /* ------------------------------------------------------------------------ */
  /* Scene label                                                              */
  /* ------------------------------------------------------------------------ */

  const stepLabel =
    useMemo(
      () =>
        getStepLabel(
          step,
          currentVoter?.name,
        ),
      [
        step,
        currentVoter?.name,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Dynamic scene title                                                      */
  /* ------------------------------------------------------------------------ */

  const sceneTitle =
    useMemo(
      () =>
        getSceneTitle(
          step,
          show?.name ??
            "",
        ),
      [
        step,
        show?.name,
      ],
    );

  const sceneSubtitle =
    useMemo(
      () =>
        getSceneSubtitle(
          step,
          currentVoter?.name,
          standings[0]
            ?.total,
        ),
      [
        step,
        currentVoter?.name,
        standings,
      ],
    );

  /* ------------------------------------------------------------------------ */
  /* Current voter side-panel content                                         */
  /* ------------------------------------------------------------------------ */

  const panelContent =
    currentVoter ? (
      <CurrentVoterPanel
        voter={
          currentVoter
        }
      />
    ) : step?.kind ===
      "televote-intro" ? (
      <div className="grid h-full place-items-center text-center">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] opacity-60">
            Up next
          </p>

          <p className="mt-2 text-2xl font-bold">
            Televote
          </p>
        </div>
      </div>
    ) : null;

  /* ------------------------------------------------------------------------ */
  /* Loading / missing show                                                   */
  /* ------------------------------------------------------------------------ */

  const broadcastQueries = [showQuery, participantsQuery, votersQuery, juryQuery, televoteQuery, countriesQuery, entitiesQuery, themesQuery];
  if (archiveIsLoading(...broadcastQueries)) {
    return <div className="grid min-h-screen place-items-center bg-black text-white"><p className="text-sm text-white/60">Loading broadcast…</p></div>;
  }
  if (archiveHasError(...broadcastQueries)) {
    return <div className="grid min-h-screen place-items-center bg-black px-6 text-center text-white"><p className="text-sm text-red-200">The broadcast data could not be loaded. Refresh the page to try again.</p></div>;
  }

  if (!show) {
    return (
      <div className="grid min-h-screen place-items-center bg-black text-white">
        <p className="text-sm text-white/60">
          This show is private
          or unavailable.
        </p>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Opening                                                                  */
  /* ------------------------------------------------------------------------ */

  const showOpening =
    step?.kind ===
    "opening";

  const showCredits =
    step?.kind ===
    "credits";

  const showWinner =
    step?.kind ===
      "winner" &&
    winner;

  /* ------------------------------------------------------------------------ */
  /* Render                                                                   */
  /* ------------------------------------------------------------------------ */

  return (
    <main
      className="relative h-screen w-screen overflow-hidden"
      style={{
        background:
          dockState.cleanOutput &&
          scoreboardConfig.background
            .type ===
            "transparent"
            ? "transparent"
            : undefined,
      }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* YouTube background music                                            */}
      {/* ------------------------------------------------------------------ */}

      <YouTubeMusic
        music={
          scoreboardConfig.music
        }
        playing={
          playing
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* Opening splash                                                     */}
      {/* ------------------------------------------------------------------ */}

      {showOpening && (
        <LegacySplash
          title={
            cast.openingTitle ||
            show.name
          }
          subtitle={
            cast.openingSubtitle ||
            "Good evening, Terra Solaris!"
          }
          theme={theme}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Credits splash                                                     */}
      {/* ------------------------------------------------------------------ */}

      {showCredits && (
        <LegacySplash
          title="Thank you"
          subtitle={
            cast.creditsText
          }
          theme={theme}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Winner splash                                                      */}
      {/* ------------------------------------------------------------------ */}

      {showWinner && (
        <LegacySplash
          title={
            winner.name
          }
          subtitle={`Winner with ${standings[0]?.total ?? 0} points`}
          theme={theme}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* New scoreboard renderer                                            */}
      {/* ------------------------------------------------------------------ */}

      {!showOpening &&
        !showCredits &&
        !showWinner && (
          <div className="absolute inset-0">
            <ScoreboardBoard
              config={
                scoreboardConfig
              }
              theme={
                theme
              }
              rows={
                rows
              }
              awarded={
                awarded
              }
              title={
                sceneTitle
              }
              subtitle={
                sceneSubtitle
              }
              progress={
                progress
              }
              panelContent={
                panelContent
              }
              animate={
                true
              }
            />
          </div>
        )}

      {/* ------------------------------------------------------------------ */}
      {/* Small back button                                                   */}
      {/* ------------------------------------------------------------------ */}

      {!dockState.cleanOutput &&
        dockState.mode !==
          "hidden" && (
          <Link
            to="/shows/$showId"
            params={{
              showId,
            }}
            className="fixed left-3 top-3 z-40 rounded-lg bg-black/35 px-2.5 py-1.5 text-[10px] text-white/50 backdrop-blur transition hover:bg-black/55 hover:text-white"
          >
            ← Show
          </Link>
        )}

      {/* ------------------------------------------------------------------ */}
      {/* New compact control dock                                            */}
      {/* ------------------------------------------------------------------ */}

      {!dockState.cleanOutput && (
        <BroadcastControlDock
          state={
            dockState
          }
          onChange={
            updateDockState
          }
          playing={
            playing
          }
          onTogglePlay={() =>
            setPlaying(
              (current) =>
                !current,
            )
          }
          onPrev={() => {
            setPlaying(
              false,
            );

            setStepIndex(
              (current) =>
                Math.max(
                  0,
                  current - 1,
                ),
            );
          }}
          onNext={() => {
            setPlaying(
              false,
            );

            setStepIndex(
              (current) =>
                Math.min(
                  Math.max(
                    0,
                    steps.length - 1,
                  ),
                  current + 1,
                ),
            );
          }}
          onReplay={() => {
            setPlaying(
              false,
            );

            setStepIndex(
              0,
            );
          }}
          onJump={(
            index,
          ) => {
            setPlaying(
              false,
            );

            setStepIndex(
              Math.max(
                0,
                Math.min(
                  index,
                  Math.max(
                    0,
                    steps.length - 1,
                  ),
                ),
              ),
            );
          }}
          speed={
            speed
          }
          speeds={
            SPEEDS
          }
          onSpeed={
            setSpeed
          }
          stepIndex={
            stepIndex
          }
          stepCount={
            steps.length
          }
          stepLabel={
            stepLabel
          }
          extra={
            <div className="flex items-center justify-between gap-4">
              <span className="text-[10px] text-white/45">
                {voterOptions.length} juries
              </span>

              <span className="text-[10px] text-white/45">
                {participants?.length ??
                  0} entries
              </span>
            </div>
          }
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Clean output recovery button                                        */}
      {/* ------------------------------------------------------------------ */}

      {dockState.cleanOutput && (
        <button
          type="button"
          onClick={() =>
            updateDockState({
              cleanOutput:
                false,
              mode:
                "compact",
            })
          }
          className="fixed bottom-1 right-1 z-50 h-3 w-3 rounded-full bg-white opacity-0 transition hover:opacity-20 focus:opacity-40"
          aria-label="Exit clean broadcast output"
          title="Exit clean output"
        />
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Current voter panel                                                        */
/* -------------------------------------------------------------------------- */

function CurrentVoterPanel({
  voter,
}: {
  voter: {
    key: string;
    name: string;
    short_code:
      | string
      | null;
    flag_image:
      | string
      | null;
    accent_color:
      string;
  };
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      {voter.flag_image ? (
        <img
          src={
            voter.flag_image
          }
          alt={
            voter.name
          }
          className="mb-4 max-h-40 w-full rounded-xl object-cover"
        />
      ) : (
        <div
          className="mb-4 grid aspect-[3/2] w-full max-w-56 place-items-center rounded-xl text-3xl font-black"
          style={{
            background:
              voter.accent_color,
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

      <p className="text-[10px] uppercase tracking-[0.3em] opacity-50">
        Now voting
      </p>

      <p className="mt-2 text-xl font-bold">
        {voter.name}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Scene helpers                                                              */
/* -------------------------------------------------------------------------- */

function getStepLabel(
  step:
    | Step
    | undefined,
  voterName?:
    | string
    | null,
) {
  if (!step) {
    return "Preparing broadcast";
  }

  switch (step.kind) {
    case "opening":
      return "Opening";

    case "recap":
      return "Recap";

    case "jury-intro":
      return voterName
        ? `${voterName} is voting`
        : "Jury vote";

    case "jury-batch":
      return voterName
        ? `${voterName} · lower points`
        : "Jury points";

    case "jury-point":
      return voterName
        ? `${voterName} · ${step.points} points`
        : `${step.points} jury points`;

    case "jury-done":
      return "Jury voting complete";

    case "televote-intro":
      return "Televote";

    case "televote":
      return `${step.points} televote points`;

    case "winner":
      return "Winner";

    case "credits":
      return "Credits";
  }
}

function getSceneTitle(
  step:
    | Step
    | undefined,
  showName: string,
) {
  if (!step) {
    return showName;
  }

  switch (step.kind) {
    case "jury-intro":
    case "jury-batch":
    case "jury-point":
      return "JURY RESULTS";

    case "jury-done":
      return "JURY RESULTS";

    case "televote-intro":
    case "televote":
      return "TELEVOTE RESULTS";

    case "recap":
      return "CURRENT STANDINGS";

    case "winner":
      return "FINAL RESULTS";

    case "opening":
    case "credits":
      return showName;
  }
}

function getSceneSubtitle(
  step:
    | Step
    | undefined,
  voterName:
    | string
    | undefined,
  leaderScore:
    | number
    | undefined,
) {
  if (!step) {
    return undefined;
  }

  switch (step.kind) {
    case "jury-intro":
      return voterName
        ? `Now voting: ${voterName}`
        : "Next jury";

    case "jury-batch":
      return voterName
        ? `${voterName}'s jury points`
        : "Jury points";

    case "jury-point":
      return voterName
        ? `${voterName} awards ${step.points} points`
        : `${step.points} points`;

    case "jury-done":
      return leaderScore != null
        ? `Jury leader: ${leaderScore} points`
        : "All jury votes revealed";

    case "televote-intro":
      return "The public vote begins";

    case "televote":
      return `${step.points} points revealed`;

    case "recap":
      return "Current results";

    default:
      return undefined;
  }
}

/* -------------------------------------------------------------------------- */
/* Opening / winner / credits splash                                          */
/* -------------------------------------------------------------------------- */

function LegacySplash({
  title,
  subtitle,
  theme,
}: {
  title: string;
  subtitle: string;
  theme: ReturnType<
    typeof resolveTheme
  >;
}) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        ...backgroundStyle(
          theme,
        ),
        ...themeVars(
          theme,
        ),
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `rgba(0,0,0,${theme.background.overlay})`,
        }}
      />

      <motion.div
        initial={{
          opacity: 0,
          scale: 0.95,
        }}
        animate={{
          opacity: 1,
          scale: 1,
        }}
        className="relative grid h-full w-full place-items-center px-8 text-center"
      >
        <div>
          <h2
            className="font-display text-5xl font-black md:text-7xl"
            style={{
              fontFamily:
                "var(--t-font-display)",
            }}
          >
            {title}
          </h2>

          <p className="mt-4 text-lg opacity-75 md:text-2xl">
            {subtitle}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
