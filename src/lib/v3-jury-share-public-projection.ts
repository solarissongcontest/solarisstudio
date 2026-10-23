import {
  JURY_SHARE_POINTS,
  normalizeJuryShareVotes,
  type JuryShareAssetRef,
  type JuryShareAvailability,
  type JuryShareAvailabilityReason,
  type JuryShareProjection,
  type JuryShareThemeAvailability,
  type JuryShareThemeId,
  type JuryShareThemeState,
  type JuryShareVote,
} from "./v3-jury-share-card-foundation";

type JsonRecord = Record<string, unknown>;

export type V3JuryShareReady = {
  state: "ready";
  visibility: "public" | "private";
  projection: JuryShareProjection;
  themes: readonly JuryShareThemeAvailability[];
};

export type V3JuryShareUnavailable = {
  state: "unavailable";
  errorCode: string;
  reason: string | null;
  publication: JuryShareAvailability | null;
  serverTime: string | null;
};

export type V3JuryShareSourceResult = V3JuryShareReady | V3JuryShareUnavailable;

export class V3JuryShareProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "V3JuryShareProjectionError";
  }
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new V3JuryShareProjectionError(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new V3JuryShareProjectionError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new V3JuryShareProjectionError(`${label} must be a finite number`);
  }
  return value;
}

function parseAsset(value: unknown, label: string): JuryShareAssetRef {
  const item = record(value, label);
  return {
    id: requiredString(item.id, `${label}.id`),
    url: requiredString(item.url, `${label}.url`),
    alt: requiredString(item.alt, `${label}.alt`),
  };
}

function parsePublication(value: unknown): JuryShareAvailability {
  const item = record(value, "publication");
  if (item.shareable === true) return { shareable: true, reason: null };
  if (item.shareable !== false) {
    throw new V3JuryShareProjectionError("publication.shareable must be boolean");
  }

  const reasons: readonly JuryShareAvailabilityReason[] = [
    "RESULTS_NOT_PUBLISHED",
    "JURY_BREAKDOWN_PRIVATE",
    "BALLOT_NOT_FINAL",
    "BALLOT_UNAVAILABLE",
  ];
  if (!reasons.includes(item.reason as JuryShareAvailabilityReason)) {
    throw new V3JuryShareProjectionError("publication.reason is unsupported");
  }
  return { shareable: false, reason: item.reason as JuryShareAvailabilityReason };
}

function parseVote(value: unknown, index: number): JuryShareVote {
  const item = record(value, `votes[${index}]`);
  const points = finiteNumber(item.points, `votes[${index}].points`);
  if (!JURY_SHARE_POINTS.includes(points as JuryShareVote["points"])) {
    throw new V3JuryShareProjectionError(`votes[${index}].points is not a Jury Share score`);
  }
  const rank = finiteNumber(item.rank, `votes[${index}].rank`);
  if (!Number.isInteger(rank) || rank < 1 || rank > JURY_SHARE_POINTS.length) {
    throw new V3JuryShareProjectionError(`votes[${index}].rank is outside the supported range`);
  }

  return {
    recipientCountryId: requiredString(item.recipientCountryId, `votes[${index}].recipientCountryId`),
    displayName: requiredString(item.displayName, `votes[${index}].displayName`),
    shortDisplayName: optionalString(item.shortDisplayName),
    flagAsset: parseAsset(item.flagAsset, `votes[${index}].flagAsset`),
    identityVersion: requiredString(item.identityVersion, `votes[${index}].identityVersion`),
    points: points as JuryShareVote["points"],
    rank,
  };
}

function parseThemes(value: unknown): readonly JuryShareThemeAvailability[] {
  if (!Array.isArray(value)) {
    throw new V3JuryShareProjectionError("projection.themes must be an array");
  }

  const ids: readonly JuryShareThemeId[] = ["default", "edition", "liquid_glass"];
  const states: readonly JuryShareThemeState[] = ["available", "unconfigured", "invalid", "unsupported"];
  const seen = new Set<JuryShareThemeId>();

  const parsed = value.map((entry, index) => {
    const item = record(entry, `projection.themes[${index}]`);
    const id = item.id as JuryShareThemeId;
    const state = item.state as JuryShareThemeState;
    if (!ids.includes(id)) throw new V3JuryShareProjectionError(`Unsupported Jury Share theme: ${String(item.id)}`);
    if (!states.includes(state)) {
      throw new V3JuryShareProjectionError(`Unsupported Jury Share theme state: ${String(item.state)}`);
    }
    if (seen.has(id)) throw new V3JuryShareProjectionError(`Duplicate Jury Share theme: ${id}`);
    seen.add(id);
    return { id, state, reason: optionalString(item.reason) } satisfies JuryShareThemeAvailability;
  });

  if (!seen.has("default") || parsed.find((theme) => theme.id === "default")?.state !== "available") {
    throw new V3JuryShareProjectionError("Default Jury Share theme must be available");
  }

  return parsed;
}

function parseReadyProjection(value: unknown): { projection: JuryShareProjection; themes: readonly JuryShareThemeAvailability[] } {
  const item = record(value, "projection");
  if (item.schemaVersion !== 1) throw new V3JuryShareProjectionError("Unsupported Jury Share schema version");

  const edition = record(item.edition, "projection.edition");
  const show = record(item.show, "projection.show");
  const source = record(item.source, "projection.source");
  const result = record(item.result, "projection.result");
  const showType = show.type;
  if (showType !== "semi_final" && showType !== "final" && showType !== "other") {
    throw new V3JuryShareProjectionError("projection.show.type is unsupported");
  }

  const editionNumber = edition.number;
  if (editionNumber !== null && (typeof editionNumber !== "number" || !Number.isFinite(editionNumber))) {
    throw new V3JuryShareProjectionError("projection.edition.number must be finite or null");
  }

  if (!Array.isArray(item.votes)) throw new V3JuryShareProjectionError("projection.votes must be an array");
  const votes = normalizeJuryShareVotes(item.votes.map(parseVote));
  const publication = parsePublication(item.publication);
  if (!publication.shareable) {
    throw new V3JuryShareProjectionError("A ready Jury Share projection must be shareable");
  }

  const projection: JuryShareProjection = {
    schemaVersion: 1,
    ballotId: requiredString(item.ballotId, "projection.ballotId"),
    edition: {
      id: requiredString(edition.id, "projection.edition.id"),
      slug: requiredString(edition.slug, "projection.edition.slug"),
      number: editionNumber as number | null,
      name: requiredString(edition.name, "projection.edition.name"),
      historicalIdentityVersion: requiredString(
        edition.historicalIdentityVersion,
        "projection.edition.historicalIdentityVersion",
      ),
    },
    show: {
      id: requiredString(show.id, "projection.show.id"),
      name: requiredString(show.name, "projection.show.name"),
      type: showType,
    },
    source: {
      delegationId: requiredString(source.delegationId, "projection.source.delegationId"),
      countryId: requiredString(source.countryId, "projection.source.countryId"),
      displayName: requiredString(source.displayName, "projection.source.displayName"),
      shortDisplayName: optionalString(source.shortDisplayName),
      flagAsset: parseAsset(source.flagAsset, "projection.source.flagAsset"),
      identityVersion: requiredString(source.identityVersion, "projection.source.identityVersion"),
    },
    votes,
    result: {
      resultVersionId: requiredString(result.resultVersionId, "projection.result.resultVersionId"),
      publishedAt: requiredString(result.publishedAt, "projection.result.publishedAt"),
    },
    publication,
    stateVersion: requiredString(item.stateVersion, "projection.stateVersion"),
    serverTime: requiredString(item.serverTime, "projection.serverTime"),
  };

  return { projection, themes: parseThemes(item.themes) };
}

export function parseV3JuryShareSource(value: unknown): V3JuryShareSourceResult {
  const payload = record(value, "Jury Share response");

  if (payload.ok === false) {
    const publication = payload.publication ? parsePublication(payload.publication) : null;
    return {
      state: "unavailable",
      errorCode: requiredString(payload.errorCode, "errorCode"),
      reason: nullableString(payload.reason),
      publication,
      serverTime: nullableString(payload.serverTime),
    };
  }

  if (payload.ok !== true) throw new V3JuryShareProjectionError("Jury Share response must declare ok");
  if (payload.visibility !== "public" && payload.visibility !== "private") {
    throw new V3JuryShareProjectionError("Jury Share visibility is unsupported");
  }

  const ready = parseReadyProjection(payload.projection);
  return {
    state: "ready",
    visibility: payload.visibility,
    projection: ready.projection,
    themes: ready.themes,
  };
}
