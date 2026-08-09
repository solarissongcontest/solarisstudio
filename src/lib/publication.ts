export type PublicationConfig = {
  participants: boolean;
  artists: boolean;
  songs: boolean;
  semi_split: boolean;
  running_order: boolean;
  qualifiers: boolean;
  results: boolean;
  jury_results: boolean;
  televote_results: boolean;
  detailed_voting: boolean;
};

export const DEFAULT_PUBLICATION_CONFIG: PublicationConfig = {
  participants: false,
  artists: false,
  songs: false,
  semi_split: false,
  running_order: false,
  qualifiers: false,
  results: false,
  jury_results: false,
  televote_results: false,
  detailed_voting: false,
};

export type PublicationKey =
  keyof PublicationConfig;

export type PublicationPresetId =
  | "private"
  | "participants"
  | "entries"
  | "split"
  | "running-order"
  | "qualifiers"
  | "results"
  | "full";

export type PublicationPreset = {
  id: PublicationPresetId;
  name: string;
  description: string;
  config: PublicationConfig;
};

/* ============================================================
   PRESETS
   ============================================================ */

export const PUBLICATION_PRESETS: PublicationPreset[] = [
  {
    id: "private",

    name: "Private",

    description:
      "Nothing from this show is public.",

    config: {
      ...DEFAULT_PUBLICATION_CONFIG,
    },
  },

  {
    id: "participants",

    name: "Participants only",

    description:
      "Reveal the participating countries, but no artists, songs or running order.",

    config: {
      ...DEFAULT_PUBLICATION_CONFIG,

      participants: true,
    },
  },

  {
    id: "entries",

    name: "Entry reveal",

    description:
      "Reveal participating countries, artists and songs.",

    config: {
      ...DEFAULT_PUBLICATION_CONFIG,

      participants: true,
      artists: true,
      songs: true,
    },
  },

  {
    id: "split",

    name: "Semi-final split",

    description:
      "Reveal countries, entries and their semi-final allocation.",

    config: {
      ...DEFAULT_PUBLICATION_CONFIG,

      participants: true,
      artists: true,
      songs: true,
      semi_split: true,
    },
  },

  {
    id: "running-order",

    name: "Running order",

    description:
      "Reveal the entries, split and running order.",

    config: {
      ...DEFAULT_PUBLICATION_CONFIG,

      participants: true,
      artists: true,
      songs: true,
      semi_split: true,
      running_order: true,
    },
  },

  {
    id: "qualifiers",

    name: "Qualifiers",

    description:
      "Reveal entries, running order and qualification outcomes.",

    config: {
      ...DEFAULT_PUBLICATION_CONFIG,

      participants: true,
      artists: true,
      songs: true,
      semi_split: true,
      running_order: true,
      qualifiers: true,
    },
  },

  {
    id: "results",

    name: "Results",

    description:
      "Reveal final standings plus jury and televote result totals.",

    config: {
      participants: true,
      artists: true,
      songs: true,
      semi_split: true,
      running_order: true,
      qualifiers: true,

      results: true,
      jury_results: true,
      televote_results: true,

      detailed_voting: false,
    },
  },

  {
    id: "full",

    name: "Full show",

    description:
      "Everything is public, including detailed jury voting.",

    config: {
      participants: true,
      artists: true,
      songs: true,
      semi_split: true,
      running_order: true,
      qualifiers: true,

      results: true,
      jury_results: true,
      televote_results: true,
      detailed_voting: true,
    },
  },
];

/* ============================================================
   CONFIG NORMALISATION
   ============================================================ */

export function resolvePublicationConfig(
  raw:
    | Record<string, unknown>
    | PublicationConfig
    | null
    | undefined,
): PublicationConfig {
  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return {
      ...DEFAULT_PUBLICATION_CONFIG,
    };
  }

  return {
    participants:
      raw.participants === true,

    artists:
      raw.artists === true,

    songs:
      raw.songs === true,

    semi_split:
      raw.semi_split === true,

    running_order:
      raw.running_order === true,

    qualifiers:
      raw.qualifiers === true,

    results:
      raw.results === true,

    jury_results:
      raw.jury_results === true,

    televote_results:
      raw.televote_results === true,

    detailed_voting:
      raw.detailed_voting === true,
  };
}

/* ============================================================
   PRESET HELPERS
   ============================================================ */

export function getPublicationPreset(
  id: PublicationPresetId,
): PublicationPreset {
  return (
    PUBLICATION_PRESETS.find(
      (preset) =>
        preset.id === id,
    ) ??
    PUBLICATION_PRESETS[0]
  );
}

export function applyPublicationPreset(
  id: PublicationPresetId,
): PublicationConfig {
  return {
    ...getPublicationPreset(
      id,
    ).config,
  };
}

/* ============================================================
   DEPENDENCIES

   Publishing later-stage information automatically enables
   information that is required for it to make sense publicly.

   Example:
   Running order without participants would be nonsense.
   Humanity has produced enough nonsense already.
   ============================================================ */

export function normalisePublicationDependencies(
  config: PublicationConfig,
): PublicationConfig {
  const next = {
    ...config,
  };

  if (
    next.artists ||
    next.songs ||
    next.semi_split ||
    next.running_order ||
    next.qualifiers ||
    next.results ||
    next.jury_results ||
    next.televote_results ||
    next.detailed_voting
  ) {
    next.participants =
      true;
  }

  if (
    next.semi_split ||
    next.running_order ||
    next.qualifiers ||
    next.results ||
    next.detailed_voting
  ) {
    next.artists =
      true;

    next.songs =
      true;
  }

  if (
    next.qualifiers
  ) {
    next.semi_split =
      true;
  }

  if (
    next.results ||
    next.jury_results ||
    next.televote_results ||
    next.detailed_voting
  ) {
    next.results =
      true;
  }

  if (
    next.detailed_voting
  ) {
    next.jury_results =
      true;
  }

  return next;
}

/* ============================================================
   VISIBILITY
   ============================================================ */

export function hasAnyPublicInformation(
  config: PublicationConfig,
) {
  return Object.values(
    config,
  ).some(Boolean);
}

export function hasPublishedResults(
  config: PublicationConfig,
) {
  return (
    config.results ||
    config.jury_results ||
    config.televote_results ||
    config.detailed_voting
  );
}

export function isFullyPublished(
  config: PublicationConfig,
) {
  return Object.values(
    config,
  ).every(Boolean);
}

/* ============================================================
   LABELS
   ============================================================ */

export const PUBLICATION_LABELS: Record<
  PublicationKey,
  {
    title: string;
    description: string;
  }
> = {
  participants: {
    title:
      "Participating countries",

    description:
      "Show which countries are competing.",
  },

  artists: {
    title:
      "Artists",

    description:
      "Reveal the artists representing each country.",
  },

  songs: {
    title:
      "Songs",

    description:
      "Reveal song titles.",
  },

  semi_split: {
    title:
      "Semi-final split",

    description:
      "Reveal which semi-final each entry belongs to.",
  },

  running_order: {
    title:
      "Running order",

    description:
      "Reveal performance positions.",
  },

  qualifiers: {
    title:
      "Qualification results",

    description:
      "Reveal who qualified and who did not.",
  },

  results: {
    title:
      "Overall results",

    description:
      "Reveal ranks and total points.",
  },

  jury_results: {
    title:
      "Jury results",

    description:
      "Reveal jury totals.",
  },

  televote_results: {
    title:
      "Televote results",

    description:
      "Reveal televote totals.",
  },

  detailed_voting: {
    title:
      "Detailed voting",

    description:
      "Reveal jury ballots, points views and voting matrices.",
  },
};

/* ============================================================
   EDITION STATUS
   ============================================================ */

export type AutomaticEditionStatus =
  | "draft"
  | "published"
  | "completed";

/**
 * Calculate the edition lifecycle from its public shows.
 *
 * draft:
 * Nothing public.
 *
 * published:
 * At least some edition/show information is public.
 *
 * completed:
 * A published grand final has public results.
 */
export function resolveAutomaticEditionStatus(
  shows: Array<{
    kind: string;
    published: boolean;
    publication_config:
      | Record<string, unknown>
      | null;
  }>,
): AutomaticEditionStatus {
  const publicShows =
    shows.filter(
      (show) =>
        show.published,
    );

  if (
    !publicShows.length
  ) {
    return "draft";
  }

  const completedFinal =
    publicShows.some(
      (show) => {
        if (
          show.kind !==
          "grand-final"
        ) {
          return false;
        }

        const publication =
          resolvePublicationConfig(
            show.publication_config,
          );

        return publication.results;
      },
    );

  if (
    completedFinal
  ) {
    return "completed";
  }

  return "published";
}
