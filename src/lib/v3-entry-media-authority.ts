import { uploadVerifiedFile, type FinalizedUnifiedUpload } from "./upload-safety";

export const V3_ENTRY_MEDIA_ASSET_TYPES = ["artist_photo", "cover_artwork"] as const;
export type V3EntryMediaAssetType = (typeof V3_ENTRY_MEDIA_ASSET_TYPES)[number];

export type V3EntryMediaAuthorityState =
  | "processing"
  | "validating"
  | "accepted"
  | "failed"
  | "quarantined"
  | "replacement_required";

export type V3EntryMediaAuthorityAsset = {
  assetKey: string;
  assetType: V3EntryMediaAssetType;
  state: V3EntryMediaAuthorityState;
  reason: string | null;
  sourceFingerprint: string | null;
  updatedAt: string;
};

export type V3EntryMediaAuthorityProjection = {
  entryId: string;
  editionId: string;
  countryId: string;
  assets: V3EntryMediaAuthorityAsset[];
  serverTime: string;
};

export type V3EntryMediaCommitReceipt = {
  ok: true;
  replayed: boolean;
  tokenId: string;
  entryId: string;
  assetKey: string;
  assetType: V3EntryMediaAssetType;
  state: "validating";
  sourceFingerprint: string;
  updatedAt: string;
};

export type V3EntryMediaUploadResult = {
  upload: FinalizedUnifiedUpload;
  commit: V3EntryMediaCommitReceipt;
};

type RpcError = { message?: string } | null;
type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: RpcError }>;
};

function runtimeClient(client: unknown): RpcClient {
  return client as RpcClient;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function assetType(value: unknown): V3EntryMediaAssetType {
  if (value === "artist_photo" || value === "cover_artwork") return value;
  throw new Error("Solaris returned an unsupported Entry media asset type.");
}

function authorityState(value: unknown): V3EntryMediaAuthorityState {
  if (
    value === "processing" ||
    value === "validating" ||
    value === "accepted" ||
    value === "failed" ||
    value === "quarantined" ||
    value === "replacement_required"
  ) {
    return value;
  }
  throw new Error("Solaris returned an invalid Entry media state.");
}

function mapCommit(value: unknown): V3EntryMediaCommitReceipt {
  const row = object(value, "Entry media commit receipt");
  if (row.ok !== true || row.state !== "validating") {
    throw new Error("Solaris did not acknowledge the canonical Entry media commit.");
  }
  return {
    ok: true,
    replayed: row.replayed === true,
    tokenId: string(row.tokenId, "Entry media upload token"),
    entryId: string(row.entryId, "Entry media Entry id"),
    assetKey: string(row.assetKey, "Entry media asset key"),
    assetType: assetType(row.assetType),
    state: "validating",
    sourceFingerprint: string(row.sourceFingerprint, "Entry media source fingerprint"),
    updatedAt: string(row.updatedAt, "Entry media update time"),
  };
}

function mapProjection(value: unknown): V3EntryMediaAuthorityProjection {
  const row = object(value, "Entry media projection");
  if (!Array.isArray(row.assets)) {
    throw new Error("Solaris returned an invalid Entry media asset list.");
  }

  return {
    entryId: string(row.entryId, "Entry media Entry id"),
    editionId: string(row.editionId, "Entry media edition id"),
    countryId: string(row.countryId, "Entry media country id"),
    assets: row.assets.map((value) => {
      const asset = object(value, "Entry media asset");
      return {
        assetKey: string(asset.assetKey, "Entry media asset key"),
        assetType: assetType(asset.assetType),
        state: authorityState(asset.state),
        reason: nullableString(asset.reason),
        sourceFingerprint: nullableString(asset.sourceFingerprint),
        updatedAt: string(asset.updatedAt, "Entry media asset update time"),
      };
    }),
    serverTime: string(row.serverTime, "Entry media server time"),
  };
}

export async function commitVerifiedEntryMediaUpload(input: {
  client: unknown;
  tokenId: string;
}): Promise<V3EntryMediaCommitReceipt> {
  const tokenId = input.tokenId.trim();
  if (!tokenId) throw new Error("Entry media upload token is required.");

  const { data, error } = await runtimeClient(input.client).rpc(
    "v3_commit_entry_media_upload",
    { p_token_id: tokenId },
  );
  if (error) {
    throw new Error(error.message || "Solaris could not attach the verified media to this Entry.");
  }
  return mapCommit(data);
}

/**
 * One participant-facing vertical slice:
 * authorize exact Entry/slot -> quarantine -> verify/finalize -> canonical commit.
 *
 * `uploadVerifiedFile` keeps the same authorization/receipt in its mounted-file
 * retry cache. If the commit response is lost, calling this function again with
 * the same File replays the verified finalizer receipt and then idempotently
 * retries the canonical commit instead of minting another logical asset.
 */
export async function uploadVerifiedEntryMedia(input: {
  client: unknown;
  entryId: string;
  assetType: V3EntryMediaAssetType;
  file: File;
}): Promise<V3EntryMediaUploadResult> {
  const entryId = input.entryId.trim();
  if (!entryId) throw new Error("Entry id is required for media upload.");

  const upload = await uploadVerifiedFile({
    client: input.client,
    domain: "entry_media",
    entityId: entryId,
    scope: input.assetType,
    file: input.file,
  });

  const commit = await commitVerifiedEntryMediaUpload({
    client: input.client,
    tokenId: upload.token_id,
  });

  if (commit.entryId !== entryId || commit.assetType !== input.assetType) {
    throw new Error("Solaris committed media outside the authorized Entry slot.");
  }

  return { upload, commit };
}

export async function loadMyEntryMediaProjection(input: {
  client: unknown;
  entryId: string;
}): Promise<V3EntryMediaAuthorityProjection> {
  const entryId = input.entryId.trim();
  if (!entryId) throw new Error("Entry id is required for media projection.");

  const { data, error } = await runtimeClient(input.client).rpc("v3_my_entry_media", {
    p_entry_id: entryId,
  });
  if (error) {
    throw new Error(error.message || "Solaris could not load the current Entry media state.");
  }

  const projection = mapProjection(data);
  if (projection.entryId !== entryId) {
    throw new Error("Solaris returned Entry media for another Entry.");
  }
  return projection;
}
