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
  useQueryClient,
} from "@tanstack/react-query";

import {
  AppShell,
  PageHeader,
  Panel,
} from "@/components/AppShell";

import {
  Field,
  Select,
} from "@/components/studio/Controls";

import {
  ThemeEditor,
} from "@/components/studio/ThemeEditor";

import {
  BroadcastEditor,
} from "@/components/studio/BroadcastEditor";

import {
  ScoreboardEditor,
} from "@/components/studio/ScoreboardEditor";

import {
  supabase,
} from "@/integrations/supabase/client";

import {
  reportSupabaseError,
} from "@/lib/errors";

import {
  editionLabel,
  useAllParticipants,
  useAllShows,
  useContestEntities,
  useCountries,
  useEditions,
  useIsOrganizer,
  useThemes,
  type Edition,
  type Show,
} from "@/lib/data";

import {
  entityDisplayMap,
} from "@/lib/entities";

import {
  resolveTheme,
  type ThemeConfig,
} from "@/lib/theme";

import {
  resolveBroadcast,
  type BroadcastConfig,
} from "@/lib/broadcast";

import {
  resolveScoreboard,
  type BroadcastRowData,
  type ScoreboardConfig,
} from "@/lib/scoreboard";

export const Route =
  createFileRoute(
    "/_authenticated/admin/design/$slug",
  )({
    head: ({
      params,
    }) => ({
      meta: [
        {
          title:
            `${params.slug} Design & Broadcast — Solaris Studio`,
        },
      ],
    }),

    component:
      EditionDesignPage,
  });

type EditionWithBroadcast =
  Edition & {
    broadcast_config?:
      | Record<
          string,
          unknown
        >
      | null;
  };

type DesignScope =
  | "edition"
  | string;

function EditionDesignPage() {
  const {
    slug,
  } =
    Route.useParams();

  const {
    data: editions,
    isLoading:
      editionsLoading,
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
    data: countries,
  } =
    useCountries();

  const {
    data: themes,
  } =
    useThemes();

  const {
    data: isOrganizer,
  } =
    useIsOrganizer();

  const qc =
    useQueryClient();

  const edition =
    useMemo(
      () =>
        (
          editions ??
          []
        ).find(
          (
            item,
          ) =>
            item.slug ===
            slug,
        ) ??
        null,
      [
        editions,
        slug,
      ],
    );

  const editionShows =
    useMemo(
      () =>
        (
          shows ??
          []
        )
          .filter(
            (
              show,
            ) =>
              show.edition_id ===
              edition?.id,
          )
          .sort(
            (
              a,
              b,
            ) =>
              a.sort_order -
              b.sort_order,
          ),
      [
        shows,
        edition?.id,
      ],
    );

  const [
    scope,
    setScope,
  ] =
    useState<DesignScope>(
      "edition",
    );

  const [
    previewShowId,
    setPreviewShowId,
  ] =
    useState("");

  useEffect(
    () => {
      if (
        !previewShowId &&
        editionShows[
          0
        ]
      ) {
        setPreviewShowId(
          editionShows[
            0
          ].id,
        );
      }

      if (
        previewShowId &&
        !editionShows.some(
          (
            show,
          ) =>
            show.id ===
            previewShowId,
        )
      ) {
        setPreviewShowId(
          editionShows[
            0
          ]?.id ??
            "",
        );
      }

      if (
        scope !==
          "edition" &&
        !editionShows.some(
          (
            show,
          ) =>
            show.id ===
            scope,
        )
      ) {
        setScope(
          "edition",
        );
      }
    },
    [
      editionShows,
      previewShowId,
      scope,
    ],
  );

  const selectedShow =
    scope ===
    "edition"
      ? null
      : editionShows.find(
          (
            show,
          ) =>
            show.id ===
            scope,
        ) ??
        null;

  const previewShow =
    selectedShow ??
    editionShows.find(
      (
        show,
      ) =>
        show.id ===
        previewShowId,
    ) ??
    editionShows[
      0
    ] ??
    null;

  const previewParticipants =
    useMemo(
      () =>
        (
          participants ??
          []
        )
          .filter(
            (
              participant,
            ) =>
              participant.show_id ===
              previewShow?.id,
          )
          .sort(
            (
              a,
              b,
            ) =>
              (
                a.running_order ??
                999
              ) -
              (
                b.running_order ??
                999
              ),
          ),
      [
        participants,
        previewShow?.id,
      ],
    );

  const participantCountByShow =
    useMemo(
      () => {
        const counts =
          new Map<
            string,
            number
          >();

        (
          participants ??
          []
        ).forEach(
          (
            participant,
          ) => {
            if (
              !participant.show_id
            ) {
              return;
            }

            counts.set(
              participant.show_id,
              (
                counts.get(
                  participant.show_id,
                ) ??
                0
              ) +
                1,
            );
          },
        );

        return counts;
      },
      [
        participants,
      ],
    );

  const {
    data: entities,
  } =
    useContestEntities(
      edition?.id,
    );

  const displayMap =
    useMemo(
      () =>
        entityDisplayMap(
          entities ??
            [],
          countries ??
            [],
        ),
      [
        entities,
        countries,
      ],
    );

  const editionThemeRow =
    useMemo(
      () =>
        (
          themes ??
          []
        ).find(
          (
            theme,
          ) =>
            theme.id ===
            edition?.theme_id,
        ) ??
        null,
      [
        themes,
        edition?.theme_id,
      ],
    );

  const editionTheme =
    useMemo(
      () =>
        resolveTheme(
          editionThemeRow?.config,
        ),
      [
        editionThemeRow,
      ],
    );

  const editionBroadcast =
    useMemo(
      () =>
        resolveBroadcast(
          (
            edition as
              | EditionWithBroadcast
              | null
          )
            ?.broadcast_config,
        ),
      [
        edition,
      ],
    );

  const editionScoreboard =
    useMemo(
      () =>
        resolveScoreboard(
          (
            edition as
              | EditionWithBroadcast
              | null
          )
            ?.broadcast_config ??
            (
              editionTheme.scoreboardConfig
                ? {
                    scoreboard:
                      editionTheme.scoreboardConfig,
                  }
                : null
            ),
          {
            theme:
              editionTheme,

            rowCount:
              previewParticipants.length,
          },
        ),
      [
        edition,
        editionTheme,
        previewParticipants.length,
      ],
    );

  const selectedShowThemeRow =
    useMemo(
      () => {
        if (
          !selectedShow
        ) {
          return null;
        }

        return (
          themes ??
          []
        ).find(
          (
            theme,
          ) =>
            theme.id ===
            selectedShow.theme_id,
        ) ??
        null;
      },
      [
        themes,
        selectedShow,
      ],
    );

  const selectedShowTheme =
    useMemo(
      () =>
        selectedShow
          ? resolveTheme(
              selectedShowThemeRow?.config ??
                editionTheme,
            )
          : editionTheme,
      [
        selectedShow,
        selectedShowThemeRow,
        editionTheme,
      ],
    );

  const selectedShowBroadcast =
    useMemo(
      () =>
        selectedShow
          ? resolveBroadcast(
              selectedShow.broadcast_config ??
                (
                  edition as
                    | EditionWithBroadcast
                    | null
                )
                  ?.broadcast_config,
            )
          : editionBroadcast,
      [
        selectedShow,
        edition,
        editionBroadcast,
      ],
    );

  const selectedShowScoreboard =
    useMemo(
      () => {
        if (
          !selectedShow
        ) {
          return editionScoreboard;
        }

        if (
          selectedShow.broadcast_config &&
          typeof selectedShow.broadcast_config ===
            "object" &&
          "scoreboard" in
            selectedShow.broadcast_config
        ) {
          return resolveScoreboard(
            selectedShow.broadcast_config,
            {
              theme:
                selectedShowTheme,

              rowCount:
                previewParticipants.length,
            },
          );
        }

        if (
          selectedShowTheme.scoreboardConfig
        ) {
          return normalizeScoreboard(
            selectedShowTheme.scoreboardConfig,
            previewParticipants.length,
          );
        }

        return normalizeScoreboard(
          editionScoreboard,
          previewParticipants.length,
        );
      },
      [
        selectedShow,
        selectedShowTheme,
        editionScoreboard,
        previewParticipants.length,
      ],
    );

  const sourceTheme =
    scope ===
    "edition"
      ? editionTheme
      : selectedShowTheme;

  const sourceBroadcast =
    scope ===
    "edition"
      ? editionBroadcast
      : selectedShowBroadcast;

  const sourceScoreboard =
    scope ===
    "edition"
      ? normalizeScoreboard(
          editionScoreboard,
          previewParticipants.length,
        )
      : normalizeScoreboard(
          selectedShowScoreboard,
          previewParticipants.length,
        );

  const [
    themeDraft,
    setThemeDraft,
  ] =
    useState<ThemeConfig>(
      sourceTheme,
    );

  const [
    broadcastDraft,
    setBroadcastDraft,
  ] =
    useState<BroadcastConfig>(
      sourceBroadcast,
    );

  const [
    scoreboardDraft,
    setScoreboardDraft,
  ] =
    useState<ScoreboardConfig>(
      sourceScoreboard,
    );

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    msg,
    setMsg,
  ] =
    useState<
      string | null
    >(null);

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  useEffect(
    () => {
      setThemeDraft(
        sourceTheme,
      );

      setBroadcastDraft(
        sourceBroadcast,
      );

      setScoreboardDraft(
        normalizeScoreboard(
          sourceScoreboard,
          previewParticipants.length,
        ),
      );

      setMsg(
        null,
      );

      setError(
        null,
      );
    },
    [
      scope,
      previewShow?.id,
      sourceTheme,
      sourceBroadcast,
      sourceScoreboard,
      previewParticipants.length,
    ],
  );

  const previewRows =
    useMemo<
      BroadcastRowData[]
    >(
      () =>
        previewParticipants.map(
          (
            participant,
            index,
          ) => {
            const display =
              displayMap.get(
                participant.country_id,
              );

            const total =
              Math.max(
                0,
                248 -
                  index *
                    7,
              );

            return {
              id:
                participant.country_id,

              entityType:
                display?.entityType ??
                "global",

              name:
                display?.name ??
                participant.country_id,

              abbreviation:
                display?.short_code ??
                "",

              flagImage:
                display?.flag_image ??
                null,

              accent:
                display?.accent_color ??
                themeDraft.colors.primary,

              rank:
                index +
                1,

              runningOrder:
                participant.running_order ??
                index +
                  1,

              score:
                total,

              juryScore:
                Math.round(
                  total *
                    0.53,
                ),

              televoteScore:
                Math.round(
                  total *
                    0.47,
                ),

              movement:
                0,

              qualified:
                participant.qualified,

              eliminated:
                participant.qualified ===
                false,

              active:
                false,

              highlighted:
                false,

              leader:
                index ===
                0,

              winner:
                index ===
                  0 &&
                previewShow?.kind ===
                  "grand-final",

              subtitle:
                participant.artist &&
                participant.song
                  ? `${participant.artist} — ${participant.song}`
                  : participant.artist ??
                    participant.song ??
                    null,
            };
          },
        ),
      [
        previewParticipants,
        displayMap,
        themeDraft.colors.primary,
        previewShow?.kind,
      ],
    );

  const refresh =
    () => {
      [
        "editions",
        "edition",
        "shows",
        "show",
        "themes",
        "participants",
      ].forEach(
        (
          key,
        ) =>
          qc.invalidateQueries({
            queryKey:
              [
                key,
              ],
          }),
      );
    };

  const saveEditionDefault =
    async () => {
      if (
        !edition ||
        saving
      ) {
        return;
      }

      setSaving(
        true,
      );

      setError(
        null,
      );

      setMsg(
        null,
      );

      try {
        const cleanBase =
          normalizeScoreboard(
            scoreboardDraft,
            previewParticipants.length,
          );

        let themeId =
          edition.theme_id;

        const themeConfig = {
          ...themeDraft,

          scoreboardConfig:
            cleanBase,
        };

        if (
          themeId
        ) {
          const {
            error:
              themeError,
          } =
            await supabase
              .from(
                "themes",
              )
              .update({
                config:
                  themeConfig,
              })
              .eq(
                "id",
                themeId,
              );

          if (
            themeError
          ) {
            setError(
              reportSupabaseError(
                themeError,

                "Could not save the edition design.",
              ),
            );

            return;
          }
        } else {
          const {
            data:
              createdTheme,

            error:
              themeError,
          } =
            await supabase
              .from(
                "themes",
              )
              .insert({
                name:
                  `${editionLabel(
                    edition,
                  )} default design`,

                description:
                  `Default design for every round of ${editionLabel(
                    edition,
                  )}`,

                config:
                  themeConfig,

                is_public:
                  false,
              })
              .select()
              .maybeSingle();

          if (
            themeError ||
            !createdTheme
          ) {
            setError(
              themeError
                ? reportSupabaseError(
                    themeError,

                    "Could not create the edition design.",
                  )
                : "Could not create the edition design.",
            );

            return;
          }

          themeId =
            createdTheme.id;
        }

        const editionBroadcastConfig =
          {
            ...broadcastDraft,

            scoreboard:
              cleanBase,
          };

        const {
          error:
            editionError,
        } =
          await (
            supabase.from(
              "editions",
            ) as any
          )
            .update({
              theme_id:
                themeId,

              broadcast_config:
                editionBroadcastConfig,
            })
            .eq(
              "id",
              edition.id,
            );

        if (
          editionError
        ) {
          setError(
            reportSupabaseError(
              editionError,

              "Could not save the edition-wide design.",
            ),
          );

          return;
        }

        /*
         * "Save for all rounds" means exactly that:
         * every show gets the edition default now.
         *
         * Afterward, any individual round can be opened and tweaked.
         */
        for (
          const show of
          editionShows
        ) {
          const count =
            participantCountByShow.get(
              show.id,
            ) ??
            0;

          const showScoreboard =
            normalizeScoreboard(
              cleanBase,
              count,
            );

          const {
            error:
              showError,
          } =
            await supabase
              .from(
                "shows",
              )
              .update({
                theme_id:
                  themeId,

                broadcast_config:
                  {
                    ...broadcastDraft,

                    scoreboard:
                      showScoreboard,
                  },
              })
              .eq(
                "id",
                show.id,
              );

          if (
            showError
          ) {
            setError(
              reportSupabaseError(
                showError,

                `The edition saved, but ${show.name} could not be updated.`,
              ),
            );

            return;
          }
        }

        setMsg(
          `${editionLabel(
            edition,
          )} default design saved to every round. You can now choose a round above and make a small override.`,
        );

        refresh();
      } finally {
        setSaving(
          false,
        );
      }
    };

  const saveRoundOverride =
    async () => {
      if (
        !edition ||
        !selectedShow ||
        saving
      ) {
        return;
      }

      setSaving(
        true,
      );

      setError(
        null,
      );

      setMsg(
        null,
      );

      try {
        const count =
          participantCountByShow.get(
            selectedShow.id,
          ) ??
          0;

        const cleanScoreboard =
          normalizeScoreboard(
            scoreboardDraft,
            count,
          );

        /*
         * A round override gets a private theme copy.
         * This lets the public show page and broadcast both see the override.
         */
        let roundThemeId =
          selectedShow.theme_id !==
          edition.theme_id
            ? selectedShow.theme_id
            : null;

        const roundThemeConfig = {
          ...themeDraft,

          scoreboardConfig:
            cleanScoreboard,
        };

        if (
          roundThemeId
        ) {
          const {
            error:
              themeError,
          } =
            await supabase
              .from(
                "themes",
              )
              .update({
                config:
                  roundThemeConfig,
              })
              .eq(
                "id",
                roundThemeId,
              );

          if (
            themeError
          ) {
            setError(
              reportSupabaseError(
                themeError,

                "Could not save the round design.",
              ),
            );

            return;
          }
        } else {
          const {
            data:
              roundTheme,

            error:
              themeError,
          } =
            await supabase
              .from(
                "themes",
              )
              .insert({
                name:
                  `${editionLabel(
                    edition,
                  )} · ${selectedShow.name} override`,

                description:
                  `Small visual override for ${selectedShow.name}`,

                config:
                  roundThemeConfig,

                is_public:
                  false,
              })
              .select()
              .maybeSingle();

          if (
            themeError ||
            !roundTheme
          ) {
            setError(
              themeError
                ? reportSupabaseError(
                    themeError,

                    "Could not create the round override.",
                  )
                : "Could not create the round override.",
            );

            return;
          }

          roundThemeId =
            roundTheme.id;
        }

        const {
          error:
            showError,
        } =
          await supabase
            .from(
              "shows",
            )
            .update({
              theme_id:
                roundThemeId,

              broadcast_config:
                {
                  ...broadcastDraft,

                  scoreboard:
                    cleanScoreboard,
                },
            })
            .eq(
              "id",
              selectedShow.id,
            );

        if (
          showError
        ) {
          setError(
            reportSupabaseError(
              showError,

              "Could not save this round override.",
            ),
          );

          return;
        }

        setMsg(
          `${selectedShow.name} now has its own small override. The other rounds still use the edition default.`,
        );

        refresh();
      } finally {
        setSaving(
          false,
        );
      }
    };

  const resetRound =
    async () => {
      if (
        !edition ||
        !selectedShow ||
        !edition.theme_id ||
        saving
      ) {
        return;
      }

      setSaving(
        true,
      );

      setError(
        null,
      );

      setMsg(
        null,
      );

      try {
        const count =
          participantCountByShow.get(
            selectedShow.id,
          ) ??
          0;

        const cleanScoreboard =
          normalizeScoreboard(
            editionScoreboard,
            count,
          );

        const {
          error:
            showError,
        } =
          await supabase
            .from(
              "shows",
            )
            .update({
              theme_id:
                edition.theme_id,

              broadcast_config:
                {
                  ...editionBroadcast,

                  scoreboard:
                    cleanScoreboard,
                },
            })
            .eq(
              "id",
              selectedShow.id,
            );

        if (
          showError
        ) {
          setError(
            reportSupabaseError(
              showError,

              "Could not reset this round to the edition default.",
            ),
          );

          return;
        }

        setMsg(
          `${selectedShow.name} is using the edition default again.`,
        );

        refresh();
      } finally {
        setSaving(
          false,
        );
      }
    };

  if (
    editionsLoading
  ) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">
          Loading design…
        </p>
      </AppShell>
    );
  }

  if (
    !edition
  ) {
    return (
      <AppShell>
        <Panel>
          <h1 className="font-display text-2xl font-bold">
            Edition not found
          </h1>

          <Link
            to="/admin"
            className="mt-4 inline-flex text-sm font-semibold text-primary"
          >
            ← Back to Manage Editions
          </Link>
        </Panel>
      </AppShell>
    );
  }

  const roundHasOverride =
    !!selectedShow &&
    !!selectedShow.theme_id &&
    selectedShow.theme_id !==
      edition.theme_id;

  return (
    <AppShell>
      <div className="mb-5">
        <Link
          to="/admin"
          className="inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 text-sm font-semibold"
        >
          ← Back to Manage Editions
        </Link>
      </div>

      <PageHeader
        eyebrow="Edition design"
        title={`${editionLabel(
          edition,
        )} Design`}
        description="Create one simple default for the whole edition, then optionally tweak individual rounds."
      />

      {isOrganizer ===
        false && (
        <div className="glass mb-5 border border-destructive/40 p-3 text-sm">
          Your account does not have the organizer role, so saving will be rejected.
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {
            error
          }
        </div>
      )}

      {!error &&
        msg && (
          <div className="mb-5 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            {
              msg
            }
          </div>
        )}

      {/* =====================================================
          WHAT ARE WE EDITING?
         ===================================================== */}

      <Panel
        title="What are you editing?"
        description="Use the edition default for almost everything. Only open a specific round when you want a small difference."
        className="mb-5"
      >
        <Field label="Design">
          <Select
            value={
              scope
            }
            onChange={(
              event,
            ) =>
              setScope(
                event.target
                  .value,
              )
            }
          >
            <option
              value="edition"
              className="bg-background"
            >
              All rounds · edition default
            </option>

            {editionShows.map(
              (
                show,
              ) => (
                <option
                  key={
                    show.id
                  }
                  value={
                    show.id
                  }
                  className="bg-background"
                >
                  {
                    show.name
                  }
                  {show.theme_id &&
                  show.theme_id !==
                    edition.theme_id
                    ? " · custom"
                    : ""}
                </option>
              ),
            )}
          </Select>
        </Field>

        {scope ===
        "edition" ? (
          <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3">
            <p className="text-sm font-semibold">
              Edition default
            </p>

            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Saving here applies this design to every round. Any old round overrides are reset so all rounds start from the same clean base again.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border bg-surface/50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">
                {selectedShow?.name}
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                {roundHasOverride
                  ? "This round currently has its own override."
                  : "This round currently uses the edition default."}
              </p>
            </div>

            {roundHasOverride && (
              <button
                type="button"
                disabled={
                  saving
                }
                onClick={
                  resetRound
                }
                className="min-h-10 rounded-xl border border-border px-3 text-sm"
              >
                Reset to edition default
              </button>
            )}
          </div>
        )}
      </Panel>

      {/* =====================================================
          PREVIEW SHOW WHEN EDITING DEFAULT
         ===================================================== */}

      {scope ===
        "edition" &&
        editionShows.length >
          1 && (
          <Panel
            title="Preview with"
            description="The design is still for every round. This only changes which participant list you see in the preview."
            className="mb-5"
          >
            <Field label="Preview round">
              <Select
                value={
                  previewShow?.id ??
                  ""
                }
                onChange={(
                  event,
                ) =>
                  setPreviewShowId(
                    event.target
                      .value,
                  )
                }
              >
                {editionShows.map(
                  (
                    show,
                  ) => (
                    <option
                      key={
                        show.id
                      }
                      value={
                        show.id
                      }
                      className="bg-background"
                    >
                      {
                        show.name
                      }
                      {" · "}
                      {
                        participantCountByShow.get(
                          show.id,
                        ) ??
                        0
                      }{" "}
                      entries
                    </option>
                  ),
                )}
              </Select>
            </Field>
          </Panel>
        )}

      {/* =====================================================
          SIMPLE SCOREBOARD EDITOR
         ===================================================== */}

      <Panel
        title={
          scope ===
          "edition"
            ? "Edition scoreboard & country cards"
            : `${selectedShow?.name ?? "Round"} scoreboard`
        }
        description={
          scope ===
          "edition"
            ? "This is the main editor. Background, cards and layout are all here."
            : "Make only the small differences you want for this round."
        }
      >
        {previewShow ? (
          <ScoreboardEditor
            config={
              scoreboardDraft
            }
            onChange={
              setScoreboardDraft
            }
            rows={
              previewRows
            }
            theme={
              themeDraft
            }
            showName={
              previewShow.name
            }
            onReset={
              scope ===
              "edition"
                ? undefined
                : () =>
                    setScoreboardDraft(
                      normalizeScoreboard(
                        editionScoreboard,
                        previewParticipants.length,
                      ),
                    )
            }
          />
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Create at least one show first.
          </div>
        )}
      </Panel>

      {/* =====================================================
          EDITION BRANDING ONLY
         ===================================================== */}

      {scope ===
        "edition" && (
        <details className="glass mt-5 overflow-hidden">
          <summary className="cursor-pointer list-none p-4 sm:p-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
              Optional
            </p>

            <h2 className="mt-1 font-display text-lg font-bold">
              Edition branding
            </h2>

            <p className="mt-1 text-xs text-muted-foreground">
              Logo, base colours, fonts and the edition background. Most editing happens above.
            </p>
          </summary>

          <div className="border-t border-border p-4 sm:p-5">
            <ThemeEditor
              theme={
                themeDraft
              }
              onChange={
                setThemeDraft
              }
            />
          </div>
        </details>
      )}

      {/* =====================================================
          BROADCAST BEHAVIOUR
         ===================================================== */}

      <details className="glass mt-5 overflow-hidden">
        <summary className="cursor-pointer list-none p-4 sm:p-5">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary">
            Optional
          </p>

          <h2 className="mt-1 font-display text-lg font-bold">
            Broadcast behaviour
          </h2>

          <p className="mt-1 text-xs text-muted-foreground">
            Reveal timing and production behaviour. Leave this closed if you only want to change the look.
          </p>
        </summary>

        <div className="border-t border-border p-4 sm:p-5">
          <BroadcastEditor
            config={
              broadcastDraft
            }
            onChange={
              setBroadcastDraft
            }
          />
        </div>
      </details>

      {/* =====================================================
          SAVE
         ===================================================== */}

      <div className="sticky bottom-20 z-40 mt-5 rounded-2xl border border-border bg-background/95 p-3 shadow-2xl backdrop-blur sm:bottom-4">
        <button
          type="button"
          disabled={
            saving ||
            !previewShow
          }
          onClick={
            scope ===
            "edition"
              ? saveEditionDefault
              : saveRoundOverride
          }
          className="bg-aurora min-h-12 w-full rounded-xl px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {saving
            ? "Saving…"
            : scope ===
                "edition"
              ? "Save as default for ALL rounds"
              : `Save only ${selectedShow?.name ?? "this round"}`}
        </button>
      </div>
    </AppShell>
  );
}

function normalizeScoreboard(
  config:
    ScoreboardConfig,

  participantCount:
    number,
): ScoreboardConfig {
  const columns =
    columnsForCount(
      participantCount,
    );

  const rowsPerColumn =
    columns >
    1
      ? Math.ceil(
          Math.max(
            participantCount,
            1,
          ) /
            columns,
        )
      : null;

  return {
    ...config,

    layout: {
      ...config.layout,

      columns,

      rowsPerColumn,

      distribution:
        "sequential",

      boardWidth:
        boardWidthForColumns(
          columns,
        ),
    },

    background: {
      ...config.background,

      pattern:
        "none",

      patternOpacity:
        0,
    },
  };
}

function columnsForCount(
  count:
    number,
): 1 | 2 | 3 | 4 {
  if (
    count <=
    14
  ) {
    return 1;
  }

  if (
    count <=
    30
  ) {
    return 2;
  }

  if (
    count <=
    48
  ) {
    return 3;
  }

  return 4;
}

function boardWidthForColumns(
  columns:
    1 | 2 | 3 | 4,
) {
  switch (
    columns
  ) {
    case 1:
      return 920;

    case 2:
      return 1280;

    case 3:
      return 1460;

    case 4:
      return 1600;
  }
}
