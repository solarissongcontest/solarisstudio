import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AppShell,
  PageHeader,
  Panel,
} from "@/components/AppShell";
import { ArchiveDataError, ArchiveDataLoading, archiveHasError, archiveIsLoading } from "@/components/ArchiveDataState";

import { FlagChip } from "@/components/FlagChip";

import {
  broadcastEntriesFromResults,
  buildBroadcastIntelligence,
  replayProgress,
  type BroadcastMomentKind,
} from "@/lib/broadcast-intelligence";

import {
  editionLabel,
  useAllContestEntities,
  useCountries,
  useEditions,
  useResults,
  useShows,
} from "@/lib/data";

import { entityDisplayMap } from "@/lib/entities";

import {
  resolveShowPublication,
} from "@/lib/publication";

export const Route =
  createFileRoute(
    "/broadcast-intelligence/",
  )({
    head: () => ({
      meta: [
        {
          title:
            "Broadcast Intelligence — Solaris Studio",
        },
      ],
    }),
    component:
      BroadcastIntelligencePage,
  });

const MOMENT_LABELS: Record<
  BroadcastMomentKind,
  string
> = {
  lead_change: "Lead change",
  comeback: "Comeback",
  collapse: "Collapse",
  jury_landslide: "Jury boost",
  televote_surge: "Televote surge",
  split_vote: "Split vote",
  photo_finish: "Photo finish",
  balanced: "Balanced",
  dominant: "Dominant",
};

function BroadcastIntelligencePage() {
  const editionsQuery = useEditions();
  const { data: editions } = editionsQuery;

  const [editionId, setEditionId] =
    useState("");

  const showsQuery = useShows(editionId || undefined);
  const { data: shows } = showsQuery;

  const [showId, setShowId] =
    useState("");

  const resultsQuery = useResults(showId || undefined);
  const { data: results } = resultsQuery;

  const countriesQuery = useCountries();
  const entitiesQuery = useAllContestEntities();
  const { data: countries } = countriesQuery;
  const { data: entities } = entitiesQuery;

  const [replayStep, setReplayStep] =
    useState(0);

  const [autoPlay, setAutoPlay] =
    useState(false);

  useEffect(() => {
    if (
      editionId ||
      !editions?.length
    ) {
      return;
    }

    const latest =
      editions.find(
        (edition) =>
          edition.published,
      );

    if (latest) {
      setEditionId(latest.id);
    }
  }, [
    editionId,
    editions,
  ]);

  const eligibleShows = useMemo(
    () =>
      (shows ?? []).filter(
        (show) => {
          const publication =
            resolveShowPublication(
              show,
            );

          return Boolean(
            show.published &&
              publication.results &&
              publication.jury_results &&
              publication.televote_results,
          );
        },
      ),
    [shows],
  );

  useEffect(() => {
    if (
      !eligibleShows.length
    ) {
      setShowId("");
      return;
    }

    if (
      !eligibleShows.some(
        (show) =>
          show.id === showId,
      )
    ) {
      setShowId(
        eligibleShows[0].id,
      );
    }
  }, [
    eligibleShows,
    showId,
  ]);

  useEffect(() => {
    setReplayStep(0);
    setAutoPlay(false);
  }, [showId]);

  const displayMap =
    useMemo(
      () =>
        entityDisplayMap(
          entities ?? [],
          countries ?? [],
        ),
      [
        entities,
        countries,
      ],
    );

  const entries = useMemo(
    () =>
      broadcastEntriesFromResults(
        results ?? [],
        (id) =>
          displayMap.get(id)
            ?.name ??
          "Unknown entry",
      ),
    [
      results,
      displayMap,
    ],
  );

  const intelligence =
    useMemo(
      () =>
        buildBroadcastIntelligence(
          entries,
        ),
      [entries],
    );

  const liveRows = useMemo(
    () =>
      replayProgress(
        entries,
        replayStep,
      ),
    [
      entries,
      replayStep,
    ],
  );

  const selectedEdition =
    (editions ?? []).find(
      (edition) =>
        edition.id ===
        editionId,
    );

  const selectedShow =
    eligibleShows.find(
      (show) =>
        show.id === showId,
    );

  const currentReveal =
    replayStep > 0
      ? intelligence.replay[
          replayStep - 1
        ]
      : null;

  useEffect(() => {
    if (
      !autoPlay ||
      replayStep >=
        intelligence.replay
          .length
    ) {
      if (
        replayStep >=
        intelligence.replay
          .length
      ) {
        setAutoPlay(false);
      }

      return;
    }

    const timer =
      window.setTimeout(
        () => {
          setReplayStep(
            (current) =>
              Math.min(
                intelligence
                  .replay
                  .length,
                current + 1,
              ),
          );
        },
        1400,
      );

    return () =>
      window.clearTimeout(timer);
  }, [
    autoPlay,
    replayStep,
    intelligence.replay.length,
  ]);

  const nextReveal =
    intelligence.replay[
      replayStep
    ];

  const replayFinished =
    intelligence.replay.length >
      0 &&
    replayStep >=
      intelligence.replay.length;

  const setEdition = (
    value: string,
  ) => {
    setEditionId(value);
    setShowId("");
  };

  const archiveQueries = [editionsQuery, showsQuery, resultsQuery, countriesQuery, entitiesQuery];
  const selectionPending = Boolean(editions?.some((edition) => edition.published) && !editionId) || Boolean(eligibleShows.length && !showId);
  if (selectionPending || archiveIsLoading(...archiveQueries)) return <AppShell><PageHeader eyebrow="Broadcast analytics" title="Broadcast Intelligence" description="Replay and inspect a published result." /><ArchiveDataLoading label="Preparing the results replay…" /></AppShell>;
  if (archiveHasError(...archiveQueries)) return <AppShell><PageHeader eyebrow="Broadcast analytics" title="Broadcast Intelligence" description="Replay and inspect a published result." /><ArchiveDataError /></AppShell>;

  return (
    <AppShell>
      <PageHeader
        eyebrow="Broadcast analytics"
        title="Broadcast Intelligence"
        description="Replay an official result, inspect the biggest jury-to-televote swings and surface the moments that made the scoreboard dramatic. The live show remains on YouTube; Solaris Studio becomes the analytics and replay companion."
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Link
              to="/result-lab"
              className="min-w-0 rounded-xl border border-border bg-surface px-3 py-2 text-center text-xs font-semibold sm:text-sm"
            >
              Result Lab
            </Link>

            <Link
              to="/taste-dna"
              className="min-w-0 rounded-xl border border-border bg-surface px-3 py-2 text-center text-xs font-semibold sm:text-sm"
            >
              Taste DNA
            </Link>
          </div>
        }
      />

      <div className="grid min-w-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-5">
        <div className="min-w-0 space-y-4">
          <Panel
            title="Choose a result"
            description="Only fully published results are available"
          >
            <label className="block text-xs font-semibold text-muted-foreground">
              Edition
            </label>

            <select
              value={editionId}
              onChange={(event) =>
                setEdition(
                  event.target
                    .value,
                )
              }
              className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-sm"
            >
              {(editions ?? [])
                .filter(
                  (edition) =>
                    edition.published,
                )
                .map(
                  (edition) => (
                    <option
                      key={
                        edition.id
                      }
                      value={
                        edition.id
                      }
                    >
                      {editionLabel(
                        edition,
                      )}
                    </option>
                  ),
                )}
            </select>

            <label className="mt-4 block text-xs font-semibold text-muted-foreground">
              Show
            </label>

            <select
              value={showId}
              onChange={(
                event,
              ) =>
                setShowId(
                  event.target
                    .value,
                )
              }
              disabled={
                !eligibleShows.length
              }
              className="mt-2 min-h-11 w-full min-w-0 max-w-full rounded-xl border border-border bg-background px-3 text-sm disabled:opacity-60"
            >
              {!eligibleShows.length && (
                <option value="">
                  No published result
                </option>
              )}

              {eligibleShows.map(
                (show) => (
                  <option
                    key={show.id}
                    value={show.id}
                  >
                    {show.name}
                  </option>
                ),
              )}
            </select>

            {!eligibleShows.length &&
              selectedEdition && (
                <p className="mt-3 break-words text-xs leading-relaxed text-muted-foreground">
                  This edition does not have a fully public jury and televote result available for replay yet.
                </p>
              )}
          </Panel>

          {intelligence.winner && (
            <Panel
              title="Official winner"
              description={
                selectedShow
                  ?.name
              }
            >
              <div className="flex min-w-0 items-center gap-3">
                {(() => {
                  const display =
                    displayMap.get(
                      intelligence
                        .winner!
                        .id,
                    );

                  if (!display) {
                    return null;
                  }

                  return (
                    <FlagChip
                      code={
                        display.short_code
                      }
                      color={
                        display.accent_color
                      }
                      image={
                        display.flag_image
                      }
                      size="lg"
                    />
                  );
                })()}

                <div className="min-w-0">
                  <p className="truncate font-display text-xl font-semibold">
                    {
                      intelligence
                        .winner
                        .name
                    }
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    {
                      intelligence
                        .winner
                        .totalPoints
                    }{" "}
                    points
                  </p>
                </div>
              </div>
            </Panel>
          )}

          {!!intelligence.metrics
            .length && (
            <Panel title="Broadcast pulse">
              <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-1">
                {intelligence.metrics.map(
                  (metric) => (
                    <div
                      key={
                        metric.label
                      }
                      className="min-w-0 rounded-xl bg-surface p-3"
                    >
                      <p className="break-words text-[9px] font-bold uppercase tracking-[0.13em] text-primary">
                        {
                          metric.label
                        }
                      </p>

                      <p className="mt-1 font-display text-xl font-semibold">
                        {
                          metric.value
                        }
                      </p>

                      <p className="mt-1 break-words text-[10px] leading-relaxed text-muted-foreground">
                        {
                          metric.detail
                        }
                      </p>
                    </div>
                  ),
                )}
              </div>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {intelligence.rows
            .length > 0 ? (
            <>
              <Panel
                title="Results Replay"
                description="Jury totals start on the board. Televote points are then revealed from the lowest jury-ranked entry upward."
              >
                <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0 rounded-xl bg-surface p-3 sm:p-4">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
                      Replay status
                    </p>

                    {currentReveal ? (
                      <div className="mt-2 min-w-0">
                        <p className="break-words font-display text-xl font-semibold">
                          {
                            currentReveal.name
                          }
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                          +
                          {
                            currentReveal.televotePoints
                          }{" "}
                          televote
                          points
                        </p>

                        <p className="mt-2 break-words text-xs text-muted-foreground">
                          Now{" "}
                          <strong className="text-foreground">
                            #
                            {
                              currentReveal.rankAfter
                            }
                          </strong>

                          {currentReveal.rankChange >
                            0 &&
                            ` · up ${currentReveal.rankChange}`}

                          {currentReveal.rankChange <
                            0 &&
                            ` · down ${Math.abs(currentReveal.rankChange)}`}
                        </p>

                        {currentReveal.becameLeader && (
                          <p className="mt-2 rounded-lg bg-surface-strong px-2 py-1.5 text-xs font-semibold text-primary">
                            New
                            leader
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2">
                        <p className="font-display text-xl font-semibold">
                          Jury
                          result
                        </p>

                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          Start
                          the
                          replay
                          to reveal
                          the
                          televote.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="grid min-w-0 grid-cols-2 gap-2 sm:w-52 sm:grid-cols-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          replayFinished
                        ) {
                          setReplayStep(
                            0,
                          );
                          setAutoPlay(
                            false,
                          );
                          return;
                        }

                        setReplayStep(
                          (current) =>
                            Math.min(
                              intelligence
                                .replay
                                .length,
                              current +
                                1,
                            ),
                        );
                      }}
                      disabled={
                        !intelligence
                          .replay
                          .length
                      }
                      className="min-h-11 min-w-0 rounded-xl border border-border bg-surface px-3 text-xs font-semibold disabled:opacity-50"
                    >
                      {replayFinished
                        ? "Restart"
                        : "Next reveal"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setAutoPlay(
                          (current) =>
                            !current,
                        )
                      }
                      disabled={
                        replayFinished ||
                        !intelligence
                          .replay
                          .length
                      }
                      className="min-h-11 min-w-0 rounded-xl border border-border bg-surface px-3 text-xs font-semibold disabled:opacity-50"
                    >
                      {autoPlay
                        ? "Pause"
                        : "Auto play"}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setReplayStep(
                          0,
                        );
                        setAutoPlay(
                          false,
                        );
                      }}
                      className="col-span-2 min-h-10 min-w-0 rounded-xl border border-border bg-surface px-3 text-xs font-semibold sm:col-span-1"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
                    <span>
                      {
                        replayStep
                      }
                      /
                      {
                        intelligence
                          .replay
                          .length
                      }{" "}
                      revealed
                    </span>

                    {nextReveal && (
                      <span className="min-w-0 truncate text-right">
                        Next:{" "}
                        {
                          nextReveal.name
                        }
                      </span>
                    )}
                  </div>

                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-strong">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500"
                      style={{
                        width:
                          intelligence
                            .replay
                            .length >
                          0
                            ? `${(replayStep / intelligence.replay.length) * 100}%`
                            : "0%",
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {liveRows.map(
                    (row) => {
                      const display =
                        displayMap.get(
                          row.id,
                        );

                      return (
                        <div
                          key={
                            row.id
                          }
                          className="flex min-w-0 items-center gap-2 rounded-xl bg-surface px-3 py-2.5"
                        >
                          <span className="w-7 shrink-0 text-center font-display text-lg font-semibold">
                            {
                              row.liveRank
                            }
                          </span>

                          {display && (
                            <FlagChip
                              code={
                                display.short_code
                              }
                              color={
                                display.accent_color
                              }
                              image={
                                display.flag_image
                              }
                              size="sm"
                            />
                          )}

                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {
                                row.name
                              }
                            </p>

                            <p className="text-[10px] text-muted-foreground">
                              {row.televoteRevealed
                                ? "Televote revealed"
                                : "Waiting for televote"}
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="font-display text-base font-semibold tabular-nums">
                              {
                                row.liveScore
                              }
                            </p>

                            <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                              pts
                            </p>
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </Panel>

              <Panel
                title="Broadcast moments"
                description="Automatically detected storylines from the official scoreboard"
              >
                <div className="grid min-w-0 gap-2 md:grid-cols-2">
                  {intelligence.moments.map(
                    (moment) => {
                      const display =
                        moment.countryId
                          ? displayMap.get(
                              moment.countryId,
                            )
                          : undefined;

                      return (
                        <div
                          key={
                            moment.id
                          }
                          className="min-w-0 rounded-xl bg-surface p-3 sm:p-4"
                        >
                          <div className="flex min-w-0 items-start gap-2">
                            {display && (
                              <FlagChip
                                code={
                                  display.short_code
                                }
                                color={
                                  display.accent_color
                                }
                                image={
                                  display.flag_image
                                }
                                size="sm"
                              />
                            )}

                            <div className="min-w-0 flex-1">
                              <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-primary">
                                {
                                  MOMENT_LABELS[
                                    moment
                                      .kind
                                  ]
                                }
                              </p>

                              <p className="mt-1 break-words text-sm font-semibold">
                                {
                                  moment.title
                                }
                              </p>

                              <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                                {
                                  moment.summary
                                }
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>
              </Panel>

              <Panel
                title="Jury vs televote"
                description="How each entry's position changed after the two voting groups were combined"
              >
                <div className="space-y-2 sm:hidden">
                  {intelligence.rows.map(
                    (row) => {
                      const display =
                        displayMap.get(
                          row.id,
                        );

                      return (
                        <div
                          key={
                            row.id
                          }
                          className="min-w-0 rounded-xl bg-surface p-3"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="w-7 shrink-0 font-display text-lg font-semibold">
                              #
                              {
                                row.finalRank
                              }
                            </span>

                            {display && (
                              <FlagChip
                                code={
                                  display.short_code
                                }
                                color={
                                  display.accent_color
                                }
                                image={
                                  display.flag_image
                                }
                                size="sm"
                              />
                            )}

                            <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                              {
                                row.name
                              }
                            </span>
                          </div>

                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                                Jury
                              </p>
                              <strong>
                                #
                                {
                                  row.juryRank
                                }
                              </strong>
                              <p className="text-[10px] text-muted-foreground">
                                {
                                  row.juryPoints
                                }{" "}
                                pts
                              </p>
                            </div>

                            <div>
                              <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                                Tele
                              </p>
                              <strong>
                                #
                                {
                                  row.televoteRank
                                }
                              </strong>
                              <p className="text-[10px] text-muted-foreground">
                                {
                                  row.televotePoints
                                }{" "}
                                pts
                              </p>
                            </div>

                            <div>
                              <p className="text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
                                Change
                              </p>
                              <strong>
                                {row.juryToFinalChange >
                                0
                                  ? `+${row.juryToFinalChange}`
                                  : row.juryToFinalChange}
                              </strong>
                              <p className="text-[10px] text-muted-foreground">
                                jury → final
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    },
                  )}
                </div>

                <div className="hidden max-w-full overflow-x-auto sm:block">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        <th className="pb-3 pr-3">
                          Final
                        </th>

                        <th className="pb-3 pr-3">
                          Entry
                        </th>

                        <th className="pb-3 pr-3 text-right">
                          Jury
                        </th>

                        <th className="pb-3 pr-3 text-right">
                          Televote
                        </th>

                        <th className="pb-3 pr-3 text-right">
                          Total
                        </th>

                        <th className="pb-3 text-right">
                          Jury → final
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {intelligence.rows.map(
                        (row) => {
                          const display =
                            displayMap.get(
                              row.id,
                            );

                          return (
                            <tr
                              key={
                                row.id
                              }
                              className="border-b border-border/50 last:border-0"
                            >
                              <td className="py-3 pr-3 font-display text-lg font-semibold">
                                #
                                {
                                  row.finalRank
                                }
                              </td>

                              <td className="py-3 pr-3">
                                <div className="flex items-center gap-2">
                                  {display && (
                                    <FlagChip
                                      code={
                                        display.short_code
                                      }
                                      color={
                                        display.accent_color
                                      }
                                      image={
                                        display.flag_image
                                      }
                                      size="sm"
                                    />
                                  )}

                                  <span className="font-semibold">
                                    {
                                      row.name
                                    }
                                  </span>
                                </div>
                              </td>

                              <td className="py-3 pr-3 text-right tabular-nums">
                                {
                                  row.juryPoints
                                }{" "}
                                <span className="text-xs text-muted-foreground">
                                  (#
                                  {
                                    row.juryRank
                                  })
                                </span>
                              </td>

                              <td className="py-3 pr-3 text-right tabular-nums">
                                {
                                  row.televotePoints
                                }{" "}
                                <span className="text-xs text-muted-foreground">
                                  (#
                                  {
                                    row.televoteRank
                                  })
                                </span>
                              </td>

                              <td className="py-3 pr-3 text-right font-semibold tabular-nums">
                                {
                                  row.totalPoints
                                }
                              </td>

                              <td className="py-3 text-right font-semibold tabular-nums">
                                {row.juryToFinalChange >
                                0
                                  ? `+${row.juryToFinalChange}`
                                  : row.juryToFinalChange}
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          ) : (
            <Panel title="Broadcast Intelligence">
              <p className="break-words text-sm leading-relaxed text-muted-foreground">
                Choose a
                published show
                with jury and
                televote results
                to generate the
                replay and
                broadcast
                analysis.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </AppShell>
  );
}
