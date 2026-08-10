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

export const RESULTS_PUBLICATION_CONFIG: PublicationConfig = {
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
};

export const FULL_PUBLICATION_CONFIG: PublicationConfig = {
  ...RESULTS_PUBLICATION_CONFIG,
  detailed_voting: true,
};

export type PublicationKey = keyof PublicationConfig;

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

export type PublicationAwareShow = {
  published?: boolean | null;
  publication_config?:
    | Record<string, unknown>
    | PublicationConfig
    | null;
};

/* ============================================================
   SHOW KINDS
   ============================================================ */

export function isGrandFinalKind(
  kind: string | null | undefined,
) {
  return (
    kind === "grand-final" ||
    kind === "final"
  );
}

export function isSemiFinalKind(
  kind: string | null | undefined,
) {
  return (
    kind === "semi-final" ||
    kind === "semi"
  );
}

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
      "Reveal participating countries, but keep artists, songs and running order private.",
    config: {
      ...DEFAULT_PUBLICATION_CONFIG,
      participants: true,
    },
  },
  {
    id: "entries",
    name: "Entry reveal",
    description:
      "Reveal countries, artists and songs.",
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
      "Reveal entries and their semi-final allocation.",
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
      "Reveal entries, allocation and performance order.",
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
      "Reveal overall results plus jury and televote totals.",
    config: {
      ...RESULTS_PUBLICATION_CONFIG,
    },
  },
  {
    id: "full",
    name: "Full show",
    description:
      "Publish everything, including detailed voting.",
    config: {
      ...FULL_PUBLICATION_CONFIG,
    },
  },
];

/* ============================================================
   NORMALISE
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

function rawPublicationHasKnownKey(
  raw:
    | Record<string, unknown>
    | PublicationConfig
    | null
    | undefined,
) {
  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return false;
  }

  return (
    "participants" in raw ||
    "artists" in raw ||
    "songs" in raw ||
    "semi_split" in raw ||
    "running_order" in raw ||
    "qualifiers" in raw ||
    "results" in raw ||
    "jury_results" in raw ||
    "televote_results" in raw ||
    "detailed_voting" in raw
  );
}

/**
 * Public routes should use this instead of resolvePublicationConfig(show.publication_config).
 *
 * Older SolarisStudio data predates publication_config. A show that was explicitly
 * published in that old model meant "the normal public show is available". For those
 * legacy rows only, we infer the safe Results preset (not detailed ballots).
 *
 * Modern rows that contain publication keys are never guessed. Their booleans are the
 * source of truth.
 */
export function resolveShowPublication(
  show:
    | PublicationAwareShow
    | null
    | undefined,
): PublicationConfig {
  if (!show) {
    return {
      ...DEFAULT_PUBLICATION_CONFIG,
    };
  }

  if (
    show.published &&
    !rawPublicationHasKnownKey(
      show.publication_config,
    )
  ) {
    return {
      ...RESULTS_PUBLICATION_CONFIG,
    };
  }

  return resolvePublicationConfig(
    show.publication_config,
  );
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
    ...getPublicationPreset(id).config,
  };
}

/* ============================================================
   DEPENDENCIES
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
    next.participants = true;
  }

  if (
    next.semi_split ||
    next.running_order ||
    next.qualifiers ||
    next.results ||
    next.detailed_voting
  ) {
    next.artists = true;
    next.songs = true;
  }

  if (next.qualifiers) {
    next.semi_split = true;
  }

  if (
    next.jury_results ||
    next.televote_results ||
    next.detailed_voting
  ) {
    next.results = true;
  }

  if (next.detailed_voting) {
    next.jury_results = true;
    next.televote_results = true;
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

export function isShowPublic(
  show:
    | PublicationAwareShow
    | null
    | undefined,
) {
  if (!show?.published) {
    return false;
  }

  return hasAnyPublicInformation(
    resolveShowPublication(show),
  );
}

export function showPublishesResults(
  show:
    | PublicationAwareShow
    | null
    | undefined,
) {
  if (!isShowPublic(show)) {
    return false;
  }

  return hasPublishedResults(
    resolveShowPublication(show),
  );
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
    title: "Artists",
    description:
      "Reveal the artists representing each country.",
  },

  songs: {
    title: "Songs",
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
      "Reveal final ranks and total points.",
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
      "Reveal individual jury ballots, points views and matrices.",
  },
};

/* ============================================================
   EDITION STATUS
   ============================================================ */

export type AutomaticEditionStatus =
  | "draft"
  | "published"
  | "completed";

export function resolveAutomaticEditionStatus(
  shows: Array<{
    kind: string;
    published: boolean;
    publication_config:
      | Record<string, unknown>
      | PublicationConfig
      | null;
  }>,
): AutomaticEditionStatus {
  const publicShows =
    shows.filter((show) =>
      isShowPublic(show),
    );

  if (!publicShows.length) {
    return "draft";
  }

  const finalWithResults =
    publicShows.some(
      (show) =>
        isGrandFinalKind(
          show.kind,
        ) &&
        resolveShowPublication(
          show,
        ).results,
    );

  return finalWithResults
    ? "completed"
    : "published";
}
