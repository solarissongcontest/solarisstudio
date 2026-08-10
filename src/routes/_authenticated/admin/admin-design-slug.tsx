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
  supabase,
} from "@/integrations/supabase/client";

import {
  reportSupabaseError,
} from "@/lib/errors";

import {
  editionLabel,
  useAllParticipants,
  useAllShows,
  useEditions,
  useIsOrganizer,
  useThemes,
  type Edition,
} from "@/lib/data";

import {
  backgroundStyle,
  resolveTheme,
  type ThemeConfig,
} from "@/lib/theme";

import {
  resolveBroadcast,
  type BroadcastConfig,
} from "@/lib/broadcast";

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

function recommendedColumns(
  count: number,
  theme: ThemeConfig,
) {
  if (
    count <= 14
  ) {
    return 1;
  }

  if (
    count <= 30
  ) {
    return 2;
  }

  return theme.layout.mode ===
    "grid"
    ? 3
    : 2;
}

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

  const [
    designThemeId,
    setDesignThemeId,
  ] =
    useState("");

  const [
    themeDraft,
    setThemeDraft,
  ] =
    useState<ThemeConfig>(
      resolveTheme(
        undefined,
      ),
    );

  const [
    broadcastDraft,
    setBroadcastDraft,
  ] =
    useState<BroadcastConfig>(
      resolveBroadcast(
        undefined,
      ),
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
      if (
        !edition
      ) {
        return;
      }

      const themeRow =
        (
          themes ??
          []
        ).find(
          (
            theme,
          ) =>
            theme.id ===
            edition.theme_id,
        );

      setDesignThemeId(
        edition.theme_id ??
          "",
      );

      setThemeDraft(
        resolveTheme(
          themeRow?.config,
        ),
      );

      setBroadcastDraft(
        resolveBroadcast(
          (
            edition as EditionWithBroadcast
          ).broadcast_config,
        ),
      );
    },
    [
      edition,
      themes,
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

  const selectThemeFromLibrary =
    (
      id:
        string,
    ) => {
      setDesignThemeId(
        id,
      );

      const selected =
        (
          themes ??
          []
        ).find(
          (
            theme,
          ) =>
            theme.id ===
            id,
        );

      setThemeDraft(
        resolveTheme(
          selected?.config,
        ),
      );
    };

  const makeThemeCopy =
    () => {
      setDesignThemeId(
        "",
      );

      setMsg(
        "This design will be saved as a new private edition theme when you press Save edition design.",
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
          designThemeId ||
          null;

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
                  themeDraft,
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
              newTheme,

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

                description:
                  `Edition-wide visual identity for ${editionLabel(
                    edition,
                  )}`,

                config:
                  themeDraft,

                is_public:
                  false,
              })
              .select()
              .maybeSingle();

          if (
            themeError ||
            !newTheme
          ) {
            setError(
              reportSupabaseError(
                themeError,

                "Could not create the edition theme.",
              ),
            );

            return;
          }

          themeId =
            newTheme.id;

          setDesignThemeId(
            newTheme.id,
          );
        }

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
                broadcastDraft,
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

              "The theme saved, but the edition broadcast settings could not be saved.",
            ),
          );

          return;
        }

        setMsg(
          `${editionLabel(
            edition,
          )} Design & Broadcast saved for every show.`,
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
        description="One page controls the visual identity and broadcast behaviour inherited by every show in this edition."
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

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            {editionShows.length} show
            {editionShows.length ===
            1
              ? ""
              : "s"} inherit this edition identity.
          </p>
        </div>

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
            ? "Saving edition design…"
            : "Save edition design"}
        </button>
      </div>

      <div className="space-y-5">
        <Panel
          title="Automatic show layouts"
          description="The visual style is shared edition-wide, but column count adapts to each show's participant count."
        >
          {editionShows.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {editionShows.map(
                (
                  show,
                ) => {
                  const count =
                    participantCountByShow.get(
                      show.id,
                    ) ??
                    0;

                  const columns =
                    recommendedColumns(
                      count,
                      themeDraft,
                    );

                  return (
                    <div
                      key={
                        show.id
                      }
                      className="rounded-xl border border-border/70 bg-surface/50 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {
                              show.name
                            }
                          </p>

                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {
                              count
                            }{" "}
                            participant
                            {count ===
                            1
                              ? ""
                              : "s"}
                          </p>
                        </div>

                        <span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-bold uppercase text-primary">
                          {columns} col
                        </span>
                      </div>

                      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                        Same colours, fonts, cards and broadcast identity. Layout density adjusts automatically.
                      </p>
                    </div>
                  );
                },
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No shows yet. Create shows first and they will inherit this edition design automatically.
            </p>
          )}
        </Panel>

        <Panel
          title="Theme & visual identity"
          description="Background, palette, typography, country cards, flag treatment and the shared look used by scoreboards and running-order surfaces."
        >
          <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <Field
              label="Theme from library"
              hint="Choose a saved design or make a private copy for this edition."
            >
              <Select
                value={
                  designThemeId
                }
                onChange={(
                  event,
                ) =>
                  selectThemeFromLibrary(
                    event.target.value,
                  )
                }
              >
                <option
                  value=""
                  className="bg-background"
                >
                  New private edition theme
                </option>

                {(
                  themes ??
                  []
                ).map(
                  (
                    theme,
                  ) => (
                    <option
                      key={
                        theme.id
                      }
                      value={
                        theme.id
                      }
                      className="bg-background"
                    >
                      {
                        theme.name
                      }
                    </option>
                  ),
                )}
              </Select>
            </Field>

            <button
              type="button"
              onClick={
                makeThemeCopy
              }
              className="min-h-11 rounded-xl border border-border bg-surface px-4 text-sm"
            >
              Save edits as new theme
            </button>
          </div>

          <ThemeEditor
            theme={
              themeDraft
            }
            onChange={
              setThemeDraft
            }
          />
        </Panel>

        <Panel
          title="Broadcast behaviour"
          description="Scenes, titles, timings, animations, winner effects and spokesperson presentation for the whole edition."
        >
          <BroadcastEditor
            config={
              broadcastDraft
            }
            onChange={
              setBroadcastDraft
            }
          />
        </Panel>

        <Panel
          title="Edition identity preview"
          description="A quick visual preview of the shared edition identity. Actual scoreboard row count and columns still adapt per show."
        >
          <div
            className="relative min-h-[300px] overflow-hidden rounded-2xl border border-white/10 p-6 sm:p-8"
            style={
              backgroundStyle(
                themeDraft,
              )
            }
          >
            <div className="relative z-10 flex min-h-[240px] flex-col justify-between">
              <div>
                <p
                  className="text-xs font-bold uppercase tracking-[0.2em]"
                  style={{
                    color:
                      themeDraft.colors.accent,
                  }}
                >
                  Solaris Song Contest
                </p>

                <h3
                  className="mt-2 text-4xl font-black"
                  style={{
                    color:
                      themeDraft.colors.text,

                    fontFamily:
                      themeDraft.fontDisplay,
                  }}
                >
                  {editionLabel(
                    edition,
                  )}
                </h3>

                <p
                  className="mt-2 text-sm"
                  style={{
                    color:
                      themeDraft.text.artistSong,

                    fontFamily:
                      themeDraft.fontBody,
                  }}
                >
                  Shared visual identity across every show
                </p>
              </div>

              <div className="grid max-w-xl gap-2 sm:grid-cols-2">
                {[
                  "Country One",
                  "Country Two",
                  "Country Three",
                  "Country Four",
                ].map(
                  (
                    name,
                    index,
                  ) => (
                    <div
                      key={
                        name
                      }
                      className="flex items-center gap-3 px-3"
                      style={{
                        minHeight:
                          themeDraft.card.height,

                        borderRadius:
                          themeDraft.card.radius,

                        background:
                          themeDraft.card.backgroundColor,

                        border:
                          `${themeDraft.card.borderWidth}px solid ${themeDraft.card.borderColor}`,

                        opacity:
                          Math.max(
                            0.35,
                            themeDraft.card.opacity,
                          ),
                      }}
                    >
                      <span
                        className="numeric w-6 text-center text-xs font-bold"
                        style={{
                          color:
                            themeDraft.text.rank,
                        }}
                      >
                        {
                          index +
                          1
                        }
                      </span>

                      <span
                        className="flex-1 text-sm font-semibold"
                        style={{
                          color:
                            themeDraft.text.countryName,

                          fontFamily:
                            themeDraft.fontDisplay,
                        }}
                      >
                        {
                          name
                        }
                      </span>

                      <span
                        className="numeric text-sm font-bold"
                        style={{
                          color:
                            themeDraft.text.countryScore,
                        }}
                      >
                        {
                          100 -
                          index *
                            7
                        }
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </Panel>

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
              ? "Saving edition design…"
              : "Save edition design"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
