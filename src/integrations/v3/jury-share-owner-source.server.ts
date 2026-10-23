import { z } from "zod";

import { createSolarisAuthenticatedClientServer } from "@/integrations/supabase/organizer.server";
import {
  normalizeJuryShareVotes,
  type JuryShareProjection,
} from "@/lib/v3-jury-share-card-foundation";

type JuryShareSourceClient = {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: unknown;
  }>;
};

export type V3OwnerJuryShareErrorCode =
  | "JURY_SHARE_NOT_PUBLISHED"
  | "JURY_SHARE_NOT_AUTHORIZED"
  | "JURY_SHARE_BALLOT_NOT_FOUND"
  | "JURY_SHARE_RESULT_CHANGED"
  | "JURY_SHARE_THEME_UNAVAILABLE"
  | "JURY_SHARE_THEME_INVALID"
  | "JURY_SHARE_RENDER_FAILED"
  | "JURY_SHARE_ASSET_FAILED"
  | "JURY_SHARE_FORMAT_UNSUPPORTED"
  | "JURY_SHARE_PROJECTION_INVALID"
  | "JURY_SHARE_CONTRACT_UNAVAILABLE";

export type V3OwnerJuryShareResult =
  | {
      status: "available";
      visibility: "private" | "public";
      projection: JuryShareProjection;
    }
  | {
      status: "unavailable";
      code: V3OwnerJuryShareErrorCode;
      reason: string | null;
      serverTime: string | null;
    };

const pointSchema = z.union([
  z.literal(12),
  z.literal(10),
  z.literal(8),
  z.literal(7),
  z.literal(6),
  z.literal(5),
  z.literal(4),
  z.literal(3),
  z.literal(2),
  z.literal(1),
]);

const assetSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  alt: z.string().min(1),
});

const themeSchema = z.object({
  id: z.enum(["default", "edition", "liquid_glass"]),
  state: z.enum(["available", "unconfigured", "invalid", "unsupported"]),
  reason: z.string().optional(),
});

const projectionSchema = z.object({
  schemaVersion: z.literal(1),
  ballotId: z.string().uuid(),
  edition: z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    number: z.number().int().nullable(),
    name: z.string().min(1),
    historicalIdentityVersion: z.string().min(1),
  }),
  show: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    type: z.enum(["semi_final", "final", "other"]),
  }),
  source: z.object({
    delegationId: z.string().min(1),
    countryId: z.string().uuid(),
    displayName: z.string().min(1),
    shortDisplayName: z.string().min(1).optional(),
    flagAsset: assetSchema,
    identityVersion: z.string().min(1),
  }),
  votes: z.array(
    z.object({
      recipientCountryId: z.string().uuid(),
      displayName: z.string().min(1),
      shortDisplayName: z.string().min(1).optional(),
      flagAsset: assetSchema,
      identityVersion: z.string().min(1),
      points: pointSchema,
      rank: z.number().int().min(1).max(10),
    }),
  ),
  result: z.object({
    resultVersionId: z.string().min(1),
    publishedAt: z.string().min(1),
  }),
  themes: z.array(themeSchema),
  publication: z.object({
    shareable: z.literal(true),
    reason: z.null(),
  }),
  stateVersion: z.string().min(1),
  serverTime: z.string().min(1),
});

const errorCodes = new Set<V3OwnerJuryShareErrorCode>([
  "JURY_SHARE_NOT_PUBLISHED",
  "JURY_SHARE_NOT_AUTHORIZED",
  "JURY_SHARE_BALLOT_NOT_FOUND",
  "JURY_SHARE_RESULT_CHANGED",
  "JURY_SHARE_THEME_UNAVAILABLE",
  "JURY_SHARE_THEME_INVALID",
  "JURY_SHARE_RENDER_FAILED",
  "JURY_SHARE_ASSET_FAILED",
  "JURY_SHARE_FORMAT_UNSUPPORTED",
  "JURY_SHARE_PROJECTION_INVALID",
]);

function errorDetails(error: unknown): { code: string | null; message: string } {
  if (!error || typeof error !== "object") {
    return { code: null, message: "Jury share projection failed" };
  }
  const row = error as Record<string, unknown>;
  return {
    code: typeof row.code === "string" ? row.code : null,
    message:
      typeof row.message === "string" && row.message.trim()
        ? row.message
        : "Jury share projection failed",
  };
}

function missingJuryShareContract(error: unknown) {
  const details = errorDetails(error);
  const message = details.message.toLowerCase();
  return (
    details.code === "42883" ||
    details.code === "PGRST202" ||
    message.includes("v3_jury_share_projection")
  );
}

function unavailableFromRpc(data: unknown): V3OwnerJuryShareResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      status: "unavailable",
      code: "JURY_SHARE_PROJECTION_INVALID",
      reason: "invalid_projection_response",
      serverTime: null,
    };
  }

  const row = data as Record<string, unknown>;
  const rawCode = typeof row.errorCode === "string" ? row.errorCode : "";
  const code = errorCodes.has(rawCode as V3OwnerJuryShareErrorCode)
    ? (rawCode as V3OwnerJuryShareErrorCode)
    : "JURY_SHARE_PROJECTION_INVALID";

  return {
    status: "unavailable",
    code,
    reason: typeof row.reason === "string" ? row.reason : null,
    serverTime: typeof row.serverTime === "string" ? row.serverTime : null,
  };
}

/**
 * Authenticated Me/History Jury Share source.
 *
 * The browser supplies only exact Show/Country identity. The System projection
 * remains authoritative for ballot ownership, publication, Result Version,
 * historical identities and point rows. This adapter never reads Jury tables
 * directly and never reconstructs owner access from browser state.
 *
 * A successful `private` projection proves owner-only access. Once detailed
 * voting is public the same canonical RPC may return `public`; the Me route then
 * presents it as an official public ballot rather than falsely claiming that a
 * tamperable URL itself proves ownership.
 */
export async function loadV3OwnerJuryShareProjection(input: {
  showId: string;
  countryId: string;
}): Promise<V3OwnerJuryShareResult> {
  const client = createSolarisAuthenticatedClientServer() as unknown as JuryShareSourceClient;
  const result = await client.rpc("v3_jury_share_projection", {
    p_show_id: input.showId,
    p_voter_country_id: input.countryId,
  });

  if (result.error) {
    if (missingJuryShareContract(result.error)) {
      return {
        status: "unavailable",
        code: "JURY_SHARE_CONTRACT_UNAVAILABLE",
        reason: "system_projection_unavailable",
        serverTime: null,
      };
    }

    const details = errorDetails(result.error);
    if (details.code === "42501") {
      return {
        status: "unavailable",
        code: "JURY_SHARE_NOT_AUTHORIZED",
        reason: "ballot_not_owned_or_public",
        serverTime: null,
      };
    }
    throw new Error(`Could not load your Jury share projection: ${details.message}`);
  }

  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data)) {
    return unavailableFromRpc(result.data);
  }

  const envelope = result.data as Record<string, unknown>;
  if (envelope.ok !== true) return unavailableFromRpc(result.data);
  if (envelope.visibility !== "private" && envelope.visibility !== "public") {
    return {
      status: "unavailable",
      code: "JURY_SHARE_PROJECTION_INVALID",
      reason: "projection_visibility_invalid",
      serverTime: null,
    };
  }

  const parsed = projectionSchema.safeParse(envelope.projection);
  if (!parsed.success) {
    return {
      status: "unavailable",
      code: "JURY_SHARE_PROJECTION_INVALID",
      reason: "projection_shape_invalid",
      serverTime: null,
    };
  }

  const projection: JuryShareProjection = {
    ...parsed.data,
    votes: normalizeJuryShareVotes(parsed.data.votes),
  };

  return {
    status: "available",
    visibility: envelope.visibility,
    projection,
  };
}
