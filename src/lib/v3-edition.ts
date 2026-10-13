import {
  buildV3EditionHubProjection,
  type V3EditionHubProjection,
  type V3ExploreEditionInput,
} from "./v3-explore";

export type V3EditionIdentity = {
  id: string;
  name: string;
  shortCode: string;
  flagImage: string | null;
  accentColor: string;
  href: string | null;
};

export type V3EditionParticipant = V3EditionIdentity & {
  participationStatus: "confirmed" | "withdrawn" | "disqualified";
};

export type V3EditionEntry = V3EditionIdentity & {
  artist: string | null;
  song: string | null;
};

export type V3EditionShow = {
  id: string;
  name: string;
  kind: string;
  href: string;
  participantCount: number;
  runningOrderAvailable: boolean;
  resultsAvailable: boolean;
};

export type V3EditionStoryItem = {
  id: string;
  headline: string;
  summary: string;
  occurredAt: string | null;
};

export type V3EditionStory = {
  title: string;
  subtitle: string | null;
  introduction: string | null;
  publishedAt: string | null;
  items: readonly V3EditionStoryItem[];
};

export type V3EditionResult = V3EditionIdentity & {
  rank: number;
  totalPoints: number;
};

export type V3EditionPageProjection = {
  hub: V3EditionHubProjection;
  description: string | null;
  overview: {
    participantCount: number;
    entryCount: number;
    showCount: number;
    semiFinalCount: number;
  };
  participants: readonly V3EditionParticipant[];
  entries: readonly V3EditionEntry[];
  shows: readonly V3EditionShow[];
  story: V3EditionStory | null;
  results: {
    state: "locked" | "empty" | "available";
    showHref: string | null;
    rows: readonly V3EditionResult[];
  };
};

export type V3EditionPageInput = {
  edition: V3ExploreEditionInput;
  description: string | null;
  participants: readonly V3EditionParticipant[];
  entries: readonly V3EditionEntry[];
  shows: readonly V3EditionShow[];
  story: V3EditionStory | null;
  resultShowHref: string | null;
  results: readonly V3EditionResult[];
};

function stateFromCount(count: number): "available" | "empty" {
  return count > 0 ? "available" : "empty";
}

/**
 * Builds the complete V3 Edition read model after publication and identity
 * decisions have already been made by the server source. Result analysis stays
 * outside this projection; Edition only receives the official published rank
 * and total score summary it is allowed to present.
 */
export function buildV3EditionPageProjection(
  input: V3EditionPageInput,
): V3EditionPageProjection | null {
  const hub = buildV3EditionHubProjection({
    edition: input.edition,
    sections: {
      overview: { state: "available", href: "#edition-overview" },
      participants: {
        state: stateFromCount(input.participants.length),
        href: "#edition-participants",
      },
      songs: {
        state: stateFromCount(input.entries.length),
        href: "#edition-songs",
      },
      schedule: {
        state: stateFromCount(input.shows.length),
        href: "#edition-schedule",
      },
      stories: {
        state: input.story ? "available" : "empty",
        href: "#edition-stories",
      },
      results: {
        state: stateFromCount(input.results.length),
        href: "#edition-results",
      },
    },
  });

  if (!hub) return null;

  const resultsState =
    input.edition.resultsPublication !== "published"
      ? "locked"
      : input.results.length
        ? "available"
        : "empty";

  return {
    hub,
    description: input.description,
    overview: {
      participantCount: input.participants.length,
      entryCount: input.entries.length,
      showCount: input.shows.length,
      semiFinalCount: input.shows.filter(
        (show) => show.kind === "semi-final" || show.kind === "semi",
      ).length,
    },
    participants: input.participants,
    entries: input.entries,
    shows: input.shows,
    story: input.story,
    results: {
      state: resultsState,
      showHref: resultsState === "available" ? input.resultShowHref : null,
      rows: resultsState === "available" ? input.results : [],
    },
  };
}
