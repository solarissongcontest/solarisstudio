import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  supabase,
} from "@/integrations/supabase/client";

import type {
  ContestEntityRow,
} from "./entities";

import type {
  PublicationConfig,
} from "./publication";

/* ============================================================
   TYPES
   ============================================================ */

export type Country = {
  id: string;

  name: string;

  native_name:
    | string
    | null;

  short_code: string;

  flag_image:
    | string
    | null;

  region: string;

  accent_color: string;

  description:
    | string
    | null;

  first_participation:
    | number
    | null;
};

export type Theme = {
  id: string;

  name: string;

  description:
    | string
    | null;

  config:
    Record<
      string,
      unknown
    >;

  is_public: boolean;
};

export type Edition = {
  id: string;

  edition_number:
    | number
    | null;

  name: string;

  year:
    | number
    | null;

  slug: string;

  description:
    | string
    | null;

  host_country_id:
    | string
    | null;

  host_city:
    | string
    | null;

  logo:
    | string
    | null;

  theme_id:
    | string
    | null;

  status: string;

  published: boolean;
};

export type Show = {
  id: string;

  edition_id: string;

  name: string;

  kind: string;

  sort_order: number;

  /**
   * Whether the public show route exists.
   *
   * This no longer means every piece of information is public.
   * publication_config controls the individual information layers.
   */
  published: boolean;

  status: string;

  qualifier_count:
    | number
    | null;

  theme_id:
    | string
    | null;

  voting_config:
    | Record<
        string,
        unknown
      >
    | null;

  broadcast_config:
    | Record<
        string,
        unknown
      >
    | null;

  /**
   * Controls which parts of a show the public can see.
   */
  publication_config:
    | PublicationConfig
    | null;
};

export const SHOW_KINDS = [
  "semi-final",
  "grand-final",
  "special",
  "other",
] as const;

/* ============================================================
   PARTICIPANTS
   ============================================================ */

/**
 * Identity note:
 *
 * country_id / receiving_country_id contain the canonical
 * contest identity after fetching.
 *
 * Global nations use their country id.
 * Edition-only custom nations use their contest entity id.
 */

export type Participant = {
  id: string;

  edition_id: string;

  show_id:
    | string
    | null;

  country_id: string;

  contest_entity_id:
    | string
    | null;

  artist:
    | string
    | null;

  song:
    | string
    | null;

  running_order:
    | number
    | null;

  semi_final: string;

  qualified:
    | boolean
    | null;

  notes:
    | string
    | null;
};

/* ============================================================
   JURY VOTES
   ============================================================ */

export type JuryVote = {
  id: string;

  edition_id: string;

  show_id:
    | string
    | null;

  /**
   * Legacy/global country voter.
   *
   * Empty string is possible for custom juries.
   */
  voter_country_id: string;

  voter_id?:
    | string
    | null;

  voter_entity_id?:
    | string
    | null;

  receiving_country_id:
    string;

  receiving_entity_id?:
    | string
    | null;

  points: number;
};

/* ============================================================
   VOTERS
   ============================================================ */

export const VOTER_KINDS = [
  "country",
  "external-country",
  "organization",
  "person",
  "custom",
] as const;

export type VoterKind =
  (typeof VOTER_KINDS)[number];

export type Voter = {
  id: string;

  edition_id: string;

  show_id:
    | string
    | null;

  country_id:
    | string
    | null;

  contest_entity_id?:
    | string
    | null;

  name: string;

  kind: VoterKind;

  flag_image:
    | string
    | null;

  accent_color: string;

  sort_order: number;

  created_at: string;
};

export type VoterOption = {
  key: string;

  voterId:
    | string
    | null;

  countryId:
    | string
    | null;

  name: string;

  short_code:
    | string
    | null;

  flag_image:
    | string
    | null;

  accent_color: string;
};

/* ============================================================
   VOTER HELPERS
   ============================================================ */

export function voterKey(
  voter: {
    voterId?:
      | string
      | null;

    countryId?:
      | string
      | null;
  },
) {
  return voter.voterId
    ? `v:${voter.voterId}`
    : `c:${voter.countryId}`;
}

export function voterOptionsFromVoters(
  voters: Voter[],
  countries: Country[],
): VoterOption[] {
  const countryMap =
    new Map(
      countries.map(
        (country) => [
          country.id,
          country,
        ],
      ),
    );

  return voters.map(
    (voter) => {
      const identity =
        voter.country_id ??
        voter.contest_entity_id;

      const country =
        identity
          ? countryMap.get(
              identity,
            )
          : undefined;

      return {
        key:
          `v:${voter.id}`,

        voterId:
          voter.id,

        countryId:
          identity ??
          null,

        name:
          voter.name ||
          country?.name ||
          "Voter",

        short_code:
          country?.short_code ??
          null,

        flag_image:
          voter.flag_image ??
          country?.flag_image ??
          null,

        accent_color:
          voter.accent_color ||
          country?.accent_color ||
          "#8888aa",
      };
    },
  );
}

export function voterOptionsFromCountries(
  countryIds: string[],
  countries: Country[],
): VoterOption[] {
  const countryMap =
    new Map(
      countries.map(
        (country) => [
          country.id,
          country,
        ],
      ),
    );

  return countryIds
    .map(
      (id) =>
        countryMap.get(
          id,
        ),
    )
    .filter(
      (
        country,
      ): country is Country =>
        !!country,
    )
    .map(
      (country) => ({
        key:
          `c:${country.id}`,

        voterId:
          null,

        countryId:
          country.id,

        name:
          country.name,

        short_code:
          country.short_code,

        flag_image:
          country.flag_image,

        accent_color:
          country.accent_color,
      }),
    );
}

export function resolveShowVoters(
  voters:
    | Voter[]
    | undefined,

  participantCountryIds:
    string[],

  countries:
    Country[],
): VoterOption[] {
  if (
    voters &&
    voters.length
  ) {
    return voterOptionsFromVoters(
      voters,
      countries,
    );
  }

  return voterOptionsFromCountries(
    participantCountryIds,
    countries,
  );
}

/* ============================================================
   TELEVOTE
   ============================================================ */

export type Televote = {
  id: string;

  edition_id: string;

  show_id:
    | string
    | null;

  country_id: string;

  contest_entity_id?:
    | string
    | null;

  points: number;
};

/* ============================================================
   RESULTS
   ============================================================ */

export type ResultRow = {
  id: string;

  edition_id: string;

  show_id:
    | string
    | null;

  country_id: string;

  contest_entity_id?:
    | string
    | null;

  jury_points: number;

  televote_points: number;

  total_points: number;

  final_rank:
    | number
    | null;
};

/* ============================================================
   FETCH HELPERS
   ============================================================ */

function canonicalise(
  table: string,
  row: any,
) {
  if (
    !row
  ) {
    return row;
  }

  if (
    table ===
    "jury_votes"
  ) {
    return {
      ...row,

      receiving_country_id:
        row.receiving_country_id ??
        row.receiving_entity_id ??
        "",
    };
  }

  if (
    table ===
      "participants" ||
    table ===
      "televote_votes" ||
    table ===
      "results"
  ) {
    return {
      ...row,

      country_id:
        row.country_id ??
        row.contest_entity_id ??
        "",
    };
  }

  return row;
}

async function all<T>(
  table: string,
  apply?: (
    query: any,
  ) => any,
): Promise<T[]> {
  let query:
    any =
    (
      supabase as any
    )
      .from(
        table,
      )
      .select(
        "*",
      );

  if (
    apply
  ) {
    query =
      apply(
        query,
      );
  }

  const {
    data,
    error,
  } =
    await query;

  if (
    error
  ) {
    throw error;
  }

  return (
    (
      data ??
      []
    ) as any[]
  ).map(
    (
      row,
    ) =>
      canonicalise(
        table,
        row,
      ),
  ) as T[];
}

/* ============================================================
   COUNTRIES
   ============================================================ */

export function useCountries() {
  return useQuery({
    queryKey:
      [
        "countries",
      ],

    queryFn:
      () =>
        all<Country>(
          "countries",

          (
            query,
          ) =>
            query.order(
              "name",
            ),
        ),

    staleTime:
      5 *
      60 *
      1000,
  });
}

/* ============================================================
   THEMES
   ============================================================ */

export function useThemes() {
  return useQuery({
    queryKey:
      [
        "themes",
      ],

    queryFn:
      () =>
        all<Theme>(
          "themes",

          (
            query,
          ) =>
            query.order(
              "name",
            ),
        ),
  });
}

/* ============================================================
   EDITIONS
   ============================================================ */

export function useEditions() {
  return useQuery({
    queryKey:
      [
        "editions",
      ],

    queryFn:
      () =>
        all<Edition>(
          "editions",

          (
            query,
          ) =>
            query.order(
              "edition_number",
              {
                ascending:
                  false,

                nullsFirst:
                  false,
              },
            ),
        ),
  });
}

export function useEdition(
  slug: string,
) {
  return useQuery({
    queryKey:
      [
        "edition",
        slug,
      ],

    queryFn:
      async () => {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              "editions",
            )
            .select(
              "*",
            )
            .eq(
              "slug",
              slug,
            )
            .maybeSingle();

        if (
          error
        ) {
          throw error;
        }

        return (
          data as Edition
        ) ??
          null;
      },
  });
}

/* ============================================================
   SHOWS
   ============================================================ */

export function useShows(
  editionId?:
    string,
) {
  return useQuery({
    enabled:
      !!editionId,

    queryKey:
      [
        "shows",
        editionId,
      ],

    queryFn:
      () =>
        all<Show>(
          "shows",

          (
            query,
          ) =>
            query
              .eq(
                "edition_id",
                editionId,
              )
              .order(
                "sort_order",
              ),
        ),
  });
}

export function useAllShows() {
  return useQuery({
    queryKey:
      [
        "shows",
        "all",
      ],

    queryFn:
      () =>
        all<Show>(
          "shows",
        ),
  });
}

export function useShow(
  showId?:
    string,
) {
  return useQuery({
    enabled:
      !!showId,

    queryKey:
      [
        "show",
        showId,
      ],

    queryFn:
      async () => {
        const {
          data,
          error,
        } =
          await supabase
            .from(
              "shows",
            )
            .select(
              "*",
            )
            .eq(
              "id",
              showId!,
            )
            .maybeSingle();

        if (
          error
        ) {
          throw error;
        }

        return (
          data as Show
        ) ??
          null;
      },
  });
}

/* ============================================================
   PARTICIPANTS
   ============================================================ */

export function useParticipants(
  editionId?:
    string,
) {
  return useQuery({
    enabled:
      !!editionId,

    queryKey:
      [
        "participants",
        editionId,
      ],

    queryFn:
      () =>
        all<Participant>(
          "participants",

          (
            query,
          ) =>
            query
              .eq(
                "edition_id",
                editionId,
              )
              .order(
                "running_order",
                {
                  nullsFirst:
                    false,
                },
              ),
        ),
  });
}

export function useShowParticipants(
  showId?:
    string,
) {
  return useQuery({
    enabled:
      !!showId,

    queryKey:
      [
        "participants",
        "show",
        showId,
      ],

    queryFn:
      () =>
        all<Participant>(
          "participants",

          (
            query,
          ) =>
            query
              .eq(
                "show_id",
                showId,
              )
              .order(
                "running_order",
                {
                  nullsFirst:
                    false,
                },
              ),
        ),
  });
}

/* ============================================================
   CONTEST ENTITIES
   ============================================================ */

export function useContestEntities(
  editionId?:
    string,
) {
  return useQuery({
    enabled:
      !!editionId,

    queryKey:
      [
        "contest_entities",
        "edition",
        editionId,
      ],

    queryFn:
      () =>
        all<ContestEntityRow>(
          "contest_entities",

          (
            query,
          ) =>
            query
              .eq(
                "edition_id",
                editionId,
              )
              .order(
                "display_name",
              ),
        ),
  });
}

export function useAllContestEntities() {
  return useQuery({
    queryKey:
      [
        "contest_entities",
        "all",
      ],

    queryFn:
      () =>
        all<ContestEntityRow>(
          "contest_entities",
        ),

    staleTime:
      60 *
      1000,
  });
}

/* ============================================================
   VOTERS
   ============================================================ */

export function useVoters(
  editionId?:
    string,
) {
  return useQuery({
    enabled:
      !!editionId,

    queryKey:
      [
        "voters",
        "edition",
        editionId,
      ],

    queryFn:
      () =>
        all<Voter>(
          "voters",

          (
            query,
          ) =>
            query
              .eq(
                "edition_id",
                editionId,
              )
              .order(
                "sort_order",
              ),
        ),
  });
}

export function useShowVoters(
  showId?:
    string,
) {
  return useQuery({
    enabled:
      !!showId,

    queryKey:
      [
        "voters",
        "show",
        showId,
      ],

    queryFn:
      () =>
        all<Voter>(
          "voters",

          (
            query,
          ) =>
            query
              .eq(
                "show_id",
                showId,
              )
              .order(
                "sort_order",
              ),
        ),
  });
}

export function useAllVoters() {
  return useQuery({
    queryKey:
      [
        "voters",
        "all",
      ],

    queryFn:
      () =>
        all<Voter>(
          "voters",
        ),
  });
}

/* ============================================================
   VOTER IDENTITY MATCHING
   ============================================================ */

export function matchVoterKey(
  vote: {
    voter_id?:
      | string
      | null;

    voter_country_id?:
      | string
      | null;

    voter_entity_id?:
      | string
      | null;
  },

  options:
    VoterOption[],
): string {
  if (
    vote.voter_id
  ) {
    const direct =
      options.find(
        (
          option,
        ) =>
          option.voterId ===
          vote.voter_id,
      );

    if (
      direct
    ) {
      return direct.key;
    }
  }

  if (
    vote.voter_entity_id
  ) {
    const byEntity =
      options.find(
        (
          option,
        ) =>
          option.countryId ===
          vote.voter_entity_id,
      );

    if (
      byEntity
    ) {
      return byEntity.key;
    }
  }

  if (
    vote.voter_country_id
  ) {
    const byCountry =
      options.find(
        (
          option,
        ) =>
          option.countryId ===
          vote.voter_country_id,
      );

    if (
      byCountry
    ) {
      return byCountry.key;
    }

    return `c:${vote.voter_country_id}`;
  }

  if (
    vote.voter_entity_id
  ) {
    return `c:${vote.voter_entity_id}`;
  }

  return vote.voter_id
    ? `v:${vote.voter_id}`
    : "";
}

/* ============================================================
   JURY VOTES
   ============================================================ */

export function useJuryVotes(
  showId?:
    string,
) {
  return useQuery({
    enabled:
      !!showId,

    queryKey:
      [
        "jury_votes",
        "show",
        showId,
      ],

    queryFn:
      () =>
        all<JuryVote>(
          "jury_votes",

          (
            query,
          ) =>
            query.eq(
              "show_id",
              showId,
            ),
        ),
  });
}

export function useAllJuryVotes() {
  return useQuery({
    queryKey:
      [
        "jury_votes",
        "all",
      ],

    queryFn:
      () =>
        all<JuryVote>(
          "jury_votes",
        ),
  });
}

/* ============================================================
   TELEVOTE
   ============================================================ */

export function useTelevotes(
  showId?:
    string,
) {
  return useQuery({
    enabled:
      !!showId,

    queryKey:
      [
        "televote_votes",
        "show",
        showId,
      ],

    queryFn:
      () =>
        all<Televote>(
          "televote_votes",

          (
            query,
          ) =>
            query.eq(
              "show_id",
              showId,
            ),
        ),
  });
}

export function useAllTelevotes() {
  return useQuery({
    queryKey:
      [
        "televote_votes",
        "all",
      ],

    queryFn:
      () =>
        all<Televote>(
          "televote_votes",
        ),
  });
}

/* ============================================================
   ALL PARTICIPANTS
   ============================================================ */

export function useAllParticipants() {
  return useQuery({
    queryKey:
      [
        "participants",
        "all",
      ],

    queryFn:
      () =>
        all<Participant>(
          "participants",
        ),

    staleTime:
      60 *
      1000,
  });
}

/* ============================================================
   RESULTS
   ============================================================
export function useResults(
  showId?:
    string,
) {
  return useQuery({
    enabled:
      !!showId,

    queryKey:
      [
        "results",
        "show",
        showId,
      ],

    queryFn:
      () =>
        all<ResultRow>(
          "results",

          (
            query,
          ) =>
            query.eq(
              "show_id",
              showId,
            ),
        ),
  });
}

export function useAllResults() {
  return useQuery({
    queryKey:
      [
        "results",
        "all",
      ],

    queryFn:
      () =>
        all<ResultRow>(
          "results",
        ),
  });
}

/* ============================================================
   ORGANIZER ACCESS
   ============================================================ */

export function useIsOrganizer() {
  return useQuery({
    queryKey:
      [
        "is-organizer",
      ],

    queryFn:
      async () => {
        const {
          data:
            userResult,
        } =
          await supabase.auth.getUser();

        if (
          !userResult.user
        ) {
          return false;
        }

        const {
          data,
          error,
        } =
          await supabase
            .from(
              "user_roles",
            )
            .select(
              "role",
            )
            .eq(
              "user_id",
              userResult.user.id,
            )
            .eq(
              "role",
              "organizer",
            )
            .maybeSingle();

        if (
          error
        ) {
          return false;
        }

        return !!data;
      },
  });
}

/* ============================================================
   INVALIDATION
   ============================================================ */

export function useInvalidate() {
  const qc =
    useQueryClient();

  return (
    ...keys:
      string[]
  ) =>
    keys.forEach(
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
}

/* ============================================================
   GENERIC TABLE MUTATION
   ============================================================ */

export function useTableMutation(
  table: string,
  invalidateKeys:
    string[],
) {
  const invalidate =
    useInvalidate();

  return useMutation({
    mutationFn:
      async (
        op: {
          action:
            | "insert"
            | "update"
            | "delete"
            | "upsert";

          values?:
            any;

          id?:
            string;

          match?:
            Record<
              string,
              any
            >;

          onConflict?:
            string;
        },
      ) => {
        const target:
          any =
          (
            supabase as any
          ).from(
            table,
          );

        let response:
          any;

        if (
          op.action ===
          "insert"
        ) {
          response =
            await target
              .insert(
                op.values,
              )
              .select();
        } else if (
          op.action ===
          "upsert"
        ) {
          response =
            await target
              .upsert(
                op.values,

                op.onConflict
                  ? {
                      onConflict:
                        op.onConflict,
                    }
                  : undefined,
              )
              .select();
        } else if (
          op.action ===
          "update"
        ) {
          let query =
            target.update(
              op.values,
            );

          if (
            op.id
          ) {
            query =
              query.eq(
                "id",
                op.id,
              );
          }

          Object.entries(
            op.match ??
              {},
          ).forEach(
            ([
              key,
              value,
            ]) => {
              query =
                query.eq(
                  key,
                  value,
                );
            },
          );

          response =
            await query.select();
        } else {
          let query =
            target.delete();

          if (
            op.id
          ) {
            query =
              query.eq(
                "id",
                op.id,
              );
          }

          Object.entries(
            op.match ??
              {},
          ).forEach(
            ([
              key,
              value,
            ]) => {
              query =
                query.eq(
                  key,
                  value,
                );
            },
          );

          response =
            await query;
        }

        if (
          response.error
        ) {
          throw response.error;
        }

        return response.data;
      },

    onSuccess:
      () =>
        invalidate(
          ...invalidateKeys,
        ),
  });
}

/* ============================================================
   GENERIC HELPERS
   ============================================================ */

export function byId<
  T extends {
    id: string;
  },
>(
  rows:
    | T[]
    | undefined,
) {
  const map =
    new Map<
      string,
      T
    >();

  (
    rows ??
    []
  ).forEach(
    (
      row,
    ) =>
      map.set(
        row.id,
        row,
      ),
  );

  return map;
}

/* ============================================================
   EDITION LABEL
   ============================================================ */

export const editionLabel =
  (
    edition:
      Edition,
  ) =>
    edition.edition_number
      ? `SSC ${edition.edition_number}`
      : edition.name;

/* ============================================================
   DEFAULT POINT SET
   ============================================================ */

export const POINT_SET = [
  12,
  10,
  8,
  7,
  6,
  5,
  4,
  3,
  2,
  1,
];
