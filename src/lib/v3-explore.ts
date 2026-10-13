export type V3PublicationVisibility =
  | "public"
  | "scheduled"
  | "private"
  | "withdrawn";

export type V3EditionExperience =
  | "upcoming"
  | "pre-show"
  | "show-day"
  | "live"
  | "results"
  | "post-edition"
  | "archived";

export type V3EditionResultsPublication = "hidden" | "published";

export type V3ExploreNextEvent = {
  id: string;
  title: string;
  startsAt: string | null;
  href: string;
};

export type V3ExploreEditionInput = {
  id: string;
  slug: string;
  name: string;
  editionNumber: number | null;
  year: number | null;
  hostLabel: string | null;
  artworkUrl: string | null;
  visibility: V3PublicationVisibility;
  experience: V3EditionExperience;
  resultsPublication: V3EditionResultsPublication;
  href: string;
  liveHref?: string | null;
  nextEvent?: V3ExploreNextEvent | null;
  archiveEligible: boolean;
};

export type V3ExploreEntityInput = {
  id: string;
  title: string;
  subtitle?: string | null;
  href: string;
  visibility: V3PublicationVisibility;
};

export type V3ExploreStoryInput = V3ExploreEntityInput & {
  publishedAt?: string | null;
};

export type V3ExploreRoutes = {
  countries: string;
  songsAndArtists: string;
  shows: string;
  stories: string;
  editionsArchive: string;
  wiki: string;
  encyclopedia: string;
  archiveGames?: string | null;
  advancedDiscovery?: string | null;
};

export type V3ExploreCollectionKey =
  | "countries"
  | "songs-and-artists"
  | "shows"
  | "stories";

export type V3ExploreCollection = {
  key: V3ExploreCollectionKey;
  label: string;
  href: string;
  publicItemCount: number;
};

export type V3ExploreLink = {
  key: string;
  label: string;
  href: string;
};

export type V3ExploreEditionCard = {
  id: string;
  name: string;
  editionNumber: number | null;
  year: number | null;
  hostLabel: string | null;
  artworkUrl: string | null;
  experience: V3EditionExperience;
  href: string;
  nextEvent: V3ExploreNextEvent | null;
  resultsAvailable: boolean;
};

export type V3ExploreRootProjection = {
  search: {
    integration: "existing-global-search";
    action: "open-existing-search";
  };
  currentEdition: V3ExploreEditionCard | null;
  discover: readonly V3ExploreCollection[];
  archive: {
    links: readonly V3ExploreLink[];
    editions: readonly V3ExploreEditionCard[];
  };
  more: readonly V3ExploreLink[];
};

export type V3ExploreRootInput = {
  currentEditionId: string | null;
  editions: readonly V3ExploreEditionInput[];
  countries: readonly V3ExploreEntityInput[];
  songs: readonly V3ExploreEntityInput[];
  artists: readonly V3ExploreEntityInput[];
  shows: readonly V3ExploreEntityInput[];
  stories: readonly V3ExploreStoryInput[];
  routes: V3ExploreRoutes;
};

export type V3EditionSectionKey =
  | "overview"
  | "participants"
  | "songs"
  | "schedule"
  | "stories"
  | "results";

export type V3EditionSectionState = "available" | "empty" | "locked";

export type V3EditionSectionInput = {
  state: Exclude<V3EditionSectionState, "locked">;
  href: string;
};

export type V3EditionHubInput = {
  edition: V3ExploreEditionInput;
  sections: Record<V3EditionSectionKey, V3EditionSectionInput>;
};

export type V3EditionHubProjection = {
  hero: V3ExploreEditionCard;
  sections: readonly {
    key: V3EditionSectionKey;
    label: string;
    state: V3EditionSectionState;
    href: string;
  }[];
  liveAction: {
    label: "Open Live Mode";
    href: string;
  } | null;
};

export type V3ExploreOwnedFeature =
  | "edition"
  | "country"
  | "artist"
  | "song"
  | "show"
  | "story"
  | "archive"
  | "wiki"
  | "encyclopedia";

export type V3ResultsOwnedFeature =
  | "ranking"
  | "scorechart"
  | "jury-televote-breakdown"
  | "records"
  | "voting-relationships"
  | "voting-dna"
  | "result-lab"
  | "replay"
  | "simulation";

export type V3ExploreOrResultsFeature = V3ExploreOwnedFeature | V3ResultsOwnedFeature;

const PUBLIC_VISIBILITY: V3PublicationVisibility = "public";

const SECTION_LABELS: Record<V3EditionSectionKey, string> = {
  overview: "Overview",
  participants: "Participants",
  songs: "Songs",
  schedule: "Schedule",
  stories: "Stories",
  results: "Results",
};

const RESULTS_OWNED_FEATURES = new Set<V3ExploreOrResultsFeature>([
  "ranking",
  "scorechart",
  "jury-televote-breakdown",
  "records",
  "voting-relationships",
  "voting-dna",
  "result-lab",
  "replay",
  "simulation",
]);

function countPublic(items: readonly V3ExploreEntityInput[]): number {
  return items.reduce(
    (count, item) => count + (item.visibility === PUBLIC_VISIBILITY ? 1 : 0),
    0,
  );
}

function projectEdition(edition: V3ExploreEditionInput): V3ExploreEditionCard {
  return {
    id: edition.id,
    name: edition.name,
    editionNumber: edition.editionNumber,
    year: edition.year,
    hostLabel: edition.hostLabel,
    artworkUrl: edition.artworkUrl,
    experience: edition.experience,
    href: edition.href,
    nextEvent: edition.nextEvent ?? null,
    resultsAvailable: edition.resultsPublication === "published",
  };
}

export function buildV3ExploreRootProjection(
  input: V3ExploreRootInput,
): V3ExploreRootProjection {
  const currentEdition = input.currentEditionId
    ? input.editions.find(
        (edition) =>
          edition.id === input.currentEditionId && edition.visibility === PUBLIC_VISIBILITY,
      ) ?? null
    : null;

  const archiveEditions = input.editions
    .filter(
      (edition) =>
        edition.visibility === PUBLIC_VISIBILITY &&
        edition.archiveEligible &&
        edition.id !== input.currentEditionId,
    )
    .map(projectEdition);

  const discover: V3ExploreCollection[] = [
    {
      key: "countries",
      label: "Countries",
      href: input.routes.countries,
      publicItemCount: countPublic(input.countries),
    },
    {
      key: "songs-and-artists",
      label: "Songs & artists",
      href: input.routes.songsAndArtists,
      publicItemCount: countPublic(input.songs) + countPublic(input.artists),
    },
    {
      key: "shows",
      label: "Shows",
      href: input.routes.shows,
      publicItemCount: countPublic(input.shows),
    },
    {
      key: "stories",
      label: "Stories",
      href: input.routes.stories,
      publicItemCount: countPublic(input.stories),
    },
  ];

  const archiveLinks: V3ExploreLink[] = [
    { key: "editions", label: "Editions", href: input.routes.editionsArchive },
    { key: "wiki", label: "Wiki", href: input.routes.wiki },
    {
      key: "encyclopedia",
      label: "Encyclopedia",
      href: input.routes.encyclopedia,
    },
  ];

  const more: V3ExploreLink[] = [];
  if (input.routes.archiveGames) {
    more.push({
      key: "archive-games",
      label: "Archive games",
      href: input.routes.archiveGames,
    });
  }
  if (input.routes.advancedDiscovery) {
    more.push({
      key: "advanced-discovery",
      label: "Advanced discovery",
      href: input.routes.advancedDiscovery,
    });
  }

  return {
    search: {
      integration: "existing-global-search",
      action: "open-existing-search",
    },
    currentEdition: currentEdition ? projectEdition(currentEdition) : null,
    discover,
    archive: {
      links: archiveLinks,
      editions: archiveEditions,
    },
    more,
  };
}

export function buildV3EditionHubProjection(
  input: V3EditionHubInput,
): V3EditionHubProjection | null {
  if (input.edition.visibility !== PUBLIC_VISIBILITY) {
    return null;
  }

  const sections = (
    ["overview", "participants", "songs", "schedule", "stories", "results"] as const
  ).map((key) => {
    const source = input.sections[key];
    const state: V3EditionSectionState =
      key === "results" && input.edition.resultsPublication !== "published"
        ? "locked"
        : source.state;

    return {
      key,
      label: SECTION_LABELS[key],
      state,
      href: source.href,
    };
  });

  return {
    hero: projectEdition(input.edition),
    sections,
    liveAction:
      input.edition.experience === "live" && input.edition.liveHref
        ? {
            label: "Open Live Mode",
            href: input.edition.liveHref,
          }
        : null,
  };
}

export function classifyV3ExploreOrResultsFeature(
  feature: V3ExploreOrResultsFeature,
): "explore" | "results" {
  return RESULTS_OWNED_FEATURES.has(feature) ? "results" : "explore";
}
