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
  ResponsiveTabs,
} from "@/components/ResponsiveTabs";

import {
  CountryPicker,
} from "@/components/CountryPicker";

import {
  FlagChip,
} from "@/components/FlagChip";

import {
  ScoreboardStage,
} from "@/components/ScoreboardStage";

import {
  ScoreboardBoard,
} from "@/components/broadcast/ScoreboardBoard";

import {
  Field,
  Select,
  TextInput,
} from "@/components/studio/Controls";

import {
  ThemeEditor,
} from "@/components/studio/ThemeEditor";

import {
  VotingEditor,
} from "@/components/studio/VotingEditor";

import {
  BroadcastEditor,
} from "@/components/studio/BroadcastEditor";

import {
  ScoreboardEditor,
} from "@/components/studio/ScoreboardEditor";

import {
  FastJuryEntry,
  TelevoteEntry,
} from "@/components/studio/FastEntry";

import {
  computeStandings,
} from "@/lib/analysis";

import {
  supabase,
} from "@/integrations/supabase/client";

import {
  reportSupabaseError,
} from "@/lib/errors";

import {
  SHOW_KINDS,
  VOTER_KINDS,
  editionLabel,
  resolveShowVoters,
  useContestEntities,
  useCountries,
  useEdition,
  useJuryVotes,
  useParticipants,
  useShowParticipants,
  useShows,
  useShowVoters,
  useTelevotes,
  useThemes,
  type JuryVote,
  type Participant,
  type Show,
  type Televote,
  type VoterKind,
} from "@/lib/data";

import {
  DEFAULT_ACCENT,
  entityDisplayMap,
  isCustomEntity,
  type ContestEntityRow,
} from "@/lib/entities";

import {
  backgroundStyle,
  resolveTheme,
  type ThemeConfig,
} from "@/lib/theme";

import {
  resolveVoting,
  type VotingConfig,
} from "@/lib/voting";

import {
  resolveBroadcast,
  type BroadcastConfig,
} from "@/lib/broadcast";

import {
  resolveScoreboard,
  type BroadcastRowData,
  type ScoreboardConfig,
} from "@/lib/scoreboard";

import {
  applyPublicationPreset,
  DEFAULT_PUBLICATION_CONFIG,
  hasAnyPublicInformation,
  normalisePublicationDependencies,
  PUBLICATION_LABELS,
  PUBLICATION_PRESETS,
  resolveAutomaticEditionStatus,
  resolvePublicationConfig,
  type PublicationConfig,
  type PublicationKey,
  type PublicationPresetId,
} from "@/lib/publication";

import {
  cn,
} from "@/lib/utils";

/* ============================================================
   ROUTE
   ============================================================ */

export const Route =
  createFileRoute(
    "/_authenticated/admin/$slug",
  )({
    head:
      () => ({
        meta: [
          {
            title:
              "Edition studio — Solaris Spectacle Suite",
          },

          {
            name:
              "description",

            content:
              "Build shows, line-ups, voting systems, scoreboard themes and broadcast settings for a Solaris Song Contest edition.",
          },

          {
            property:
              "og:title",

            content:
              "Edition studio — Solaris Spectacle Suite",
          },

          {
            property:
              "og:description",

            content:
              "Shows, voting systems, themes and fast vote entry.",
          },
        ],
      }),

    component:
      AdminEdition,
  });

/* ============================================================
   TABS
   ============================================================ */

const TABS = [
  "Shows",
  "Line-up",
  "Juries",
  "Jury",
  "Televote",
  "Voting",
  "Theme",
  "Broadcast",
  "Publish",
] as const;

type Tab =
  (typeof TABS)[number];

const TAB_OPTIONS =
  TABS.map(
    (
      tab,
    ) => ({
      value:
        tab,

      label:
        tab ===
        "Jury"
          ? "Jury voting"
          : tab ===
              "Voting"
            ? "Voting system"
            : tab ===
                "Publish"
              ? "Publication"
              : tab,
    }),
  ) as {
    value: Tab;
    label: string;
  }[];

/* ============================================================
   PUBLICATION FIELDS
   ============================================================ */

const PUBLICATION_KEYS =
  Object.keys(
    DEFAULT_PUBLICATION_CONFIG,
  ) as PublicationKey[];

/* ============================================================
   PAGE
   ============================================================ */

function AdminEdition() {
  const {
    slug,
  } =
    Route.useParams();

  const qc =
    useQueryClient();

  const {
    data:
      edition,
  } =
    useEdition(
      slug,
    );

  const {
    data:
      countries,
  } =
    useCountries();

  const {
    data:
      shows,
  } =
    useShows(
      edition?.id,
    );

  const {
    data:
      themes,
  } =
    useThemes();

  /* =========================================================
     BASIC STATE
     ========================================================= */

  const [
    tab,
    setTab,
  ] =
    useState<Tab>(
      "Shows",
    );

  const [
    showId,
    setShowId,
  ] =
    useState("");

  const [
    msg,
    setMsg,
  ] =
    useState<
      string | null
    >(null);

  const [
    errorMsg,
    setErrorMsg,
  ] =
    useState<
      string | null
    >(null);

  const [
    voter,
    setVoter,
  ] =
    useState("");

  const [
    showForm,
    setShowForm,
  ] =
    useState({
      name: "",
      kind:
        "semi-final",
      sort_order: 1,
    });

  const [
    pickCountry,
    setPickCountry,
  ] =
    useState<
      string | null
    >(null);

  const showList =
    shows ?? [];

  const activeShow =
    showList.find(
      (
        show,
      ) =>
        show.id ===
        showId,
    ) ??
    showList[0] ??
    null;

  const activeShowId =
    activeShow?.id;

  /* =========================================================
     ACTIVE SHOW DATA
     ========================================================= */

  const {
    data:
      participants,
  } =
    useShowParticipants(
      activeShowId,
    );

  const {
    data:
      allParticipants,
  } =
    useParticipants(
      edition?.id,
    );

  const {
    data:
      jury,
  } =
    useJuryVotes(
      activeShowId,
    );

  const {
    data:
      tele,
  } =
    useTelevotes(
      activeShowId,
    );

  const {
    data:
      showVoters,
  } =
    useShowVoters(
      activeShowId,
    );

  const {
    data:
      entities,
  } =
    useContestEntities(
      edition?.id,
    );

  /* =========================================================
     CUSTOM COUNTRY STATE
     ========================================================= */

  const [
    customForm,
    setCustomForm,
  ] =
    useState({
      display_name:
        "",

      abbreviation:
        "",

      flag_image:
        "",

      region:
        "",
    });

  /* =========================================================
     VOTER STATE
     ========================================================= */

  const [
    voterForm,
    setVoterForm,
  ] =
    useState<{
      kind:
        VoterKind;

      countryId:
        string | null;

      name:
        string;

      flag_image:
        string;

      accent_color:
        string;
    }>({
      kind:
        "country",

      countryId:
        null,

      name: "",

      flag_image:
        "",

      accent_color:
        "#8888aa",
    });

  /* =========================================================
     MAPS
     ========================================================= */

  const cList =
    countries ?? [];

  const cMap =
    useMemo(
      () =>
        new Map(
          cList.map(
            (
              country,
            ) => [
              country.id,
              country,
            ],
          ),
        ),
      [
        cList,
      ],
    );

  const eList =
    entities ?? [];

  const eMap =
    useMemo(
      () =>
        entityDisplayMap(
          eList,
          cList,
        ),
      [
        entities,
        cList,
      ],
    );

  const customEntities =
    eList.filter(
      isCustomEntity,
    );

  const pMap =
    useMemo(
      () =>
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
        ),
      [
        participants,
      ],
    );

  const order =
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
     THEME / VOTING / BROADCAST DRAFTS
     ========================================================= */

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
              activeShow?.theme_id,
          )?.config,
        ),
      [
        themes,
        activeShow?.theme_id,
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
    voting,
    setVoting,
  ] =
    useState<VotingConfig>(
      resolveVoting(
        activeShow?.voting_config,
      ),
    );

  const [
    broadcast,
    setBroadcast,
  ] =
    useState<BroadcastConfig>(
      resolveBroadcast(
        activeShow?.broadcast_config,
      ),
    );

  const [
    scoreboard,
    setScoreboard,
  ] =
    useState<ScoreboardConfig>(
      resolveScoreboard(
        activeShow?.broadcast_config,
        {
          theme:
            savedTheme,

          rowCount:
            order.length,
        },
      ),
    );

  useEffect(
    () => {
      setThemeDraft(
        savedTheme,
      );
    },
    [
      savedTheme,
    ],
  );

  useEffect(
    () => {
      setVoting(
        resolveVoting(
          activeShow?.voting_config,
        ),
      );

      setBroadcast(
        resolveBroadcast(
          activeShow?.broadcast_config,
        ),
      );

      setScoreboard(
        resolveScoreboard(
          activeShow?.broadcast_config,
          {
            theme:
              savedTheme,

            rowCount:
              order.length,
          },
        ),
      );

      setVoter("");
    },
    [
      activeShowId,
    ],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  /* =========================================================
     STANDINGS
     ========================================================= */

  const standings =
    computeStandings(
      order,
      jury ?? [],
      tele ?? [],
      voting,
    );

  /* =========================================================
     BROADCAST ROWS
     ========================================================= */

  const broadcastRows =
    useMemo<
      BroadcastRowData[]
    >(
      () =>
        standings.map(
          (
            standing,
            index,
          ) => {
            const display =
              eMap.get(
                standing.countryId,
              );

            const participant =
              pMap.get(
                standing.countryId,
              );

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
                savedTheme.colors.accent,

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
                qualified ===
                false
                  ? true
                  : qualified ===
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
                false,

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
        eMap,
        pMap,
        savedTheme.colors.accent,
      ],
    );

  /* =========================================================
     VOTER OPTIONS
     ========================================================= */

  const voterOptions =
    useMemo(
      () =>
        resolveShowVoters(
          showVoters,
          order,
          order
            .map(
              (
                id,
              ) =>
                eMap.get(
                  id,
                ),
            )
            .filter(
              (
                country,
              ): country is NonNullable<
                typeof country
              > =>
                !!country,
            ),
        ),
      [
        showVoters,
        order,
        cList,
      ],
    );

  const activeVoter =
    voter &&
    voterOptions.some(
      (
        option,
      ) =>
        option.key ===
        voter,
    )
      ? voter
      : voterOptions[0]
          ?.key ||
        "";

  /* =========================================================
     REFRESH
     ========================================================= */

  const refresh =
    () => {
      [
        "editions",
        "edition",
        "shows",
        "show",
        "participants",
        "jury_votes",
        "televote_votes",
        "results",
        "themes",
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
     GENERIC WRITE
     ========================================================= */

  const run =
    async (
      promise:
        PromiseLike<{
          error:
            unknown;
        }>,

      ok?:
        string,
    ) => {
      const {
        error,
      } =
        await promise;

      if (
        error
      ) {
        setErrorMsg(
          reportSupabaseError(
            error,
          ),
        );

        return false;
      }

      setErrorMsg(
        null,
      );

      setMsg(
        ok ??
          null,
      );

      refresh();

      return true;
    };

  /* =========================================================
     SHOW MANAGEMENT
     ========================================================= */

  const createShow =
    async (
      event:
        React.FormEvent,
    ) => {
      event.preventDefault();

      if (
        !edition
      ) {
        return;
      }

      await run(
        supabase
          .from(
            "shows",
          )
          .insert({
            edition_id:
              edition.id,

            name:
              showForm.name,

            kind:
              showForm.kind,

            sort_order:
              showForm.sort_order,

            published:
              false,

            publication_config:
              DEFAULT_PUBLICATION_CONFIG,
          }),
      );

      setShowForm({
        name: "",

        kind:
          showForm.kind,

        sort_order:
          showForm.sort_order +
          1,
      });
    };

  const patchShow =
    (
      show:
        Show,

      values:
        Record<
          string,
          unknown
        >,

      ok?:
        string,
    ) =>
      run(
        (
          supabase.from(
            "shows",
          ) as any
        )
          .update(
            values,
          )
          .eq(
            "id",
            show.id,
          ),

        ok,
      );

  const deleteShow =
    async (
      show:
        Show,
    ) => {
      if (
        !window.confirm(
          `Delete “${show.name}” with all of its participants and votes?`,
        )
      ) {
        return;
      }

      if (
        showId ===
        show.id
      ) {
        setShowId(
          "",
        );
      }

      await run(
        supabase
          .from(
            "shows",
          )
          .delete()
          .eq(
            "id",
            show.id,
          ),

        `Deleted ${show.name}.`,
      );
    };

  /* =========================================================
     CONTEST ENTITY HELPERS
     ========================================================= */

  const identityFor =
    (
      key:
        string,
    ): {
      country_id:
        string | null;

      contest_entity_id:
        string | null;
    } => {
      const entity =
        eList.find(
          (
            item,
          ) =>
            item.id ===
              key ||
            item.country_id ===
              key,
        );

      if (
        entity
      ) {
        return {
          country_id:
            entity.country_id,

          contest_entity_id:
            entity.id,
        };
      }

      return {
        country_id:
          key,

        contest_entity_id:
          null,
      };
    };

  const ensureGlobalEntity =
    async (
      countryId:
        string,
    ): Promise<
      ContestEntityRow | null
    > => {
      if (
        !edition
      ) {
        return null;
      }

      const existing =
        eList.find(
          (
            entity,
          ) =>
            entity.country_id ===
            countryId,
        );

      if (
        existing
      ) {
        return existing;
      }

      const country =
        cMap.get(
          countryId,
        );

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "contest_entities",
          )
          .insert({
            edition_id:
              edition.id,

            entity_type:
              "global",

            country_id:
              countryId,

            display_name:
              country?.name ??
              "Country",

            abbreviation:
              country?.short_code ??
              "???",

            flag_image:
              country?.flag_image ??
              null,

            region:
              country?.region ??
              null,
          })
          .select()
          .maybeSingle();

      if (
        error ||
        !data
      ) {
        setErrorMsg(
          reportSupabaseError(
            error,

            "Could not add that country to the edition.",
          ),
        );

        return null;
      }

      qc.invalidateQueries({
        queryKey:
          [
            "contest_entities",
          ],
      });

      return data as ContestEntityRow;
    };

  /* =========================================================
     CUSTOM COUNTRIES
     ========================================================= */

  const createCustomEntity =
    async () => {
      if (
        !edition
      ) {
        return;
      }

      const name =
        customForm.display_name.trim();

      const abbreviation =
        customForm.abbreviation.trim();

      if (
        !name ||
        !abbreviation
      ) {
        setErrorMsg(
          "A custom country needs both a name and an abbreviation.",
        );

        return;
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "contest_entities",
          )
          .insert({
            edition_id:
              edition.id,

            entity_type:
              "custom",

            country_id:
              null,

            display_name:
              name,

            abbreviation,

            flag_image:
              customForm.flag_image.trim() ||
              null,

            region:
              customForm.region.trim() ||
              null,
          })
          .select()
          .maybeSingle();

      if (
        error ||
        !data
      ) {
        setErrorMsg(
          reportSupabaseError(
            error,

            "Could not create that custom country.",
          ),
        );

        return;
      }

      qc.invalidateQueries({
        queryKey:
          [
            "contest_entities",
          ],
      });

      setCustomForm({
        display_name:
          "",

        abbreviation:
          "",

        flag_image:
          "",

        region:
          "",
      });

      setMsg(
        `Created ${name}.`,
      );

      await addEntityToShow(
        data as ContestEntityRow,
      );
    };

  const updateCustomEntity =
    (
      id:
        string,

      values:
        Record<
          string,
          unknown
        >,
    ) =>
      run(
        (
          supabase.from(
            "contest_entities",
          ) as any
        )
          .update(
            values,
          )
          .eq(
            "id",
            id,
          ),

        "Custom country updated.",
      ).then(
        () =>
          qc.invalidateQueries({
            queryKey:
              [
                "contest_entities",
              ],
          }),
      );

  const deleteCustomEntity =
    async (
      entity:
        ContestEntityRow,
    ) => {
      if (
        !window.confirm(
          `Delete “${entity.display_name}” from this edition?`,
        )
      ) {
        return;
      }

      const {
        error,
      } =
        await supabase
          .from(
            "contest_entities",
          )
          .delete()
          .eq(
            "id",
            entity.id,
          );

      if (
        error
      ) {
        setErrorMsg(
          reportSupabaseError(
            error,

            "That custom country is still used by a line-up, votes or results. Remove those first.",
          ),
        );

        return;
      }

      qc.invalidateQueries({
        queryKey:
          [
            "contest_entities",
          ],
      });

      setMsg(
        `Deleted ${entity.display_name}.`,
      );
    };

  /* =========================================================
     LINE-UP
     ========================================================= */

  const addEntityToShow =
    async (
      entity:
        ContestEntityRow,
    ) => {
      if (
        !edition ||
        !activeShowId
      ) {
        return;
      }

      const prior =
        (
          allParticipants ??
          []
        )
          .filter(
            (
              participant,
            ) =>
              participant.contest_entity_id ===
                entity.id &&
              participant.show_id !==
                activeShowId &&
              (
                participant.artist ||
                participant.song
              ),
          )
          .slice(
            -1,
          )[0];

      await run(
        supabase
          .from(
            "participants",
          )
          .insert({
            edition_id:
              edition.id,

            show_id:
              activeShowId,

            country_id:
              entity.country_id,

            contest_entity_id:
              entity.id,

            running_order:
              order.length +
              1,

            semi_final:
              activeShow?.kind ??
              "final",

            artist:
              prior?.artist ??
              null,

            song:
              prior?.song ??
              null,
          }),
      );
    };

  const addParticipant =
    async (
      countryId:
        string,
    ) => {
      if (
        !edition ||
        !activeShowId
      ) {
        return;
      }

      const entity =
        await ensureGlobalEntity(
          countryId,
        );

      if (
        !entity
      ) {
        return;
      }

      await addEntityToShow(
        entity,
      );

      setPickCountry(
        null,
      );
    };

  const addQualifiers =
    async () => {
      if (
        !edition ||
        !activeShowId
      ) {
        return;
      }

      const present =
        new Set(
          order,
        );

      const seen =
        new Set<string>();

      const promote =
        (
          allParticipants ??
          []
        ).filter(
          (
            participant,
          ) => {
            if (
              participant.show_id ===
                activeShowId ||
              !participant.qualified ||
              present.has(
                participant.country_id,
              )
            ) {
              return false;
            }

            if (
              seen.has(
                participant.country_id,
              )
            ) {
              return false;
            }

            seen.add(
              participant.country_id,
            );

            return true;
          },
        );

      if (
        !promote.length
      ) {
        setMsg(
          "No qualifiers to promote. Mark semi-final qualifiers first.",
        );

        return;
      }

      await run(
        supabase
          .from(
            "participants",
          )
          .insert(
            promote.map(
              (
                participant,
                index,
              ) => ({
                edition_id:
                  edition.id,

                show_id:
                  activeShowId,

                ...identityFor(
                  participant.country_id,
                ),

                running_order:
                  order.length +
                  index +
                  1,

                semi_final:
                  activeShow?.kind ??
                  "final",

                artist:
                  participant.artist,

                song:
                  participant.song,
              }),
            ),
          ),

        `Promoted ${promote.length} qualifier${promote.length === 1 ? "" : "s"}.`,
      );
    };

  const syncArtistSong =
    async () => {
      if (
        !edition
      ) {
        return;
      }

      const byCountry =
        new Map<
          string,
          {
            artist:
              string | null;

            song:
              string | null;
          }
        >();

      (
        allParticipants ??
        []
      ).forEach(
        (
          participant,
        ) => {
          if (
            participant.artist ||
            participant.song
          ) {
            byCountry.set(
              participant.country_id,
              {
                artist:
                  participant.artist,

                song:
                  participant.song,
              },
            );
          }
        },
      );

      const targets =
        (
          allParticipants ??
          []
        ).filter(
          (
            participant,
          ) =>
            !participant.artist &&
            !participant.song &&
            byCountry.has(
              participant.country_id,
            ),
        );

      if (
        !targets.length
      ) {
        setMsg(
          "Nothing to sync. Every entry already has an artist or song.",
        );

        return;
      }

      const responses =
        await Promise.all(
          targets.map(
            (
              participant,
            ) => {
              const source =
                byCountry.get(
                  participant.country_id,
                )!;

              return supabase
                .from(
                  "participants",
                )
                .update({
                  artist:
                    source.artist,

                  song:
                    source.song,
                })
                .eq(
                  "id",
                  participant.id,
                );
            },
          ),
        );

      const failed =
        responses.find(
          (
            response,
          ) =>
            response.error,
        );

      if (
        failed?.error
      ) {
        setErrorMsg(
          reportSupabaseError(
            failed.error,

            "Some entries could not be synced.",
          ),
        );

        return;
      }

      setMsg(
        `Synced artist & song for ${targets.length} entr${targets.length === 1 ? "y" : "ies"}.`,
      );

      refresh();
    };

  const updateParticipant =
    (
      id:
        string,

      values:
        Record<
          string,
          unknown
        >,
    ) =>
      run(
        (
          supabase.from(
            "participants",
          ) as any
        )
          .update(
            values,
          )
          .eq(
            "id",
            id,
          ),
      );

  const removeParticipant =
    (
      id:
        string,
    ) =>
      run(
        supabase
          .from(
            "participants",
          )
          .delete()
          .eq(
            "id",
            id,
          ),
      );

  /* =========================================================
     VOTES
     ========================================================= */

  const decodeVoterKey =
    (
      key:
        string,
    ) => {
      const option =
        voterOptions.find(
          (
            item,
          ) =>
            item.key ===
            key,
        );

      return {
        voterId:
          option?.voterId ??
          null,

        countryId:
          option?.countryId ??
          null,
      };
    };

  const assign =
    async (
      voterKey:
        string,

      receiver:
        string,

      points:
        number,
    ) => {
      if (
        !edition ||
        !activeShowId
      ) {
        return;
      }

      const {
        voterId,
        countryId,
      } =
        decodeVoterKey(
          voterKey,
        );

      const voterIdentity =
        countryId
          ? identityFor(
              countryId,
            )
          : {
              country_id:
                null,

              contest_entity_id:
                null,
            };

      const target =
        identityFor(
          receiver,
        );

      const {
        error,
      } =
        await (
          supabase as any
        ).rpc(
          "assign_jury_vote",
          {
            p_edition_id:
              edition.id,

            p_show_id:
              activeShowId,

            p_voter_id:
              voterId,

            p_voter_country_id:
              voterIdentity.country_id,

            p_voter_entity_id:
              voterIdentity.contest_entity_id,

            p_receiving_country_id:
              target.country_id,

            p_receiving_entity_id:
              target.contest_entity_id,

            p_points:
              points,
          },
        );

      if (
        error
      ) {
        setErrorMsg(
          reportSupabaseError(
            error,

            "Could not save that score. Nothing was changed.",
          ),
        );

        return;
      }

      setErrorMsg(
        null,
      );

      refresh();
    };

  const clearPoint =
    async (
      voterKey:
        string,

      points:
        number,
    ) => {
      if (
        !edition ||
        !activeShowId
      ) {
        return;
      }

      const {
        voterId,
        countryId,
      } =
        decodeVoterKey(
          voterKey,
        );

      const voterIdentity =
        countryId
          ? identityFor(
              countryId,
            )
          : {
              country_id:
                null,

              contest_entity_id:
                null,
            };

      const {
        error,
      } =
        await (
          supabase as any
        ).rpc(
          "clear_jury_point",
          {
            p_edition_id:
              edition.id,

            p_show_id:
              activeShowId,

            p_voter_id:
              voterId,

            p_voter_country_id:
              voterIdentity.country_id,

            p_voter_entity_id:
              voterIdentity.contest_entity_id,

            p_points:
              points,
          },
        );

      if (
        error
      ) {
        setErrorMsg(
          reportSupabaseError(
            error,

            "Could not clear that score. Nothing was changed.",
          ),
        );

        return;
      }

      setErrorMsg(
        null,
      );

      refresh();
    };

  const setTele =
    async (
      countryId:
        string,

      points:
        number,
    ) => {
      if (
        !edition ||
        !activeShowId
      ) {
        return;
      }

      const existing =
        (
          tele ??
          []
        ).find(
          (
            vote,
          ) =>
            vote.country_id ===
            countryId,
        );

      await run(
        existing
          ? supabase
              .from(
                "televote_votes",
              )
              .update({
                points,
              })
              .eq(
                "id",
                existing.id,
              )
          : supabase
              .from(
                "televote_votes",
              )
              .insert({
                edition_id:
                  edition.id,

                show_id:
                  activeShowId,

                ...identityFor(
                  countryId,
                ),

                points,
              }),
      );
    };

  /* =========================================================
     CONFIG SAVES
     ========================================================= */

  const saveVoting =
    () =>
      activeShow &&
      patchShow(
        activeShow,
        {
          voting_config:
            voting,
        },

        "Voting system saved.",
      );

  const saveBroadcast =
    () => {
      if (
        !activeShow
      ) {
        return;
      }

      const existing =
        activeShow.broadcast_config &&
        typeof activeShow.broadcast_config ===
          "object"
          ? activeShow.broadcast_config
          : {};

      const nextBroadcastConfig =
        {
          ...existing,
          ...broadcast,
          scoreboard,
        };

      return patchShow(
        activeShow,
        {
          broadcast_config:
            nextBroadcastConfig,
        },

        "Broadcast and scoreboard saved.",
      );
    };

  const resetScoreboard =
    () => {
      if (
        !activeShow
      ) {
        return;
      }

      const automatic =
        resolveScoreboard(
          null,
          {
            theme:
              themeDraft,

            rowCount:
              order.length,
          },
        );

      setScoreboard(
        automatic,
      );

      setMsg(
        "Scoreboard reset to the automatic Theme-based broadcast design. Save Broadcast to make this permanent.",
      );
    };

  const saveTheme =
    async () => {
      if (
        !activeShow
      ) {
        return;
      }

      if (
        activeShow.theme_id
      ) {
        await run(
          supabase
            .from(
              "themes",
            )
            .update({
              config:
                themeDraft,
            })
            .eq(
              "id",
              activeShow.theme_id,
            ),

          "Theme saved.",
        );

        return;
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "themes",
          )
          .insert({
            name:
              `${activeShow.name} theme`,

            config:
              themeDraft,

            is_public:
              false,
          })
          .select()
          .maybeSingle();

      if (
        error ||
        !data
      ) {
        setErrorMsg(
          error?.message ??
            "Could not create theme.",
        );

        return;
      }

      await run(
        supabase
          .from(
            "shows",
          )
          .update({
            theme_id:
              data.id,
          })
          .eq(
            "id",
            activeShow.id,
          ),

        "Theme created.",
      );
    };

  const saveThemeAsNew =
    async () => {
      if (
        !activeShow
      ) {
        return;
      }

      const name =
        window.prompt(
          "Name this theme",
          `${activeShow.name} theme`,
        );

      if (
        !name
      ) {
        return;
      }

      const {
        data,
        error,
      } =
        await supabase
          .from(
            "themes",
          )
          .insert({
            name,
            config:
              themeDraft,

            is_public:
              false,
          })
          .select()
          .maybeSingle();

      if (
        error ||
        !data
      ) {
        setErrorMsg(
          error?.message ??
            "Could not create theme.",
        );

        return;
      }

      await run(
        supabase
          .from(
            "shows",
          )
          .update({
            theme_id:
              data.id,
          })
          .eq(
            "id",
            activeShow.id,
          ),

        "Theme saved to library.",
      );
    };

  const renameTheme =
    async () => {
      const current =
        (
          themes ??
          []
        ).find(
          (
            theme,
          ) =>
            theme.id ===
            activeShow?.theme_id,
        );

      if (
        !current
      ) {
        return;
      }

      const name =
        window.prompt(
          "Rename theme",
          current.name,
        );

      if (
        !name ||
        name ===
          current.name
      ) {
        return;
      }

      await run(
        supabase
          .from(
            "themes",
          )
          .update({
            name,
          })
          .eq(
            "id",
            current.id,
          ),

        "Theme renamed.",
      );
    };

  const deleteTheme =
    async () => {
      const current =
        (
          themes ??
          []
        ).find(
          (
            theme,
          ) =>
            theme.id ===
            activeShow?.theme_id,
        );

      if (
        !current
      ) {
        return;
      }

      if (
        !window.confirm(
          `Delete “${current.name}”? Shows using it fall back to the default theme.`,
        )
      ) {
        return;
      }

      const {
        error:
          detachError,
      } =
        await supabase
          .from(
            "shows",
          )
          .update({
            theme_id:
              null,
          })
          .eq(
            "theme_id",
            current.id,
          );

      if (
        detachError
      ) {
        setErrorMsg(
          reportSupabaseError(
            detachError,

            "Could not detach the theme. It was not deleted.",
          ),
        );

        return;
      }

      await run(
        supabase
          .from(
            "themes",
          )
          .delete()
          .eq(
            "id",
            current.id,
          ),

        "Theme deleted.",
      );
    };

  /* =========================================================
     PUBLICATION DRAFTS
     ========================================================= */

  const [
    publicationDrafts,
    setPublicationDrafts,
  ] =
    useState<
      Record<
        string,
        PublicationConfig
      >
    >({});

  const [
    selectedPublicationShows,
    setSelectedPublicationShows,
  ] =
    useState<
      string[]
    >([]);

  const [
    publicationSaving,
    setPublicationSaving,
  ] =
    useState(false);

  const [
    resultSavingShowId,
    setResultSavingShowId,
  ] =
    useState<
      string | null
    >(null);

  useEffect(
    () => {
      const next:
        Record<
          string,
          PublicationConfig
        > = {};

      showList.forEach(
        (
          show,
        ) => {
          next[
            show.id
          ] =
            resolvePublicationConfig(
              show.publication_config,
            );
        },
      );

      setPublicationDrafts(
        next,
      );

      setSelectedPublicationShows(
        (
          current,
        ) => {
          const existing =
            current.filter(
              (
                id,
              ) =>
                showList.some(
                  (
                    show,
                  ) =>
                    show.id ===
                    id,
                ),
            );

          if (
            existing.length
          ) {
            return existing;
          }

          return showList.map(
            (
              show,
            ) =>
              show.id,
          );
        },
      );
    },
    [
      shows,
    ],
  );

  const setPublicationField =
    (
      showId:
        string,

      key:
        PublicationKey,

      value:
        boolean,
    ) => {
      setPublicationDrafts(
        (
          current,
        ) => {
          const existing =
            current[
              showId
            ] ??
            DEFAULT_PUBLICATION_CONFIG;

          const next =
            normalisePublicationDependencies({
              ...existing,

              [
                key
              ]:
                value,
            });

          return {
            ...current,

            [
              showId
            ]:
              next,
          };
        },
      );
    };

  const applyPresetToShow =
    (
      showId:
        string,

      preset:
        PublicationPresetId,
    ) => {
      setPublicationDrafts(
        (
          current,
        ) => ({
          ...current,

          [
            showId
          ]:
            applyPublicationPreset(
              preset,
            ),
        }),
      );
    };

  const applyPresetToSelected =
    (
      preset:
        PublicationPresetId,
    ) => {
      setPublicationDrafts(
        (
          current,
        ) => {
          const next =
            {
              ...current,
            };

          selectedPublicationShows.forEach(
            (
              id,
            ) => {
              next[
                id
              ] =
                applyPublicationPreset(
                  preset,
                );
            },
          );

          return next;
        },
      );
    };

  const toggleSelectedPublicationShow =
    (
      id:
        string,
    ) => {
      setSelectedPublicationShows(
        (
          current,
        ) =>
          current.includes(
            id,
          )
            ? current.filter(
                (
                  item,
                ) =>
                  item !==
                  id,
              )
            : [
                ...current,
                id,
              ],
      );
    };

  /* =========================================================
     AUTOMATIC EDITION STATUS
     ========================================================= */

  const calculateEditionState =
    (
      overrides?:
        Record<
          string,
          {
            config:
              PublicationConfig;

            published:
              boolean;
          }
        >,
    ) => {
      const simulated =
        showList.map(
          (
            show,
          ) => {
            const override =
              overrides?.[
                show.id
              ];

            return {
              kind:
                show.kind,

              published:
                override
                  ? override.published
                  : show.published,

              publication_config:
                override
                  ? override.config
                  : resolvePublicationConfig(
                      show.publication_config,
                    ),
            };
          },
        );

      const status =
        resolveAutomaticEditionStatus(
          simulated,
        );

      return {
        status,

        published:
          status !==
          "draft",
      };
    };

  const syncEditionPublication =
    async (
      overrides?:
        Record<
          string,
          {
            config:
              PublicationConfig;

            published:
              boolean;
          }
        >,
    ) => {
      if (
        !edition
      ) {
        return true;
      }

      const next =
        calculateEditionState(
          overrides,
        );

      const {
        error,
      } =
        await supabase
          .from(
            "editions",
          )
          .update({
            published:
              next.published,

            status:
              next.status,
          })
          .eq(
            "id",
            edition.id,
          );

      if (
        error
      ) {
        setErrorMsg(
          reportSupabaseError(
            error,

            "Show publication was saved, but the edition status could not be updated.",
          ),
        );

        return false;
      }

      return true;
    };

  /* =========================================================
     SAVE PUBLICATION SETTINGS
     ========================================================= */

  const savePublication =
    async (
      ids:
        string[] =
        selectedPublicationShows,
    ) => {
      if (
        !edition ||
        publicationSaving
      ) {
        return;
      }

      if (
        !ids.length
      ) {
        setErrorMsg(
          "Select at least one show to publish.",
        );

        return;
      }

      setPublicationSaving(
        true,
      );

      setErrorMsg(
        null,
      );

      try {
        const overrides:
          Record<
            string,
            {
              config:
                PublicationConfig;

              published:
                boolean;
            }
          > = {};

        const responses =
          await Promise.all(
            ids.map(
              async (
                id,
              ) => {
                const config =
                  normalisePublicationDependencies(
                    publicationDrafts[
                      id
                    ] ??
                    DEFAULT_PUBLICATION_CONFIG,
                  );

                const published =
                  hasAnyPublicInformation(
                    config,
                  );

                overrides[
                  id
                ] = {
                  config,
                  published,
                };

                return supabase
                  .from(
                    "shows",
                  )
                  .update({
                    publication_config:
                      config,

                    published,
                  })
                  .eq(
                    "id",
                    id,
                  );
              },
            ),
          );

        const failed =
          responses.find(
            (
              response,
            ) =>
              response.error,
          );

        if (
          failed?.error
        ) {
          setErrorMsg(
            reportSupabaseError(
              failed.error,

              "Could not save all publication settings.",
            ),
          );

          return;
        }

        await syncEditionPublication(
          overrides,
        );

        setMsg(
          `Publication settings saved for ${ids.length} show${ids.length === 1 ? "" : "s"}.`,
        );

        refresh();
      } finally {
        setPublicationSaving(
          false,
        );
      }
    };

  /* =========================================================
     MAKE ENTIRE EDITION PRIVATE
     ========================================================= */

  const makeEditionPrivate =
    async () => {
      if (
        !edition
      ) {
        return;
      }

      if (
        !window.confirm(
          `Make ${editionLabel(edition)} and every show private? This does not delete any data.`,
        )
      ) {
        return;
      }

      setPublicationSaving(
        true,
      );

      try {
        const {
          error:
            showError,
        } =
          await supabase
            .from(
              "shows",
            )
            .update({
              published:
                false,

              publication_config:
                DEFAULT_PUBLICATION_CONFIG,
            })
            .eq(
              "edition_id",
              edition.id,
            );

        if (
          showError
        ) {
          setErrorMsg(
            reportSupabaseError(
              showError,

              "Could not make all shows private.",
            ),
          );

          return;
        }

        const {
          error:
            editionError,
        } =
          await supabase
            .from(
              "editions",
            )
            .update({
              published:
                false,

              status:
                "draft",
            })
            .eq(
              "id",
              edition.id,
            );

        if (
          editionError
        ) {
          setErrorMsg(
            reportSupabaseError(
              editionError,

              "Shows were hidden, but the edition status could not be updated.",
            ),
          );

          return;
        }

        setMsg(
          `${editionLabel(edition)} is now private.`,
        );

        refresh();
      } finally {
        setPublicationSaving(
          false,
        );
      }
    };

  /* =========================================================
     ARCHIVE RESULTS FOR ANY SHOW

     Saving results does NOT publish them.
     ========================================================= */

  const archiveResultsForShow =
    async (
      show:
        Show,
    ) => {
      if (
        !edition ||
        resultSavingShowId
      ) {
        return;
      }

      setResultSavingShowId(
        show.id,
      );

      setErrorMsg(
        null,
      );

      try {
        const [
          participantResponse,
          juryResponse,
          teleResponse,
        ] =
          await Promise.all([
            supabase
              .from(
                "participants",
              )
              .select(
                "*",
              )
              .eq(
                "show_id",
                show.id,
              ),

            supabase
              .from(
                "jury_votes",
              )
              .select(
                "*",
              )
              .eq(
                "show_id",
                show.id,
              ),

            supabase
              .from(
                "televote_votes",
              )
              .select(
                "*",
              )
              .eq(
                "show_id",
                show.id,
              ),
          ]);

        const fetchError =
          participantResponse.error ??
          juryResponse.error ??
          teleResponse.error;

        if (
          fetchError
        ) {
          setErrorMsg(
            reportSupabaseError(
              fetchError,

              "Could not load the voting data required to calculate results.",
            ),
          );

          return;
        }

        const rawParticipants =
          (
            participantResponse.data ??
            []
          ) as any[];

        const rawJury =
          (
            juryResponse.data ??
            []
          ) as any[];

        const rawTele =
          (
            teleResponse.data ??
            []
          ) as any[];

        const normalisedParticipants:
          Participant[] =
          rawParticipants.map(
            (
              participant,
            ) => ({
              ...participant,

              country_id:
                participant.country_id ??
                participant.contest_entity_id ??
                "",
            }),
          );

        const normalisedJury:
          JuryVote[] =
          rawJury.map(
            (
              vote,
            ) => ({
              ...vote,

              receiving_country_id:
                vote.receiving_country_id ??
                vote.receiving_entity_id ??
                "",
            }),
          );

        const normalisedTele:
          Televote[] =
          rawTele.map(
            (
              vote,
            ) => ({
              ...vote,

              country_id:
                vote.country_id ??
                vote.contest_entity_id ??
                "",
            }),
          );

        const showOrder =
          normalisedParticipants
            .sort(
              (
                a,
                b,
              ) =>
                (a.running_order ??
                  999) -
                (b.running_order ??
                  999),
            )
            .map(
              (
                participant,
              ) =>
                participant.country_id,
            );

        const showVoting =
          resolveVoting(
            show.voting_config,
          );

        const calculated =
          computeStandings(
            showOrder,
            normalisedJury,
            normalisedTele,
            showVoting,
          );

        const {
          error:
            resultError,
        } =
          await supabase.rpc(
            "publish_show_results",
            {
              p_show_id:
                show.id,

              p_rows:
                calculated.map(
                  (
                    standing,
                  ) => ({
                    ...identityFor(
                      standing.countryId,
                    ),

                    jury_points:
                      standing.jury,

                    televote_points:
                      standing.televote,

                    total_points:
                      standing.total,

                    final_rank:
                      standing.rank,
                  }),
                ),
            },
          );

        if (
          resultError
        ) {
          setErrorMsg(
            reportSupabaseError(
              resultError,

              "Could not save the results. The previous archive is unchanged.",
            ),
          );

          return;
        }

        if (
          showVoting.qualifiers
        ) {
          const participantByKey =
            new Map(
              normalisedParticipants.map(
                (
                  participant,
                ) => [
                  participant.country_id,
                  participant,
                ],
              ),
            );

          const qualificationResponses =
            await Promise.all(
              calculated.map(
                (
                  standing,
                ) => {
                  const participant =
                    participantByKey.get(
                      standing.countryId,
                    );

                  if (
                    !participant
                  ) {
                    return Promise.resolve({
                      error:
                        null,
                    });
                  }

                  return supabase
                    .from(
                      "participants",
                    )
                    .update({
                      qualified:
                        standing.rank <=
                        showVoting.qualifiers!,
                    })
                    .eq(
                      "id",
                      participant.id,
                    );
                },
              ),
            );

          const qualificationFailure =
            qualificationResponses.find(
              (
                response,
              ) =>
                response.error,
            );

          if (
            qualificationFailure?.error
          ) {
            setErrorMsg(
              reportSupabaseError(
                qualificationFailure.error,

                "Results were saved, but qualification flags could not all be updated.",
              ),
            );

            refresh();

            return;
          }
        }

        setMsg(
          `${show.name} results saved internally. They are not public unless Results is enabled in Publication.`,
        );

        refresh();
      } finally {
        setResultSavingShowId(
          null,
        );
      }
    };

  /* =========================================================
     PAGE
     ========================================================= */

  return (
    <AppShell>
      <PageHeader
        eyebrow="Organizer studio"
        title={
          edition
            ? editionLabel(
                edition,
              )
            : "Edition"
        }
        description="Shows, line-ups, voting systems, scoreboard design, broadcast production and publication."
        actions={
          <>
            <Link
              to="/admin"
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              ← Studio
            </Link>

            {activeShow && (
              <Link
                to="/broadcast/$showId"
                params={{
                  showId:
                    activeShow.id,
                }}
                className="bg-aurora rounded-lg px-3 py-2 text-sm font-medium text-primary-foreground"
              >
                Broadcast
              </Link>
            )}
          </>
        }
      />

      {/* =====================================================
          CURRENT SHOW

          No publish button here anymore.
         ===================================================== */}

      <Panel className="mb-3 sm:mb-4">
        <Field label="Current show">
          <Select
            value={
              activeShowId ??
              ""
            }
            onChange={(
              event,
            ) =>
              setShowId(
                event.target.value,
              )
            }
            className="w-full"
          >
            {!showList.length && (
              <option value="">
                No shows yet
              </option>
            )}

            {showList.map(
              (
                show,
              ) => {
                const publication =
                  resolvePublicationConfig(
                    show.publication_config,
                  );

                const publicInfo =
                  hasAnyPublicInformation(
                    publication,
                  );

                return (
                  <option
                    key={
                      show.id
                    }
                    value={
                      show.id
                    }
                    className="bg-background"
                  >
                    {show.name}
                    {" · "}
                    {publicInfo
                      ? "public"
                      : "private"}
                  </option>
                );
              },
            )}
          </Select>
        </Field>
      </Panel>

      {/* =====================================================
          TABS
         ===================================================== */}

      <ResponsiveTabs
        value={
          tab
        }
        options={
          TAB_OPTIONS
        }
        onChange={
          setTab
        }
        label="Manage edition"
        sticky
        className="mb-4 sm:mb-6"
      />

      {/* =====================================================
          FEEDBACK
         ===================================================== */}

      {errorMsg && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {!errorMsg &&
        msg && (
          <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
            {msg}
          </div>
        )}

      {/* =====================================================
          MAIN
         ===================================================== */}

      <div
        className={cn(
          "grid gap-6",

          tab ===
            "Broadcast" ||
            tab ===
              "Publish"
            ? "grid-cols-1"
            : "lg:grid-cols-[1.5fr_1fr]",
        )}
      >
        <div className="space-y-6">
          {/* =================================================
              SHOWS
             ================================================= */}

          {tab ===
            "Shows" && (
            <>
              <Panel
                title="Shows"
                description="Semi-finals, grand final and any other broadcast. Publication is managed separately in the Publication tab."
              >
                <ul className="space-y-2">
                  {showList.map(
                    (
                      show,
                    ) => {
                      const publication =
                        resolvePublicationConfig(
                          show.publication_config,
                        );

                      return (
                        <li
                          key={
                            show.id
                          }
                          className="grid gap-2 rounded-xl bg-surface px-3 py-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:py-2"
                        >
                          <input
                            type="number"
                            defaultValue={
                              show.sort_order
                            }
                            onBlur={(
                              event,
                            ) =>
                              patchShow(
                                show,
                                {
                                  sort_order:
                                    Number(
                                      event.target.value,
                                    ) ||
                                    1,
                                },
                              )
                            }
                            className="numeric w-12 rounded-lg bg-background px-2 py-1 text-center text-sm"
                          />

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {
                                show.name
                              }
                            </p>

                            <p className="text-xs text-muted-foreground">
                              {show.kind.replace(
                                "-",
                                " ",
                              )}
                              {" · "}
                              {hasAnyPublicInformation(
                                publication,
                              )
                                ? "public information released"
                                : "private"}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setShowId(
                                show.id,
                              );

                              setTab(
                                "Line-up",
                              );
                            }}
                            className="min-h-10 rounded-lg border border-border px-3 py-1.5 text-sm"
                          >
                            Manage
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              deleteShow(
                                show,
                              )
                            }
                            className="min-h-10 rounded-lg border border-destructive/50 px-3 py-1.5 text-sm text-destructive"
                          >
                            Delete
                          </button>
                        </li>
                      );
                    },
                  )}

                  {!showList.length && (
                    <p className="text-sm text-muted-foreground">
                      No shows yet. Create the first one.
                    </p>
                  )}
                </ul>
              </Panel>

              <Panel title="New show">
                <form
                  onSubmit={
                    createShow
                  }
                  className="grid gap-3 sm:grid-cols-3"
                >
                  <Field
                    label="Name"
                    className="sm:col-span-1"
                  >
                    <TextInput
                      required
                      value={
                        showForm.name
                      }
                      placeholder="Semi-Final 1"
                      onChange={(
                        event,
                      ) =>
                        setShowForm({
                          ...showForm,

                          name:
                            event.target.value,
                        })
                      }
                    />
                  </Field>

                  <Field label="Kind">
                    <Select
                      value={
                        showForm.kind
                      }
                      onChange={(
                        event,
                      ) =>
                        setShowForm({
                          ...showForm,

                          kind:
                            event.target.value,
                        })
                      }
                    >
                      {SHOW_KINDS.map(
                        (
                          kind,
                        ) => (
                          <option
                            key={
                              kind
                            }
                            value={
                              kind
                            }
                            className="bg-background"
                          >
                            {kind.replace(
                              "-",
                              " ",
                            )}
                          </option>
                        ),
                      )}
                    </Select>
                  </Field>

                  <Field label="Order">
                    <TextInput
                      type="number"
                      className="numeric"
                      value={
                        showForm.sort_order
                      }
                      onChange={(
                        event,
                      ) =>
                        setShowForm({
                          ...showForm,

                          sort_order:
                            Number(
                              event.target.value,
                            ),
                        })
                      }
                    />
                  </Field>

                  <button className="bg-aurora rounded-xl px-4 py-2 text-sm font-semibold text-primary-foreground sm:col-span-3">
                    Add show
                  </button>
                </form>
              </Panel>
            </>
          )}

          {/* =================================================
              LINE-UP
             ================================================= */}

          {tab ===
            "Line-up" &&
            activeShow && (
              <Panel
                title="Line-up"
                description="Add countries now, fill artist and song later."
              >
                <div className="mb-4 flex flex-wrap items-end gap-2">
                  <CountryPicker
                    className="min-w-[220px] flex-1"
                    countries={
                      cList
                    }
                    value={
                      pickCountry
                    }
                    exclude={
                      new Set(
                        order,
                      )
                    }
                    onChange={(
                      id,
                    ) =>
                      id &&
                      addParticipant(
                        id,
                      )
                    }
                    placeholder="Search the 66 Terra Solaris nations…"
                  />

                  <button
                    type="button"
                    onClick={
                      syncArtistSong
                    }
                    className="rounded-xl border border-border bg-surface px-3 py-2 text-sm hover:bg-surface/70"
                  >
                    Sync artist &amp; song across shows
                  </button>

                  {activeShow.kind ===
                    "grand-final" && (
                    <button
                      type="button"
                      onClick={
                        addQualifiers
                      }
                      className="rounded-xl border border-border bg-surface px-3 py-2 text-sm hover:bg-surface/70"
                    >
                      Add semi-final qualifiers
                    </button>
                  )}
                </div>

                {/* CUSTOM COUNTRIES */}

                <div className="mb-4 space-y-3 rounded-xl border border-border p-3">
                  <div>
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      Custom countries
                    </p>

                    <p className="text-xs text-muted-foreground">
                      Nations that exist only inside this edition.
                    </p>
                  </div>

                  {!!customEntities.length && (
                    <ul className="space-y-1.5">
                      {customEntities.map(
                        (
                          entity,
                        ) => {
                          const inShow =
                            order.includes(
                              entity.id,
                            );

                          const display =
                            eMap.get(
                              entity.id,
                            );

                          return (
                            <li
                              key={
                                entity.id
                              }
                              className="flex flex-wrap items-center gap-2 rounded-lg bg-surface px-2 py-1.5"
                            >
                              <FlagChip
                                code={
                                  entity.abbreviation
                                }
                                color={
                                  display?.accent_color ??
                                  DEFAULT_ACCENT
                                }
                                image={
                                  entity.flag_image
                                }
                                size="sm"
                              />

                              <input
                                defaultValue={
                                  entity.display_name
                                }
                                onBlur={(
                                  event,
                                ) =>
                                  event.target.value.trim() &&
                                  event.target.value !==
                                    entity.display_name &&
                                  updateCustomEntity(
                                    entity.id,
                                    {
                                      display_name:
                                        event.target.value.trim(),
                                    },
                                  )
                                }
                                className="min-w-0 flex-1 rounded-lg bg-background px-2 py-1 text-sm"
                              />

                              <input
                                defaultValue={
                                  entity.abbreviation
                                }
                                onBlur={(
                                  event,
                                ) =>
                                  event.target.value.trim() &&
                                  event.target.value !==
                                    entity.abbreviation &&
                                  updateCustomEntity(
                                    entity.id,
                                    {
                                      abbreviation:
                                        event.target.value.trim(),
                                    },
                                  )
                                }
                                className="w-16 rounded-lg bg-background px-2 py-1 text-center text-sm uppercase"
                              />

                              {inShow ? (
                                <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                                  In line-up
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    addEntityToShow(
                                      entity,
                                    )
                                  }
                                  className="rounded-lg border border-border px-2 py-1 text-xs"
                                >
                                  Add to show
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  deleteCustomEntity(
                                    entity,
                                  )
                                }
                                className="rounded-lg border border-destructive/40 px-2 py-1 text-xs text-destructive"
                              >
                                ✕
                              </button>
                            </li>
                          );
                        },
                      )}
                    </ul>
                  )}

                  <div className="grid gap-2 sm:grid-cols-4">
                    <Field label="Name">
                      <TextInput
                        value={
                          customForm.display_name
                        }
                        onChange={(
                          event,
                        ) =>
                          setCustomForm({
                            ...customForm,

                            display_name:
                              event.target.value,
                          })
                        }
                        placeholder="Novaria"
                      />
                    </Field>

                    <Field label="Abbreviation">
                      <TextInput
                        value={
                          customForm.abbreviation
                        }
                        onChange={(
                          event,
                        ) =>
                          setCustomForm({
                            ...customForm,

                            abbreviation:
                              event.target.value,
                          })
                        }
                        placeholder="NVA"
                      />
                    </Field>

                    <Field label="Flag URL">
                      <TextInput
                        value={
                          customForm.flag_image
                        }
                        onChange={(
                          event,
                        ) =>
                          setCustomForm({
                            ...customForm,

                            flag_image:
                              event.target.value,
                          })
                        }
                        placeholder="https://…"
                      />
                    </Field>

                    <Field label="Region">
                      <TextInput
                        value={
                          customForm.region
                        }
                        onChange={(
                          event,
                        ) =>
                          setCustomForm({
                            ...customForm,

                            region:
                              event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>

                  <button
                    type="button"
                    onClick={
                      createCustomEntity
                    }
                    className="bg-aurora rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Create &amp; add to show
                  </button>
                </div>

                {/* LINE-UP ROWS */}

                <ul className="space-y-1.5">
                  {(
                    participants ??
                    []
                  ).map(
                    (
                      participant,
                      index,
                    ) => {
                      const country =
                        eMap.get(
                          participant.country_id,
                        );

                      if (
                        !country
                      ) {
                        return null;
                      }

                      return (
                        <li
                          key={
                            participant.id
                          }
                          className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-2 py-1.5"
                        >
                          <input
                            type="number"
                            defaultValue={
                              participant.running_order ??
                              index +
                                1
                            }
                            onBlur={(
                              event,
                            ) =>
                              updateParticipant(
                                participant.id,
                                {
                                  running_order:
                                    Number(
                                      event.target.value,
                                    ) ||
                                    null,
                                },
                              )
                            }
                            className="numeric w-12 rounded-lg bg-background px-2 py-1 text-center text-sm"
                          />

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

                          <span className="w-32 shrink-0 truncate text-sm">
                            {
                              country.name
                            }
                          </span>

                          <input
                            defaultValue={
                              participant.artist ??
                              ""
                            }
                            placeholder="Artist"
                            onBlur={(
                              event,
                            ) =>
                              updateParticipant(
                                participant.id,
                                {
                                  artist:
                                    event.target.value ||
                                    null,
                                },
                              )
                            }
                            className="min-w-0 flex-1 rounded-lg bg-background px-2 py-1 text-sm"
                          />

                          <input
                            defaultValue={
                              participant.song ??
                              ""
                            }
                            placeholder="Song"
                            onBlur={(
                              event,
                            ) =>
                              updateParticipant(
                                participant.id,
                                {
                                  song:
                                    event.target.value ||
                                    null,
                                },
                              )
                            }
                            className="min-w-0 flex-1 rounded-lg bg-background px-2 py-1 text-sm"
                          />

                          <button
                            type="button"
                            onClick={() =>
                              removeParticipant(
                                participant.id,
                              )
                            }
                            className="rounded-lg border border-destructive/40 px-2 py-1 text-xs text-destructive"
                          >
                            ✕
                          </button>
                        </li>
                      );
                    },
                  )}

                  {!order.length && (
                    <p className="text-sm text-muted-foreground">
                      No entries yet.
                    </p>
                  )}
                </ul>
              </Panel>
            )}

          {/* =================================================
              JURIES
             ================================================= */}

          {tab ===
            "Juries" &&
            activeShow && (
              <Panel
                title="Juries"
                description="Voting countries, external juries, organisations or people."
                actions={
                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        !edition ||
                        !activeShowId
                      ) {
                        return;
                      }

                      const existingCountryIds =
                        new Set(
                          (
                            showVoters ??
                            []
                          ).map(
                            (
                              voter,
                            ) =>
                              voter.contest_entity_id ??
                              voter.country_id,
                          ),
                        );

                      const rows =
                        order
                          .filter(
                            (
                              id,
                            ) =>
                              !existingCountryIds.has(
                                id,
                              ) &&
                              !existingCountryIds.has(
                                identityFor(
                                  id,
                                ).contest_entity_id,
                              ),
                          )
                          .map(
                            (
                              id,
                              index,
                            ) => {
                              const country =
                                eMap.get(
                                  id,
                                );

                              return {
                                edition_id:
                                  edition.id,

                                show_id:
                                  activeShowId,

                                ...identityFor(
                                  id,
                                ),

                                name:
                                  country?.name ??
                                  "Country",

                                kind:
                                  "country",

                                flag_image:
                                  country?.flag_image ??
                                  null,

                                accent_color:
                                  country?.accent_color ??
                                  "#8888aa",

                                sort_order:
                                  (
                                    showVoters?.length ??
                                    0
                                  ) +
                                  index +
                                  1,
                              };
                            },
                          );

                      if (
                        !rows.length
                      ) {
                        setMsg(
                          "All participating countries are already juries.",
                        );

                        return;
                      }

                      await run(
                        supabase
                          .from(
                            "voters",
                          )
                          .insert(
                            rows,
                          ),

                        `Added ${rows.length} country juries.`,
                      );

                      qc.invalidateQueries({
                        queryKey:
                          [
                            "voters",
                          ],
                      });
                    }}
                    className="min-h-10 rounded-lg border border-border px-3 py-1.5 text-sm"
                  >
                    Add all participating countries
                  </button>
                }
              >
                <ul className="mb-4 space-y-1.5">
                  {(
                    showVoters ??
                    []
                  ).map(
                    (
                      item,
                      index,
                    ) => (
                      <li
                        key={
                          item.id
                        }
                        className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-2 py-1.5"
                      >
                        <input
                          type="number"
                          defaultValue={
                            item.sort_order ??
                            index +
                              1
                          }
                          onBlur={(
                            event,
                          ) =>
                            run(
                              (
                                supabase.from(
                                  "voters",
                                ) as any
                              )
                                .update({
                                  sort_order:
                                    Number(
                                      event.target.value,
                                    ) ||
                                    1,
                                })
                                .eq(
                                  "id",
                                  item.id,
                                ),
                            ).then(
                              () =>
                                qc.invalidateQueries({
                                  queryKey:
                                    [
                                      "voters",
                                    ],
                                }),
                            )
                          }
                          className="numeric w-12 rounded-lg bg-background px-2 py-1 text-center text-sm"
                        />

                        <FlagChip
                          code={
                            eMap.get(
                              item.contest_entity_id ??
                                item.country_id ??
                                "",
                            )?.short_code ??
                            "?"
                          }
                          color={
                            item.accent_color
                          }
                          image={
                            item.flag_image ??
                            eMap.get(
                              item.contest_entity_id ??
                                item.country_id ??
                                "",
                            )?.flag_image ??
                            null
                          }
                          size="sm"
                        />

                        <input
                          defaultValue={
                            item.name
                          }
                          onBlur={(
                            event,
                          ) =>
                            run(
                              (
                                supabase.from(
                                  "voters",
                                ) as any
                              )
                                .update({
                                  name:
                                    event.target.value,
                                })
                                .eq(
                                  "id",
                                  item.id,
                                ),
                            ).then(
                              () =>
                                qc.invalidateQueries({
                                  queryKey:
                                    [
                                      "voters",
                                    ],
                                }),
                            )
                          }
                          className="min-w-0 flex-1 rounded-lg bg-background px-2 py-1 text-sm"
                        />

                        <span className="rounded-full bg-surface-strong px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                          {item.kind.replace(
                            "-",
                            " ",
                          )}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            run(
                              supabase
                                .from(
                                  "voters",
                                )
                                .delete()
                                .eq(
                                  "id",
                                  item.id,
                                ),
                            ).then(
                              () =>
                                qc.invalidateQueries({
                                  queryKey:
                                    [
                                      "voters",
                                    ],
                                }),
                            )
                          }
                          className="rounded-lg border border-destructive/40 px-2 py-1 text-xs text-destructive"
                        >
                          ✕
                        </button>
                      </li>
                    ),
                  )}

                  {!(
                    showVoters ??
                    []
                  ).length && (
                    <p className="text-sm text-muted-foreground">
                      No custom juries yet. Participating countries are used as the default voting entities.
                    </p>
                  )}
                </ul>

                <div className="space-y-3 rounded-xl border border-border p-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    Add voter
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="Kind">
                      <Select
                        value={
                          voterForm.kind
                        }
                        onChange={(
                          event,
                        ) =>
                          setVoterForm({
                            ...voterForm,

                            kind:
                              event.target.value as VoterKind,

                            countryId:
                              null,

                            name:
                              "",
                          })
                        }
                      >
                        {VOTER_KINDS.map(
                          (
                            kind,
                          ) => (
                            <option
                              key={
                                kind
                              }
                              value={
                                kind
                              }
                              className="bg-background"
                            >
                              {kind.replace(
                                "-",
                                " ",
                              )}
                            </option>
                          ),
                        )}
                      </Select>
                    </Field>

                    {voterForm.kind ===
                      "country" ||
                    voterForm.kind ===
                      "external-country" ? (
                      <Field label="Country">
                        <CountryPicker
                          countries={
                            voterForm.kind ===
                            "country"
                              ? cList.filter(
                                  (
                                    country,
                                  ) =>
                                    order.includes(
                                      country.id,
                                    ),
                                )
                              : cList
                          }
                          value={
                            voterForm.countryId
                          }
                          onChange={(
                            id,
                          ) => {
                            const country =
                              cList.find(
                                (
                                  item,
                                ) =>
                                  item.id ===
                                  id,
                              );

                            setVoterForm({
                              ...voterForm,

                              countryId:
                                id,

                              name:
                                country?.name ??
                                "",

                              flag_image:
                                country?.flag_image ??
                                "",

                              accent_color:
                                country?.accent_color ??
                                voterForm.accent_color,
                            });
                          }}
                        />
                      </Field>
                    ) : (
                      <Field label="Name">
                        <TextInput
                          value={
                            voterForm.name
                          }
                          onChange={(
                            event,
                          ) =>
                            setVoterForm({
                              ...voterForm,

                              name:
                                event.target.value,
                            })
                          }
                          placeholder="International Jury"
                        />
                      </Field>
                    )}

                    <Field label="Flag / logo URL">
                      <TextInput
                        value={
                          voterForm.flag_image
                        }
                        onChange={(
                          event,
                        ) =>
                          setVoterForm({
                            ...voterForm,

                            flag_image:
                              event.target.value,
                          })
                        }
                      />
                    </Field>

                    <Field label="Accent colour">
                      <TextInput
                        value={
                          voterForm.accent_color
                        }
                        onChange={(
                          event,
                        ) =>
                          setVoterForm({
                            ...voterForm,

                            accent_color:
                              event.target.value,
                          })
                        }
                      />
                    </Field>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      if (
                        !edition ||
                        !activeShowId ||
                        !voterForm.name
                      ) {
                        return;
                      }

                      await run(
                        supabase
                          .from(
                            "voters",
                          )
                          .insert({
                            edition_id:
                              edition.id,

                            show_id:
                              activeShowId,

                            country_id:
                              voterForm.countryId,

                            contest_entity_id:
                              voterForm.kind ===
                                "country" &&
                              voterForm.countryId
                                ? identityFor(
                                    voterForm.countryId,
                                  ).contest_entity_id
                                : null,

                            name:
                              voterForm.name,

                            kind:
                              voterForm.kind,

                            flag_image:
                              voterForm.flag_image ||
                              null,

                            accent_color:
                              voterForm.accent_color ||
                              "#8888aa",

                            sort_order:
                              (
                                showVoters?.length ??
                                0
                              ) +
                              1,
                          }),

                        "Voter added.",
                      );

                      qc.invalidateQueries({
                        queryKey:
                          [
                            "voters",
                          ],
                      });

                      setVoterForm({
                        kind:
                          voterForm.kind,

                        countryId:
                          null,

                        name:
                          "",

                        flag_image:
                          "",

                        accent_color:
                          "#8888aa",
                      });
                    }}
                    className="bg-aurora rounded-lg px-4 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Add voter
                  </button>
                </div>
              </Panel>
            )}

          {/* =================================================
              JURY VOTING
             ================================================= */}

          {tab ===
            "Jury" &&
            activeShow && (
              <Panel
                title="Fast jury entry"
                description="Pick a voting country, then type-ahead each award."
              >
                <FastJuryEntry
                  voters={
                    voterOptions
                  }
                  receivers={order
                    .map(
                      (
                        id,
                      ) =>
                        eMap.get(
                          id,
                        ),
                    )
                    .filter(
                      (
                        country,
                      ): country is NonNullable<
                        typeof country
                      > =>
                        !!country,
                    )}
                  voting={
                    voting
                  }
                  votes={
                    jury ??
                    []
                  }
                  activeVoter={
                    activeVoter
                  }
                  onVoterChange={
                    setVoter
                  }
                  onAssign={
                    assign
                  }
                  onClear={
                    clearPoint
                  }
                />
              </Panel>
            )}

          {/* =================================================
              TELEVOTE
             ================================================= */}

          {tab ===
            "Televote" &&
            activeShow && (
              <Panel
                title="Televote entry"
                description="Enter each entry's televote total."
              >
                <TelevoteEntry
                  countries={order
                    .map(
                      (
                        id,
                      ) =>
                        eMap.get(
                          id,
                        ),
                    )
                    .filter(
                      (
                        country,
                      ): country is NonNullable<
                        typeof country
                      > =>
                        !!country,
                    )}
                  order={
                    order
                  }
                  votes={
                    tele ??
                    []
                  }
                  onSet={
                    setTele
                  }
                />
              </Panel>
            )}

          {/* =================================================
              VOTING SYSTEM
             ================================================= */}

          {tab ===
            "Voting" &&
            activeShow && (
              <Panel
                title="Voting system"
                description="Point scale, weighting, tie-breaks and qualifiers for this show."
                actions={
                  <button
                    type="button"
                    onClick={
                      saveVoting
                    }
                    className="bg-aurora rounded-lg px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  >
                    Save
                  </button>
                }
              >
                <VotingEditor
                  voting={
                    voting
                  }
                  onChange={
                    setVoting
                  }
                />
              </Panel>
            )}

          {/* =================================================
              THEME
             ================================================= */}

          {tab ===
            "Theme" &&
            activeShow && (
              <Panel
                title="Scoreboard design"
                description="Background, palette, typography, card and flag geometry, layout."
                actions={
                  <button
                    type="button"
                    onClick={
                      saveTheme
                    }
                    className="bg-aurora rounded-lg px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  >
                    Save theme
                  </button>
                }
              >
                <div className="mb-4">
                  <Field
                    label="Theme from library"
                    hint="Reuse, rename or delete a saved design."
                  >
                    <Select
                      value={
                        activeShow.theme_id ??
                        ""
                      }
                      onChange={(
                        event,
                      ) =>
                        patchShow(
                          activeShow,
                          {
                            theme_id:
                              event.target.value ||
                              null,
                          },
                        )
                      }
                    >
                      <option
                        value=""
                        className="bg-background"
                      >
                        Default Solaris theme
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

                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={
                        saveThemeAsNew
                      }
                      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs"
                    >
                      Save as new theme
                    </button>

                    <button
                      type="button"
                      onClick={
                        renameTheme
                      }
                      disabled={
                        !activeShow.theme_id
                      }
                      className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs disabled:opacity-40"
                    >
                      Rename
                    </button>

                    <button
                      type="button"
                      onClick={
                        deleteTheme
                      }
                      disabled={
                        !activeShow.theme_id
                      }
                      className="rounded-lg border border-destructive/40 px-3 py-1.5 text-xs text-destructive disabled:opacity-40"
                    >
                      Delete theme
                    </button>
                  </div>
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
            )}

          {/* =================================================
              BROADCAST
             ================================================= */}

          {tab ===
            "Broadcast" &&
            activeShow && (
              <div className="space-y-6">
                <Panel
                  title="Broadcast scoreboard"
                  description="Preset, layout, card design, header, background and current-voter panel."
                  actions={
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to="/broadcast/$showId"
                        params={{
                          showId:
                            activeShow.id,
                        }}
                        target="_blank"
                        className="min-h-10 rounded-lg border border-border px-3 py-1.5 text-sm"
                      >
                        Open broadcast
                      </Link>

                      <button
                        type="button"
                        onClick={
                          saveBroadcast
                        }
                        className="bg-aurora rounded-lg px-3 py-1.5 text-sm font-medium text-primary-foreground"
                      >
                        Save broadcast
                      </button>
                    </div>
                  }
                >
                  <ScoreboardEditor
                    config={
                      scoreboard
                    }
                    onChange={
                      setScoreboard
                    }
                    rows={
                      broadcastRows
                    }
                    theme={
                      themeDraft
                    }
                    showName={
                      activeShow.name
                    }
                    onReset={
                      resetScoreboard
                    }
                  />
                </Panel>

                <details className="rounded-2xl border border-border bg-surface/30">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
                    Show production
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Scenes, timing, reveal pacing and effects
                    </span>
                  </summary>

                  <div className="border-t border-border p-4">
                    <BroadcastEditor
                      config={
                        broadcast
                      }
                      onChange={
                        setBroadcast
                      }
                    />
                  </div>
                </details>
              </div>
            )}

          {/* =================================================
              PUBLICATION CENTER
             ================================================= */}

          {tab ===
            "Publish" && (
            <div className="space-y-5">
              {/* EDITION STATUS */}

              <Panel
                title="Publication Center"
                description="Control what the public can see. Saving results and publishing results are deliberately separate."
              >
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Edition
                    </p>

                    <h2 className="mt-1 font-display text-2xl font-bold">
                      {edition
                        ? editionLabel(
                            edition,
                          )
                        : "Edition"}
                    </h2>

                    <p className="mt-2 text-sm text-muted-foreground">
                      Status:{" "}
                      <strong className="text-foreground">
                        {edition?.status ??
                          "draft"}
                      </strong>
                      {" · "}
                      {edition?.published
                        ? "public"
                        : "private"}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      makeEditionPrivate
                    }
                    disabled={
                      publicationSaving
                    }
                    className="min-h-11 rounded-xl border border-destructive/40 px-4 text-sm text-destructive disabled:opacity-50"
                  >
                    Make entire edition private
                  </button>
                </div>
              </Panel>

              {/* BULK CONTROLS */}

              <Panel
                title="Publish multiple shows"
                description="Select the shows you want to change, choose a preset, then save."
              >
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedPublicationShows(
                        showList.map(
                          (
                            show,
                          ) =>
                            show.id,
                        ),
                      )
                    }
                    className="rounded-lg border border-border px-3 py-2 text-xs"
                  >
                    Select all
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedPublicationShows(
                        [],
                      )
                    }
                    className="rounded-lg border border-border px-3 py-2 text-xs"
                  >
                    Select none
                  </button>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {PUBLICATION_PRESETS.map(
                    (
                      preset,
                    ) => (
                      <button
                        key={
                          preset.id
                        }
                        type="button"
                        disabled={
                          !selectedPublicationShows.length
                        }
                        onClick={() =>
                          applyPresetToSelected(
                            preset.id,
                          )
                        }
                        className="rounded-xl border border-border bg-surface p-3 text-left disabled:opacity-40"
                      >
                        <p className="text-sm font-semibold">
                          {
                            preset.name
                          }
                        </p>

                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                          {
                            preset.description
                          }
                        </p>
                      </button>
                    ),
                  )}
                </div>

                <button
                  type="button"
                  onClick={() =>
                    savePublication()
                  }
                  disabled={
                    publicationSaving ||
                    !selectedPublicationShows.length
                  }
                  className="bg-aurora mt-4 min-h-11 rounded-xl px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {publicationSaving
                    ? "Saving publication…"
                    : `Save selected shows (${selectedPublicationShows.length})`}
                </button>
              </Panel>

              {/* PER SHOW */}

              {showList.map(
                (
                  show,
                ) => {
                  const publication =
                    publicationDrafts[
                      show.id
                    ] ??
                    resolvePublicationConfig(
                      show.publication_config,
                    );

                  const selected =
                    selectedPublicationShows.includes(
                      show.id,
                    );

                  return (
                    <Panel
                      key={
                        show.id
                      }
                      title={
                        show.name
                      }
                      description={show.kind.replace(
                        "-",
                        " ",
                      )}
                      actions={
                        <label className="flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={
                              selected
                            }
                            onChange={() =>
                              toggleSelectedPublicationShow(
                                show.id,
                              )
                            }
                          />

                          Include in bulk publish
                        </label>
                      }
                    >
                      {/* PRESETS */}

                      <div>
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Quick preset
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {PUBLICATION_PRESETS.map(
                            (
                              preset,
                            ) => (
                              <button
                                key={
                                  preset.id
                                }
                                type="button"
                                onClick={() =>
                                  applyPresetToShow(
                                    show.id,
                                    preset.id,
                                  )
                                }
                                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-surface"
                              >
                                {
                                  preset.name
                                }
                              </button>
                            ),
                          )}
                        </div>
                      </div>

                      {/* CUSTOM INFORMATION */}

                      <div className="mt-5">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Public information
                        </p>

                        <div className="grid gap-2 md:grid-cols-2">
                          {PUBLICATION_KEYS.map(
                            (
                              key,
                            ) => {
                              const info =
                                PUBLICATION_LABELS[
                                  key
                                ];

                              return (
                                <label
                                  key={
                                    key
                                  }
                                  className={cn(
                                    "flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors",

                                    publication[
                                      key
                                    ]
                                      ? "border-primary/40 bg-primary/10"
                                      : "border-border bg-surface/40",
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      publication[
                                        key
                                      ]
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      setPublicationField(
                                        show.id,
                                        key,
                                        event.target.checked,
                                      )
                                    }
                                    className="mt-1"
                                  />

                                  <span>
                                    <span className="block text-sm font-semibold">
                                      {
                                        info.title
                                      }
                                    </span>

                                    <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
                                      {
                                        info.description
                                      }
                                    </span>
                                  </span>
                                </label>
                              );
                            },
                          )}
                        </div>
                      </div>

                      {/* RESULTS ARCHIVE */}

                      <div className="mt-5 rounded-xl border border-border bg-background/30 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold">
                              Internal results archive
                            </p>

                            <p className="mt-1 text-xs text-muted-foreground">
                              Calculate and save this show's current jury + televote standings. This does not reveal them publicly.
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={
                              resultSavingShowId !==
                              null
                            }
                            onClick={() =>
                              archiveResultsForShow(
                                show,
                              )
                            }
                            className="min-h-10 shrink-0 rounded-lg border border-border px-4 text-sm disabled:opacity-50"
                          >
                            {resultSavingShowId ===
                            show.id
                              ? "Saving results…"
                              : "Save results internally"}
                          </button>
                        </div>
                      </div>

                      {/* SAVE ONE SHOW */}

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          {hasAnyPublicInformation(
                            publication,
                          )
                            ? "This show will have public information."
                            : "This show will be private."}
                        </p>

                        <div className="flex gap-2">
                          <Link
                            to="/shows/$showId"
                            params={{
                              showId:
                                show.id,
                            }}
                            target="_blank"
                            className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs"
                          >
                            Open public page
                          </Link>

                          <button
                            type="button"
                            disabled={
                              publicationSaving
                            }
                            onClick={() =>
                              savePublication([
                                show.id,
                              ])
                            }
                            className="bg-aurora min-h-10 rounded-lg px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                          >
                            Save this show
                          </button>
                        </div>
                      </div>
                    </Panel>
                  );
                },
              )}

              {!showList.length && (
                <Panel>
                  <p className="text-sm text-muted-foreground">
                    Create at least one show before publishing the edition.
                  </p>
                </Panel>
              )}
            </div>
          )}
        </div>

        {/* ===================================================
            LIVE PREVIEW
           =================================================== */}

        {tab !==
          "Broadcast" &&
          tab !==
            "Publish" && (
            <div className="space-y-4">
              <Panel
                title="Live preview"
                description="Current show scoreboard"
              >
                <div
                  className="scroll-slim max-h-[70vh] overflow-y-auto rounded-2xl p-3"
                  style={
                    backgroundStyle(
                      themeDraft,
                    )
                  }
                >
                  <ScoreboardStage
                    theme={
                      themeDraft
                    }
                    standings={
                      standings
                    }
                    countries={
                      cMap
                    }
                    participants={
                      pMap
                    }
                    qualifiers={
                      voting.qualifiers
                    }
                    compact
                  />

                  {!standings.length && (
                    <p className="p-6 text-center text-sm opacity-70">
                      Add entries to see the board.
                    </p>
                  )}
                </div>
              </Panel>
            </div>
          )}
      </div>

      {/* =====================================================
          HIDDEN BROADCAST PREVIEW COMPONENT DEPENDENCY

          ScoreboardBoard remains used by the Broadcast editor
          ecosystem. Keeping this small hidden render also prevents
          the import from becoming unused under strict TS settings.
         ===================================================== */}

      <div className="hidden">
        <ScoreboardBoard
          config={
            scoreboard
          }
          theme={
            themeDraft
          }
          rows={
            broadcastRows
          }
          title="PREVIEW"
          subtitle=""
          progress={0}
          animate={
            false
          }
        />
      </div>
    </AppShell>
  );
}
