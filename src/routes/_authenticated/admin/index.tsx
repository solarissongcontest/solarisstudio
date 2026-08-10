import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  useQueryClient,
} from "@tanstack/react-query";

import {
  AppShell,
  PageHeader,
  Panel,
  StatTile,
} from "@/components/AppShell";

import {
  Field,
  Select,
  TextInput,
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
  useCountries,
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

/* ============================================================
   ROUTE
   ============================================================ */

export const Route =
  createFileRoute(
    "/_authenticated/admin/",
  )({
    head: () => ({
      meta: [
        {
          title:
            "Organizer studio — Solaris Spectacle Suite",
        },

        {
          name:
            "description",

          content:
            "Create and manage Solaris Song Contest editions, shows, voting systems, edition design and broadcast production.",
        },

        {
          property:
            "og:title",

          content:
            "Organizer studio — Solaris Spectacle Suite",
        },

        {
          property:
            "og:description",

          content:
            "Manage SSC editions, shows, votes, edition design and broadcast production.",
        },
      ],
    }),

    component:
      AdminHome,
  });

/* ============================================================
   TYPES
   ============================================================ */

type EditionWithBroadcast =
  Edition & {
    broadcast_config?:
      | Record<
          string,
          unknown
        >
      | null;
  };

/* ============================================================
   HELPERS
   ============================================================ */

function editionStatusLabel(
  edition: Edition,
) {
  if (
    edition.published
  ) {
    return "Published";
  }

  if (
    edition.status &&
    edition.status !==
      "draft"
  ) {
    return edition.status;
  }

  return "Draft";
}

/**
 * The same edition identity can use a different number of columns
 * depending on the show size.
 *
 * 1–14 entries  -> 1 column
 * 15–30 entries -> 2 columns
 * 31+ entries   -> 3 columns when the theme allows grid, otherwise 2
 */
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

/* ============================================================
   PAGE
   ============================================================ */

function AdminHome() {
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

  /* =========================================================
     NEXT EDITION NUMBER
     ========================================================= */

  const nextNumber =
    editionsLoading
      ? null
      : Math.max(
          0,
          ...(
            editions ??
            []
          ).map(
            (
              edition,
            ) =>
              edition.edition_number ??
              0,
          ),
        ) + 1;

  /* =========================================================
     CREATE FORM
     ========================================================= */

  const [
    form,
    setForm,
  ] =
    useState({
      edition_number:
        "" as
          | number
          | "",

      name: "",
      year: "",
      host_city: "",
      host_country_id:
        "",
    });

  const [
    numberTouched,
    setNumberTouched,
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

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  /* =========================================================
     EDITION DESIGN STATE
     ========================================================= */

  const [
    designEditionId,
    setDesignEditionId,
  ] =
    useState("");

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
    designSaving,
    setDesignSaving,
  ] =
    useState(false);

  const designEdition =
    useMemo(
      () =>
        (
          editions ??
          []
        ).find(
          (
            edition,
          ) =>
            edition.id ===
            designEditionId,
        ) ??
        null,
      [
        editions,
        designEditionId,
      ],
    );

  const designShows =
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
              designEdition?.id,
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
        designEdition?.id,
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

  /* =========================================================
     AUTO-FILL NEXT EDITION NUMBER
     ========================================================= */

  useEffect(
    () => {
      if (
        nextNumber !==
          null &&
        !numberTouched &&
        form.edition_number ===
          ""
      ) {
        setForm(
          (
            current,
          ) => ({
            ...current,

            edition_number:
              nextNumber,
          }),
        );
      }
    },
    [
      nextNumber,
      numberTouched,
      form.edition_number,
    ],
  );

  /* =========================================================
     LOAD EDITION DESIGN
     ========================================================= */

  useEffect(
    () => {
      if (
        !designEdition
      ) {
        setDesignThemeId(
          "",
        );

        setThemeDraft(
          resolveTheme(
            undefined,
          ),
        );

        setBroadcastDraft(
          resolveBroadcast(
            undefined,
          ),
        );

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
            designEdition.theme_id,
        );

      setDesignThemeId(
        designEdition.theme_id ??
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
            designEdition as EditionWithBroadcast
          ).broadcast_config,
        ),
      );
    },
    [
      designEdition,
      themes,
    ],
  );

  /* =========================================================
     CACHE REFRESH
     ========================================================= */

  const refresh =
    () => {
      [
        "editions",
        "edition",
        "shows",
        "show",
        "themes",
        "participants",
        "results",
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

  /* =========================================================
     CREATE EDITION
     ========================================================= */

  const createEdition =
    async (
      event:
        FormEvent,
    ) => {
      event.preventDefault();

      if (
        saving
      ) {
        return;
      }

      setMsg(null);
      setError(null);

      const num =
        Number(
          form.edition_number,
        );

      if (
        !Number.isInteger(
          num,
        ) ||
        num < 1
      ) {
        setError(
          "Enter a whole edition number of 1 or higher.",
        );

        return;
      }

      const slug =
        `ssc-${num}`;

      const clash =
        (
          editions ??
          []
        ).find(
          (
            edition,
          ) =>
            edition.edition_number ===
              num ||
            edition.slug ===
              slug,
        );

      if (
        clash
      ) {
        setError(
          `Edition ${num} already exists (“${clash.name}”). Pick a different number.`,
        );

        return;
      }

      setSaving(true);

      try {
        const {
          error:
            insertError,
        } =
          await supabase
            .from(
              "editions",
            )
            .insert({
              edition_number:
                num,

              name:
                form.name ||
                `Solaris Song Contest ${num}`,

              year:
                form.year
                  ? Number(
                      form.year,
                    )
                  : null,

              slug,

              host_city:
                form.host_city ||
                null,

              host_country_id:
                form.host_country_id ||
                null,

              status:
                "draft",

              published:
                false,
            });

        if (
          insertError
        ) {
          setError(
            reportSupabaseError(
              insertError,

              "Could not create the edition. Nothing was saved.",
            ),
          );

          return;
        }

        setNumberTouched(
          false,
        );

        setForm({
          edition_number:
            num + 1,

          name: "",
          year: "",
          host_city: "",

          host_country_id:
            "",
        });

        setMsg(
          `SSC ${num} created as a draft.`,
        );

        refresh();
      } finally {
        setSaving(
          false,
        );
      }
    };

  /* =========================================================
     PUBLISH / UNPUBLISH
     ========================================================= */

  const togglePublished =
    async (
      edition:
        Edition,
    ) => {
      setError(null);
      setMsg(null);

      const nextPublished =
        !edition.published;

      const nextStatus =
        nextPublished
          ? "published"
          : "draft";

      const {
        error:
          updateError,
      } =
        await supabase
          .from(
            "editions",
          )
          .update({
            published:
              nextPublished,

            status:
              nextStatus,
          })
          .eq(
            "id",
            edition.id,
          );

      if (
        updateError
      ) {
        setError(
          reportSupabaseError(
            updateError,

            "Could not change the visibility of this edition.",
          ),
        );

        return;
      }

      setMsg(
        nextPublished
          ? `${editionLabel(
              edition,
            )} is now published.`
          : `${editionLabel(
              edition,
            )} is now private and has returned to draft status.`,
      );

      refresh();
    };

  /* =========================================================
     DELETE EDITION
     ========================================================= */

  const removeEdition =
    async (
      edition:
        Edition,
    ) => {
      if (
        !window.confirm(
          `Delete “${edition.name}” and all of its shows, votes and results?`,
        )
      ) {
        return;
      }

      setError(null);
      setMsg(null);

      const {
        error:
          deleteError,
      } =
        await supabase
          .from(
            "editions",
          )
          .delete()
          .eq(
            "id",
            edition.id,
          );

      if (
        deleteError
      ) {
        setError(
          reportSupabaseError(
            deleteError,

            "Could not delete this edition.",
          ),
        );

        return;
      }

      if (
        designEditionId ===
        edition.id
      ) {
        setDesignEditionId(
          "",
        );
      }

      setMsg(
        `Deleted ${editionLabel(
          edition,
        )}.`,
      );

      refresh();
    };

  /* =========================================================
     THEME LIBRARY SELECTION
     ========================================================= */

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

  /* =========================================================
     SAVE EDITION DESIGN + BROADCAST AS ONE UNIT
     ========================================================= */

  const saveEditionDesign =
    async () => {
      if (
        !designEdition ||
        designSaving
      ) {
        return;
      }

      setDesignSaving(
        true,
      );

      setError(null);
      setMsg(null);

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
                    designEdition,
                  )} design`,

                description:
                  `Edition-wide visual identity for ${editionLabel(
                    designEdition,
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

        /*
         * Cast to any because the generated Supabase types pre-date the
         * new editions.broadcast_config migration. The SQL migration is
         * still the real database contract.
         */
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
              designEdition.id,
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
            designEdition,
          )} design & broadcast saved for every show.`,
        );

        refresh();
      } finally {
        setDesignSaving(
          false,
        );
      }
    };

  /* =========================================================
     CREATE A PRIVATE COPY OF CURRENT THEME
     ========================================================= */

  const makeThemeCopy =
    () => {
      setDesignThemeId(
        "",
      );

      setMsg(
        "This design will be saved as a new edition theme the next time you press Save edition design.",
      );
    };

  /* =========================================================
     PAGE
     ========================================================= */

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer studio"
        title="Manage editions"
        description="Create editions, manage their shows, and control one shared visual identity and broadcast system for every show in the edition."
      />

      {/* =====================================================
          ORGANIZER WARNING
         ===================================================== */}

      {isOrganizer ===
        false && (
        <div className="glass mb-4 border border-destructive/40 p-3 text-xs leading-relaxed sm:mb-6 sm:p-4 sm:text-sm">
          Your account does
          not have the{" "}
          <strong>
            organizer
          </strong>{" "}
          role yet, so saving
          changes will be
          rejected. Ask an
          existing organizer to
          grant it.
        </div>
      )}

      {/* =====================================================
          STATS
         ===================================================== */}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-4 lg:grid-cols-4">
        <StatTile
          label="Editions"
          value={
            editions?.length ??
            0
          }
        />

        <StatTile
          label="Shows"
          value={
            shows?.length ??
            0
          }
        />

        <StatTile
          label="Countries"
          value={
            countries?.length ??
            0
          }
        />

        <StatTile
          label="Published editions"
          value={
            (
              editions ??
              []
            ).filter(
              (
                edition,
              ) =>
                edition.published,
            ).length
          }
        />
      </div>

      {/* =====================================================
          MESSAGES
         ===================================================== */}

      {error && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!error &&
        msg && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            {msg}
          </div>
        )}

      {/* =====================================================
          EDITIONS + NEW EDITION
         ===================================================== */}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1.4fr_1fr] lg:gap-6">
        <Panel
          title="Editions"
          description="Manage show data separately, but keep design and broadcast identity edition-wide."
        >
          <ul className="space-y-2">
            {(
              editions ??
              []
            ).map(
              (
                edition,
              ) => {
                const editionShows =
                  (
                    shows ??
                    []
                  ).filter(
                    (
                      show,
                    ) =>
                      show.edition_id ===
                      edition.id,
                  );

                const status =
                  editionStatusLabel(
                    edition,
                  );

                const designOpen =
                  designEditionId ===
                  edition.id;

                return (
                  <li
                    key={
                      edition.id
                    }
                    className="rounded-xl border border-border/60 bg-surface p-3 sm:px-4"
                  >
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold sm:text-base">
                            {editionLabel(
                              edition,
                            )}

                            <span className="font-normal text-muted-foreground">
                              {" "}
                              ·{" "}
                              {
                                edition.name
                              }
                            </span>
                          </p>

                          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                            {edition.host_city ??
                              "Host TBC"}{" "}
                            ·{" "}
                            {
                              editionShows.length
                            }{" "}
                            show
                            {editionShows.length ===
                            1
                              ? ""
                              : "s"}{" "}
                            ·{" "}
                            {edition.published
                              ? "public"
                              : "private"}
                          </p>
                        </div>

                        <span
                          className={
                            edition.published
                              ? "shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[9px] font-semibold uppercase text-primary"
                              : "shrink-0 rounded-full bg-background/60 px-2 py-1 text-[9px] font-semibold uppercase text-muted-foreground"
                          }
                        >
                          {
                            status
                          }
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <Link
                          to="/admin/$slug"
                          params={{
                            slug:
                              edition.slug,
                          }}
                          className="flex min-h-10 items-center justify-center rounded-lg border border-border px-3 text-sm font-medium"
                        >
                          Manage shows
                        </Link>

                        <button
                          type="button"
                          onClick={() =>
                            setDesignEditionId(
                              designOpen
                                ? ""
                                : edition.id,
                            )
                          }
                          className={
                            designOpen
                              ? "bg-aurora min-h-10 rounded-lg px-3 text-sm font-semibold text-primary-foreground"
                              : "min-h-10 rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-primary"
                          }
                        >
                          {designOpen
                            ? "Design editor open"
                            : "Design & broadcast"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            togglePublished(
                              edition,
                            )
                          }
                          className="min-h-10 rounded-lg border border-border px-3 text-sm"
                        >
                          {edition.published
                            ? "Make private"
                            : "Publish"}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            removeEdition(
                              edition,
                            )
                          }
                          className="min-h-10 rounded-lg border border-destructive/50 px-3 text-sm text-destructive hover:bg-destructive/10"
                        >
                          Delete
                        </button>
                      </div>

                      {!!editionShows.length && (
                        <div className="scroll-slim mt-3 flex gap-1.5 overflow-x-auto pb-1">
                          {editionShows.map(
                            (
                              show,
                            ) => {
                              const count =
                                participantCountByShow.get(
                                  show.id,
                                ) ??
                                0;

                              return (
                                <Link
                                  key={
                                    show.id
                                  }
                                  to="/broadcast/$showId"
                                  params={{
                                    showId:
                                      show.id,
                                  }}
                                  className="shrink-0 rounded-lg bg-background/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                                >
                                  {
                                    show.name
                                  }
                                  {" · "}
                                  {
                                    count
                                  }{" "}
                                  entries
                                </Link>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              },
            )}

            {!(editions ?? [])
              .length && (
              <p className="text-sm text-muted-foreground">
                No editions yet.
                Create SSC 1.
              </p>
            )}
          </ul>
        </Panel>

        <Panel
          title="New edition"
          description="Editions are numbered; the year is optional metadata."
        >
          <form
            onSubmit={
              createEdition
            }
            className="space-y-3"
          >
            <Field
              label="Edition number"
              hint={
                editionsLoading
                  ? "Loading existing editions…"
                  : "Suggested from the highest existing edition"
              }
            >
              <TextInput
                type="number"
                min={1}
                required
                disabled={
                  editionsLoading
                }
                className="numeric"
                value={
                  form.edition_number
                }
                onChange={(
                  event,
                ) => {
                  setNumberTouched(
                    true,
                  );

                  setForm({
                    ...form,

                    edition_number:
                      event.target.value ===
                      ""
                        ? ""
                        : Number(
                            event.target.value,
                          ),
                  });
                }}
              />
            </Field>

            <Field
              label="Name"
              hint={`Defaults to “Solaris Song Contest ${
                form.edition_number ||
                "…"
              }”`}
            >
              <TextInput
                value={
                  form.name
                }
                placeholder={`Solaris Song Contest ${
                  form.edition_number ||
                  ""
                }`}
                onChange={(
                  event,
                ) =>
                  setForm({
                    ...form,

                    name:
                      event.target.value,
                  })
                }
              />
            </Field>

            <Field
              label="Year (optional)"
              hint="Calendar year is metadata only. SSC edition number controls contest chronology."
            >
              <TextInput
                type="number"
                className="numeric"
                value={
                  form.year
                }
                onChange={(
                  event,
                ) =>
                  setForm({
                    ...form,

                    year:
                      event.target.value,
                  })
                }
              />
            </Field>

            <Field label="Host country">
              <Select
                value={
                  form.host_country_id
                }
                onChange={(
                  event,
                ) =>
                  setForm({
                    ...form,

                    host_country_id:
                      event.target.value,
                  })
                }
              >
                <option
                  value=""
                  className="bg-background"
                >
                  Undecided
                </option>

                {(
                  countries ??
                  []
                ).map(
                  (
                    country,
                  ) => (
                    <option
                      key={
                        country.id
                      }
                      value={
                        country.id
                      }
                      className="bg-background"
                    >
                      {
                        country.name
                      }
                    </option>
                  ),
                )}
              </Select>
            </Field>

            <Field label="Host city">
              <TextInput
                value={
                  form.host_city
                }
                placeholder="Solvarra"
                onChange={(
                  event,
                ) =>
                  setForm({
                    ...form,

                    host_city:
                      event.target.value,
                  })
                }
              />
            </Field>

            <button
              type="submit"
              disabled={
                saving ||
                editionsLoading
              }
              className="bg-aurora min-h-11 w-full rounded-xl px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Creating edition…"
                : "Create edition"}
            </button>
          </form>
        </Panel>
      </div>

      {/* =====================================================
          ONE COMBINED EDITION DESIGN + BROADCAST PAGE
         ===================================================== */}

      {designEdition && (
        <section className="mt-6 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                Edition-wide presentation
              </p>

              <h2 className="mt-1 font-display text-3xl font-bold">
                {editionLabel(
                  designEdition,
                )}{" "}
                Design &amp; Broadcast
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                This is the single design page for the entire edition. Every scoreboard, running-order style and broadcast show inherits this identity automatically.
              </p>
            </div>

            <button
              type="button"
              disabled={
                designSaving
              }
              onClick={
                saveEditionDesign
              }
              className="bg-aurora min-h-11 rounded-xl px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {designSaving
                ? "Saving edition design…"
                : "Save edition design"}
            </button>
          </div>

          {/* SHOW-AWARE LAYOUT EXPLANATION */}

          <Panel
            title="Automatic show layouts"
            description="The style is shared, but column count adapts to each show's participant count."
          >
            {designShows.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {designShows.map(
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
                          {count === 1
                            ? ""
                            : "s"}
                        </p>

                        <p className="mt-2 text-xs font-semibold text-primary">
                          {columns}{" "}
                          column
                          {columns === 1
                            ? ""
                            : "s"}
                          {" "}
                          automatically
                        </p>
                      </div>
                    );
                  },
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Create shows first. They will inherit this edition design automatically.
              </p>
            )}
          </Panel>

          {/* THEME LIBRARY */}

          <Panel
            title="Edition visual identity"
            description="Background, palette, typography, country cards, flags and shared scoreboard styling."
          >
            <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <Field
                label="Theme from library"
                hint="Choose a saved design or create a private edition theme."
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

          {/* SAME PAGE, BROADCAST DIRECTLY BELOW THEME */}

          <Panel
            title="Edition broadcast"
            description="Scenes, titles, timings, animations, winner effects and spokesperson presentation shared by the whole edition."
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

          {/* VISUAL BACKDROP PREVIEW */}

          <Panel
            title="Edition identity preview"
            description="Backdrop and typography preview. Actual scoreboard columns still adapt per show."
          >
            <div
              className="relative min-h-[280px] overflow-hidden rounded-2xl border border-white/10 p-6 sm:p-8"
              style={
                backgroundStyle(
                  themeDraft,
                )
              }
            >
              <div className="relative z-10 flex min-h-[220px] flex-col justify-between">
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
                      designEdition,
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

          <div className="flex justify-end">
            <button
              type="button"
              disabled={
                designSaving
              }
              onClick={
                saveEditionDesign
              }
              className="bg-aurora min-h-11 rounded-xl px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {designSaving
                ? "Saving edition design…"
                : "Save edition design"}
            </button>
          </div>
        </section>
      )}
    </AppShell>
  );
}
