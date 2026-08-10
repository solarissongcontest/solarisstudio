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
  useAllShows,
  useContestEntities,
  useCountries,
  useEditions,
  useIsOrganizer,
  useShowParticipants,
  useThemes,
  type Edition,
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
    data: countries,
  } =
    useCountries();

  const {
    data: shows,
  } =
    useAllShows();

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
    },
    [
      editionShows,
      previewShowId,
    ],
  );

  const previewShow =
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

  const {
    data:
      previewParticipants,
  } =
    useShowParticipants(
      previewShow?.id,
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

  const savedTheme =
    useMemo(
      () =>
        resolveTheme(
          (
            themes ??
            []
          ).find(
            (
              theme,
            ) =>
              theme.id ===
              edition?.theme_id,
          )?.config,
        ),
      [
        themes,
        edition?.theme_id,
      ],
    );

  const savedBroadcast =
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

  const savedScoreboard =
    useMemo(
      () => {
        const editionBroadcast =
          (
            edition as
              | EditionWithBroadcast
              | null
          )
            ?.broadcast_config;

        if (
          editionBroadcast &&
          typeof editionBroadcast ===
            "object" &&
          "scoreboard" in
            editionBroadcast
        ) {
          return resolveScoreboard(
            editionBroadcast,
            {
              theme:
                savedTheme,

              rowCount:
                previewParticipants?.length ??
                0,
            },
          );
        }

        if (
          savedTheme.scoreboardConfig
        ) {
          return savedTheme.scoreboardConfig;
        }

        return resolveScoreboard(
          null,
          {
            theme:
              savedTheme,

            rowCount:
              previewParticipants?.length ??
              0,
          },
        );
      },
      [
        edition,
        savedTheme,
        previewParticipants?.length,
      ],
    );

  const [
    themeDraft,
    setThemeDraft,
  ] =
    useState<ThemeConfig>(
      savedTheme,
    );

  const [
    broadcastDraft,
    setBroadcastDraft,
  ] =
    useState<BroadcastConfig>(
      savedBroadcast,
    );

  const [
    scoreboardDraft,
    setScoreboardDraft,
  ] =
    useState<ScoreboardConfig>(
      savedScoreboard,
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
        savedTheme,
      );

      setBroadcastDraft(
        savedBroadcast,
      );

      setScoreboardDraft(
        savedScoreboard,
      );
    },
    [
      edition?.id,
      savedTheme,
      savedBroadcast,
      savedScoreboard,
    ],
  );

  const previewRows =
    useMemo<
      BroadcastRowData[]
    >(
      () =>
        (
          previewParticipants ??
          []
        ).map(
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
                themeDraft.colors.accent,

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
                index % 4 ===
                0
                  ? 2
                  : index % 4 ===
                      1
                    ? -1
                    : 0,

              qualified:
                participant.qualified,

              eliminated:
                participant.qualified ===
                false
                  ? true
                  : participant.qualified ===
                      true
                    ? false
                    : null,

              active:
                index ===
                2,

              highlighted:
                index ===
                1,

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
        themeDraft.colors.accent,
        previewShow?.kind,
      ],
    );

  const participantCount =
    previewParticipants?.length ??
    0;

  const automaticColumns =
    participantCount <=
    14
      ? 1
      : participantCount <=
          30
        ? 2
        : 3;

  const resetScoreboard =
    () => {
      setScoreboardDraft(
        resolveScoreboard(
          null,
          {
            theme:
              themeDraft,

            rowCount:
              participantCount,
          },
        ),
      );

      setMsg(
        "Scoreboard reset to the automatic edition theme design.",
      );
    };

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

  const saveEditionDesign =
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
        let themeId =
          edition.theme_id;

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
                config: {
                  ...themeDraft,
                  scoreboardConfig:
                    scoreboardDraft,
                },
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

                "Could not save the edition theme.",
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
                  )} design`,

                config: {
                  ...themeDraft,
                  scoreboardConfig:
                    scoreboardDraft,
                },

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

                    "Could not create the edition theme.",
                  )
                : "Could not create the edition theme.",
            );

            return;
          }

          themeId =
            createdTheme.id;
        }

        const currentBroadcast =
          (
            edition as
              EditionWithBroadcast
          )
            .broadcast_config &&
          typeof (
            edition as
              EditionWithBroadcast
          )
            .broadcast_config ===
            "object"
            ? (
                edition as
                  EditionWithBroadcast
              )
                .broadcast_config ??
              {}
            : {};

        const nextBroadcastConfig =
          {
            ...currentBroadcast,
            ...broadcastDraft,

            scoreboard:
              scoreboardDraft,
          };

        const editionQuery =
          supabase.from(
            "editions",
          ) as any;

        const {
          error:
            editionError,
        } =
          await editionQuery
            .update({
              theme_id:
                themeId,

              broadcast_config:
                nextBroadcastConfig,
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

              "Could not save the edition-wide Design & Broadcast settings.",
            ),
          );

          return;
        }

        setMsg(
          `${editionLabel(
            edition,
          )} design saved for every show.`,
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
          Loading edition design…
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
        eyebrow="Edition-wide presentation"
        title={`${editionLabel(
          edition,
        )} Design & Broadcast`}
        description="Build the scoreboard and country cards once, then use the same visual system across every show in this edition."
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

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Field
          label="Preview show"
          hint="Only changes the preview. The saved design belongs to the whole edition."
        >
          <Select
            value={
              previewShow?.id ??
              ""
            }
            onChange={(
              event,
            ) =>
              setPreviewShowId(
                event.target.value,
              )
            }
          >
            {!editionShows.length && (
              <option value="">
                No shows yet
              </option>
            )}

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
                </option>
              ),
            )}
          </Select>
        </Field>

        <button
          type="button"
          disabled={
            saving
          }
          onClick={
            saveEditionDesign
          }
          className="bg-aurora min-h-11 rounded-xl px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {saving
            ? "Saving…"
            : "Save edition design"}
        </button>
      </div>

      <div className="space-y-5">
        {/* ===================================================
            MAIN SIMPLIFIED EDITOR
           =================================================== */}

        <Panel
          title="Custom scoreboard & country cards"
          description="This is the main visual editor. Pick a style, customise the country cards, layers, background and jury panel, then preview it live."
        >
          <div className="mb-4 rounded-xl border border-primary/25 bg-primary/5 p-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
              Recommended workflow
            </p>

            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Start here. You usually do not need the full Theme Editor below unless you want to change the edition-wide branding, typography or base colour palette.
            </p>
          </div>

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
                resetScoreboard
              }
            />
          ) : (
            <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Create at least one show to preview the scoreboard and country cards.
            </div>
          )}
        </Panel>

        {/* ===================================================
            ADAPTIVE SHOW LAYOUTS
           =================================================== */}

        <Panel
          title="Automatic layouts per show"
          description="The country-card style stays identical, while each show can use a different number of columns depending on its participant count."
        >
          {editionShows.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {editionShows.map(
                (
                  show,
                ) => {
                  const count =
                    show.id ===
                    previewShow?.id
                      ? participantCount
                      : null;

                  return (
                    <div
                      key={
                        show.id
                      }
                      className="rounded-xl border border-border bg-surface/50 p-3"
                    >
                      <p className="text-sm font-semibold">
                        {
                          show.name
                        }
                      </p>

                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {count !=
                        null
                          ? `${count} entries · ${automaticColumns} column${automaticColumns === 1 ? "" : "s"}`
                          : "Layout adapts automatically from its entry count"}
                      </p>
                    </div>
                  );
                },
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No shows yet.
            </p>
          )}
        </Panel>

        {/* ===================================================
            ADVANCED THEME
           =================================================== */}

        <details className="glass overflow-hidden">
          <summary className="cursor-pointer list-none p-4 sm:p-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Advanced
              </p>

              <h2 className="mt-1 font-display text-lg font-bold">
                Edition theme & branding
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                Background, global colours, typography and base identity. Most users can leave this closed after setting the edition look.
              </p>
            </div>
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

        {/* ===================================================
            BROADCAST
           =================================================== */}

        <details className="glass overflow-hidden">
          <summary className="cursor-pointer list-none p-4 sm:p-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Production
              </p>

              <h2 className="mt-1 font-display text-lg font-bold">
                Broadcast behaviour
              </h2>

              <p className="mt-1 text-xs text-muted-foreground">
                Scenes, reveal timing, animations, winner effects and spokesperson presentation.
              </p>
            </div>
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

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Link
            to="/admin"
            className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-semibold"
          >
            ← Back to Manage Editions
          </Link>

          <button
            type="button"
            disabled={
              saving
            }
            onClick={
              saveEditionDesign
            }
            className="bg-aurora min-h-11 rounded-xl px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving
              ? "Saving…"
              : "Save edition design"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
