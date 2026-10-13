export type V3ResultPublication = "hidden" | "published";
export type V3ResultDisclosure = "withheld" | "revealed";
export type V3ResultMode = "combined" | "jury" | "televote";

/** Unknown account preferences cannot authorize an automatic result reveal. */
export function resolveV3ResultsSpoilerProtection(input: {
  localSpoilerFree: boolean;
  viewerResolved: boolean;
  viewerId: string | null;
  serverPending: boolean;
  serverError: boolean;
  serverSpoilerFree: boolean | null;
}): boolean {
  return (
    input.localSpoilerFree ||
    !input.viewerResolved ||
    Boolean(
      input.viewerId &&
      (input.serverPending || input.serverError || input.serverSpoilerFree === true),
    )
  );
}

export type V3ResultEntryInput = {
  countryId: string;
  countryName: string;
  flagUrl: string | null;
  rank: number;
  points: number;
  juryPoints?: number | null;
  televotePoints?: number | null;
  artist?: string | null;
  song?: string | null;
};

export type V3ResultToolLink = {
  key: string;
  label: string;
  href: string;
};

export type V3ResultProjectionInput = {
  editionId: string;
  editionName: string;
  showId: string;
  showName: string;
  publication: V3ResultPublication;
  disclosure: V3ResultDisclosure;
  rows: readonly V3ResultEntryInput[];
  juryPublished: boolean;
  televotePublished: boolean;
  userDelegationCountryId: string | null;
  resultTools: readonly V3ResultToolLink[];
  advancedTools: readonly V3ResultToolLink[];
};

export type V3ResultRow = {
  countryId: string;
  countryName: string;
  flagUrl: string | null;
  rank: number;
  points: number;
  juryPoints: number | null;
  televotePoints: number | null;
  artist: string | null;
  song: string | null;
};

export type V3ResultsProjection = {
  context: {
    editionId: string;
    editionName: string;
    showId: string;
    showName: string;
  };
  status: "unpublished" | "spoiler-protected" | "available";
  tabs: readonly V3ResultMode[];
  officialResult: {
    winner: V3ResultRow | null;
    rows: readonly V3ResultRow[];
  };
  yourResult: V3ResultRow | null;
  exploreThisResult: readonly V3ResultToolLink[];
  moreAnalysis: readonly V3ResultToolLink[];
};

function projectRow(row: V3ResultEntryInput): V3ResultRow {
  return {
    countryId: row.countryId,
    countryName: row.countryName,
    flagUrl: row.flagUrl,
    rank: row.rank,
    points: row.points,
    juryPoints: row.juryPoints ?? null,
    televotePoints: row.televotePoints ?? null,
    artist: row.artist ?? null,
    song: row.song ?? null,
  };
}

function visibleTabs(input: V3ResultProjectionInput): readonly V3ResultMode[] {
  const tabs: V3ResultMode[] = ["combined"];
  if (input.juryPublished) tabs.push("jury");
  if (input.televotePublished) tabs.push("televote");
  return tabs;
}

export function buildV3ResultsProjection(input: V3ResultProjectionInput): V3ResultsProjection {
  const context = {
    editionId: input.editionId,
    editionName: input.editionName,
    showId: input.showId,
    showName: input.showName,
  };

  if (input.publication !== "published") {
    return {
      context,
      status: "unpublished",
      tabs: [],
      officialResult: { winner: null, rows: [] },
      yourResult: null,
      exploreThisResult: [],
      moreAnalysis: [],
    };
  }

  if (input.disclosure !== "revealed") {
    return {
      context,
      status: "spoiler-protected",
      tabs: [],
      officialResult: { winner: null, rows: [] },
      yourResult: null,
      exploreThisResult: [],
      moreAnalysis: [],
    };
  }

  const rows = input.rows
    .map((row) =>
      projectRow({
        ...row,
        juryPoints: input.juryPublished ? row.juryPoints : null,
        televotePoints: input.televotePublished ? row.televotePoints : null,
      }),
    )
    .sort((a, b) => a.rank - b.rank);
  const winner = rows.find((row) => row.rank === 1) ?? null;
  const yourResult = input.userDelegationCountryId
    ? (rows.find((row) => row.countryId === input.userDelegationCountryId) ?? null)
    : null;

  return {
    context,
    status: "available",
    tabs: visibleTabs(input),
    officialResult: {
      winner,
      rows,
    },
    yourResult,
    exploreThisResult: [...input.resultTools],
    moreAnalysis: [...input.advancedTools],
  };
}
