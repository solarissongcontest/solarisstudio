export const V3_JURY_SHARE_CAPABILITY_ID = "results.jury_share_card" as const;

export const V3_JURY_SHARE_FOUNDATION = Object.freeze({
  phase: "foundation" as const,
  uiEnabled: false,
  renderEndpointEnabled: false,
  databaseWritesRequired: false,
});

export const JURY_SHARE_POINTS = [12, 10, 8, 7, 6, 5, 4, 3, 2, 1] as const;

export type JurySharePoint = (typeof JURY_SHARE_POINTS)[number];
export type JuryShareThemeId = "default" | "edition" | "liquid_glass";
export type JuryShareOutputTarget = "story";
export type JuryShareFormat = "png" | "jpeg";
export type JuryShareThemeState = "available" | "unconfigured" | "invalid" | "unsupported";

export type JuryShareAvailabilityReason =
  | "RESULTS_NOT_PUBLISHED"
  | "JURY_BREAKDOWN_PRIVATE"
  | "BALLOT_NOT_FINAL"
  | "BALLOT_UNAVAILABLE";

export type JuryShareAvailability =
  | { shareable: true; reason: null }
  | { shareable: false; reason: JuryShareAvailabilityReason };

export type JuryShareSafeArea = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type JuryShareAssetRef = {
  id: string;
  url: string;
  alt: string;
};

export type JuryShareVote = {
  recipientCountryId: string;
  displayName: string;
  shortDisplayName?: string;
  flagAsset: JuryShareAssetRef;
  identityVersion: string;
  points: JurySharePoint;
  rank: number;
};

export type JuryShareThemeAvailability = {
  id: JuryShareThemeId;
  state: JuryShareThemeState;
  reason?: string;
};

export type JuryShareProjection = {
  schemaVersion: 1;
  ballotId: string;
  edition: {
    id: string;
    slug: string;
    number: number | null;
    name: string;
    historicalIdentityVersion: string;
  };
  show: {
    id: string;
    name: string;
    type: "semi_final" | "final" | "other";
  };
  source: {
    delegationId: string;
    countryId: string;
    displayName: string;
    shortDisplayName?: string;
    flagAsset: JuryShareAssetRef;
    identityVersion: string;
  };
  votes: readonly JuryShareVote[];
  result: {
    resultVersionId: string;
    publishedAt: string;
  };
  themes: readonly JuryShareThemeAvailability[];
  publication: JuryShareAvailability;
  stateVersion: string;
  serverTime: string;
};

export const JURY_SHARE_TARGETS = Object.freeze({
  story: Object.freeze({
    width: 1080,
    height: 1920,
    aspectRatio: 9 / 16,
    // Product-safe inset, not a promise about any social app's permanent chrome.
    safeArea: Object.freeze({ top: 192, right: 72, bottom: 240, left: 72 }),
  }),
});

export const DEFAULT_JURY_SHARE_THEME_VERSION = 1;

export const DEFAULT_JURY_SHARE_DESIGN = Object.freeze({
  background: "#07152F",
  standardRow: "#2B63A6",
  standardRowForeground: "#FFFFFF",
  twelvePointRow: "#F0D596",
  twelvePointForeground: "#13213B",
  primaryForeground: "#FFFFFF",
  secondaryForeground: "#B8C9E6",
  flagAspectRatio: 3 / 2,
  rowRadius: 28,
});

export type DefaultJuryShareRow = {
  recipientCountryId: string;
  country: string;
  flagAsset: JuryShareAssetRef;
  points: JurySharePoint;
  pointsLabel: string;
  emphasized: boolean;
};

export type DefaultJuryShareModel = {
  target: "story";
  width: 1080;
  height: 1920;
  safeArea: JuryShareSafeArea;
  themeId: "default";
  themeVersion: number;
  contestLabel: "SOLARIS";
  editionLabel: string;
  showLabel: string;
  rows: readonly DefaultJuryShareRow[];
  footerLabel: "VOTES OF:";
  footerCountry: string;
  design: typeof DEFAULT_JURY_SHARE_DESIGN;
};

export class JuryShareFoundationError extends Error {
  constructor(
    public readonly code:
      | JuryShareAvailabilityReason
      | "INVALID_VOTE_SET"
      | "DUPLICATE_RECIPIENT",
    message: string,
  ) {
    super(message);
    this.name = "JuryShareFoundationError";
  }
}

export function resolveJuryShareAvailability(input: {
  ballotExists: boolean;
  ballotFinal: boolean;
  resultPublished: boolean;
  juryBreakdownPublic: boolean;
}): JuryShareAvailability {
  if (!input.ballotExists) return { shareable: false, reason: "BALLOT_UNAVAILABLE" };
  if (!input.ballotFinal) return { shareable: false, reason: "BALLOT_NOT_FINAL" };
  if (!input.resultPublished) return { shareable: false, reason: "RESULTS_NOT_PUBLISHED" };
  if (!input.juryBreakdownPublic) return { shareable: false, reason: "JURY_BREAKDOWN_PRIVATE" };
  return { shareable: true, reason: null };
}

export function resolveJuryShareThemes(input: {
  editionConfigured: boolean;
  editionValid: boolean;
  liquidGlassSupported: boolean;
}): readonly JuryShareThemeAvailability[] {
  const edition: JuryShareThemeAvailability = input.editionConfigured
    ? input.editionValid
      ? { id: "edition", state: "available" }
      : { id: "edition", state: "invalid", reason: "Edition share theme failed validation" }
    : { id: "edition", state: "unconfigured", reason: "Edition share theme is not configured" };

  return [
    { id: "default", state: "available" },
    edition,
    input.liquidGlassSupported
      ? { id: "liquid_glass", state: "available" }
      : { id: "liquid_glass", state: "unsupported", reason: "Liquid Glass renderer unavailable" },
  ];
}

export function normalizeJuryShareVotes(votes: readonly JuryShareVote[]): JuryShareVote[] {
  if (votes.length !== JURY_SHARE_POINTS.length) {
    throw new JuryShareFoundationError(
      "INVALID_VOTE_SET",
      `Expected ${JURY_SHARE_POINTS.length} jury point rows, received ${votes.length}`,
    );
  }

  const sorted = [...votes].sort((a, b) => b.points - a.points);
  const recipients = new Set<string>();

  sorted.forEach((vote, index) => {
    if (vote.points !== JURY_SHARE_POINTS[index]) {
      throw new JuryShareFoundationError(
        "INVALID_VOTE_SET",
        `Expected jury points ${JURY_SHARE_POINTS.join(", ")}`,
      );
    }
    if (recipients.has(vote.recipientCountryId)) {
      throw new JuryShareFoundationError(
        "DUPLICATE_RECIPIENT",
        `Duplicate jury recipient ${vote.recipientCountryId}`,
      );
    }
    recipients.add(vote.recipientCountryId);
  });

  return sorted;
}

export function buildDefaultJuryShareModel(projection: JuryShareProjection): DefaultJuryShareModel {
  if (!projection.publication.shareable) {
    throw new JuryShareFoundationError(
      projection.publication.reason,
      `Jury share card is unavailable: ${projection.publication.reason}`,
    );
  }

  const votes = normalizeJuryShareVotes(projection.votes);

  return {
    target: "story",
    width: JURY_SHARE_TARGETS.story.width,
    height: JURY_SHARE_TARGETS.story.height,
    safeArea: { ...JURY_SHARE_TARGETS.story.safeArea },
    themeId: "default",
    themeVersion: DEFAULT_JURY_SHARE_THEME_VERSION,
    contestLabel: "SOLARIS",
    editionLabel: projection.edition.name,
    showLabel: projection.show.name,
    rows: votes.map((vote) => ({
      recipientCountryId: vote.recipientCountryId,
      country: vote.shortDisplayName ?? vote.displayName,
      flagAsset: vote.flagAsset,
      points: vote.points,
      pointsLabel: String(vote.points).padStart(2, "0"),
      emphasized: vote.points === 12,
    })),
    footerLabel: "VOTES OF:",
    footerCountry: projection.source.shortDisplayName ?? projection.source.displayName,
    design: DEFAULT_JURY_SHARE_DESIGN,
  };
}

export function buildJuryShareRenderKeyMaterial(input: {
  ballotId: string;
  resultVersionId: string;
  sourceIdentityVersion: string;
  recipientIdentityVersions: readonly { countryId: string; version: string }[];
  themeId: JuryShareThemeId;
  themeVersion: number;
  outputTarget: JuryShareOutputTarget;
  format: JuryShareFormat;
}): string {
  const recipientIdentitySet = [...input.recipientIdentityVersions]
    .sort((a, b) => a.countryId.localeCompare(b.countryId))
    .map(({ countryId, version }) => `${countryId}:${version}`)
    .join(",");

  return [
    `ballot=${input.ballotId}`,
    `result=${input.resultVersionId}`,
    `sourceIdentity=${input.sourceIdentityVersion}`,
    `recipientIdentities=${recipientIdentitySet}`,
    `theme=${input.themeId}@${input.themeVersion}`,
    `target=${input.outputTarget}`,
    `format=${input.format}`,
  ].join("|");
}

export function formatJuryShareText(projection: JuryShareProjection): string {
  const votes = normalizeJuryShareVotes(projection.votes);
  const sourceCountry = projection.source.shortDisplayName ?? projection.source.displayName;
  const lines = votes.map(
    (vote) => `${vote.points} · ${vote.shortDisplayName ?? vote.displayName}`,
  );

  return [
    `${sourceCountry} jury votes`,
    `${projection.edition.name} · ${projection.show.name}`,
    "",
    ...lines,
  ].join("\n");
}
