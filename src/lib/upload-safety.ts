import {
  applyV3MediaFinalizeOutcome,
  applyV3QuarantineUploadOutcome,
  beginV3MediaFinalization,
  beginV3QuarantineUpload,
  canCreateFreshV3MediaAuthorization,
  createV3MediaUploadContinuity,
  type V3MediaUploadContinuity,
} from "./v3-media-upload-continuity";

export type ServerAuthorizedUploadDescriptor = {
  bucket: string;
  object_path: string;
  token_id?: string;
};

export type UnifiedUploadDomain =
  | "country_media"
  | "edition_artwork"
  | "country_font"
  | "beta_feedback";

export type PreparedUnifiedUpload = ServerAuthorizedUploadDescriptor & {
  token_id: string;
  upload_secret: string;
  final_bucket: string;
  expires_at: string;
};

export type FinalizedUnifiedUpload = {
  ok: true;
  token_id: string;
  bucket: string;
  object_path: string;
  detected_mime: string;
  metadata: Record<string, unknown>;
  replayed: boolean;
};

export type PreparedExistingQuarantineUpload = ServerAuthorizedUploadDescriptor & {
  upload_authorization_id: string;
  upload_secret: string;
  final_bucket: string;
  final_path: string;
};

type UploadRuntimeClient = {
  auth?: {
    getSession(): PromiseLike<{
      data: { session: { user: { id: string } } | null };
      error: unknown;
    }>;
  };
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  functions: {
    invoke: (
      fn: string,
      options: { body: Record<string, unknown> },
    ) => PromiseLike<{ data: unknown; error: { message?: string; context?: Response } | null }>;
  };
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: File,
        options: {
          upsert: false;
          contentType: string;
          cacheControl: string;
        },
      ) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
};

function runtimeClient(client: unknown): UploadRuntimeClient {
  return client as UploadRuntimeClient;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Solaris returned an invalid ${label}.`);
  }
  return value;
}

export async function uploadServerAuthorizedFile(input: {
  client: unknown;
  descriptor: ServerAuthorizedUploadDescriptor;
  file: File;
  cacheControl?: string;
}): Promise<void> {
  const client = runtimeClient(input.client);
  const bucket = input.descriptor.bucket.trim();
  const objectPath = input.descriptor.object_path.trim();

  if (!bucket) throw new Error("Upload descriptor is missing a bucket.");
  if (!objectPath || objectPath.startsWith("/") || objectPath.split("/").includes("..")) {
    throw new Error("Upload descriptor contains an invalid object path.");
  }
  if (!input.file || input.file.size <= 0) {
    throw new Error("Cannot upload an empty file.");
  }

  const contentType = input.file.type.trim() || "application/octet-stream";
  const { error } = await client.storage.from(bucket).upload(objectPath, input.file, {
    upsert: false,
    contentType,
    cacheControl: input.cacheControl ?? "0",
  });
  if (error) {
    throw new Error(error.message || "Could not upload the authorized file.");
  }
}

export async function prepareUnifiedUpload(input: {
  client: unknown;
  domain: UnifiedUploadDomain;
  entityId?: string | null;
  scope?: string | null;
  file: File;
  context?: Record<string, unknown>;
}): Promise<PreparedUnifiedUpload> {
  if (!input.file || input.file.size <= 0) throw new Error("Cannot prepare an empty file.");
  const client = runtimeClient(input.client);

  const { data, error } = await client.rpc("studio2_prepare_upload", {
    p_domain: input.domain,
    p_entity_id: input.entityId ?? null,
    p_scope: input.scope ?? null,
    p_name: input.file.name,
    p_mime: input.file.type || "application/octet-stream",
    p_size: input.file.size,
    p_context: input.context ?? {},
  });
  if (error) throw new Error(error.message || "Solaris could not authorize this upload.");

  const row = object(data, "upload authorization");
  if (row.bucket !== "solaris-upload-quarantine") {
    throw new Error("Solaris returned an unsafe upload bucket.");
  }

  return {
    token_id: requiredString(row.token_id, "upload token"),
    upload_secret: requiredString(row.upload_secret, "upload capability"),
    bucket: requiredString(row.bucket, "upload bucket"),
    object_path: requiredString(row.object_path, "quarantine path"),
    final_bucket: requiredString(row.final_bucket, "final upload bucket"),
    expires_at: requiredString(row.expires_at, "upload expiry"),
  };
}

export async function finalizeUnifiedUpload(input: {
  client: unknown;
  prepared: PreparedUnifiedUpload;
}): Promise<FinalizedUnifiedUpload> {
  const client = runtimeClient(input.client);
  const { data, error } = await client.functions.invoke("solaris-upload-finalize", {
    body: {
      token_id: input.prepared.token_id,
      upload_secret: input.prepared.upload_secret,
    },
  });
  if (error) {
    let code: unknown;
    try {
      code = (await error.context?.clone().json())?.code;
    } catch {
      // Unreadable responses remain uncertain; never infer terminal state from
      // a transport error, HTTP status alone, or a human-readable message.
    }
    throw new UnifiedUploadFinalizeError(
      error.message || "Solaris could not verify this upload.",
      typeof code === "string" ? code : null,
    );
  }

  const row = object(data, "verified upload receipt");
  if (row.ok !== true) throw new Error("Solaris did not verify the uploaded file.");
  if (row.token_id !== input.prepared.token_id || row.bucket !== input.prepared.final_bucket) {
    throw new Error("Verified upload did not match its authorization.");
  }

  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};

  return {
    ok: true,
    token_id: requiredString(row.token_id, "verified upload token"),
    bucket: requiredString(row.bucket, "verified upload bucket"),
    object_path: requiredString(row.object_path, "verified upload path"),
    detected_mime: requiredString(row.detected_mime, "verified upload MIME type"),
    metadata,
    replayed: row.replayed === true,
  };
}

export async function uploadPreparedQuarantineFile(input: {
  client: unknown;
  descriptor: PreparedExistingQuarantineUpload;
  file: File;
}): Promise<FinalizedUnifiedUpload> {
  if (input.descriptor.bucket !== "solaris-upload-quarantine") {
    throw new Error("Prepared upload did not use the Solaris quarantine bucket.");
  }

  await uploadServerAuthorizedFile({
    client: input.client,
    descriptor: input.descriptor,
    file: input.file,
    cacheControl: "0",
  });

  const receipt = await finalizeUnifiedUpload({
    client: input.client,
    prepared: {
      token_id: input.descriptor.upload_authorization_id,
      upload_secret: input.descriptor.upload_secret,
      bucket: input.descriptor.bucket,
      object_path: input.descriptor.object_path,
      final_bucket: input.descriptor.final_bucket,
      expires_at: "",
    },
  });

  if (
    receipt.bucket !== input.descriptor.final_bucket ||
    receipt.object_path !== input.descriptor.final_path
  ) {
    throw new Error("Verified upload did not match the prepared final destination.");
  }

  return receipt;
}

type VerifiedFileInput = {
  client: unknown;
  domain: UnifiedUploadDomain;
  entityId?: string | null;
  scope?: string | null;
  file: File;
  context?: Record<string, unknown>;
};

export class UnifiedUploadFinalizeError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "UnifiedUploadFinalizeError";
  }
}

type PendingUpload = {
  prepared?: PreparedUnifiedUpload;
  continuity?: V3MediaUploadContinuity;
  receipt?: FinalizedUnifiedUpload;
  inFlight?: Promise<FinalizedUnifiedUpload>;
};

// File identity includes the actual immutable bytes, not just a filename.
// Weak keys release capabilities when the selected File/client is discarded.
// This supports mounted-form retries; it deliberately does not persist secrets
// or claim recovery across page reloads without the original file/capability.
const pendingUploads = new WeakMap<object, WeakMap<File, Map<string, PendingUpload>>>();

function uploadScope(input: VerifiedFileInput, actor: string | null) {
  return JSON.stringify(
    [actor, input.domain, input.entityId ?? null, input.scope ?? null, input.context ?? {}],
    (_key, value: unknown) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
      }
      return value;
    },
  );
}

async function runVerifiedUpload(input: VerifiedFileInput, pending: PendingUpload) {
  if (pending.receipt) return pending.receipt;
  if (!pending.prepared) {
    pending.prepared = await prepareUnifiedUpload(input);
    pending.continuity = createV3MediaUploadContinuity({
      tokenId: pending.prepared.token_id,
      quarantineBucket: pending.prepared.bucket,
      quarantinePath: pending.prepared.object_path,
      finalBucket: pending.prepared.final_bucket,
    });
  }

  const prepared = pending.prepared;
  let continuity = pending.continuity!;
  if (continuity.state === "prepared" || continuity.state === "retry_upload") {
    continuity = beginV3QuarantineUpload(continuity);
    pending.continuity = continuity;
    try {
      await uploadServerAuthorizedFile({
        client: input.client,
        descriptor: prepared,
        file: input.file,
      });
      continuity = applyV3QuarantineUploadOutcome(continuity, { kind: "uploaded" });
    } catch {
      // A duplicate object or lost response proves neither success nor failure.
      // The authenticated finalizer determines whether these exact bytes exist.
      continuity = applyV3QuarantineUploadOutcome(continuity, { kind: "transport_ambiguous" });
    }
  }

  continuity = beginV3MediaFinalization(continuity);
  pending.continuity = continuity;
  try {
    const receipt = await finalizeUnifiedUpload({ client: input.client, prepared });
    pending.continuity = applyV3MediaFinalizeOutcome(continuity, {
      kind: "verified",
      receipt: {
        tokenId: receipt.token_id,
        bucket: receipt.bucket,
        objectPath: receipt.object_path,
        detectedMime: receipt.detected_mime,
        metadata: receipt.metadata,
        replayed: receipt.replayed,
      },
    });
    pending.receipt = receipt;
    return receipt;
  } catch (caught) {
    const code = caught instanceof UnifiedUploadFinalizeError ? caught.code : null;
    pending.continuity = applyV3MediaFinalizeOutcome(
      continuity,
      code === "quarantine_missing"
        ? { kind: "quarantine_missing" }
        : code === "authorization_expired"
          ? { kind: "authorization_expired" }
          : code === "authorization_rejected"
            ? { kind: "authorization_rejected", reason: "Server rejected this upload." }
            : { kind: "transport_ambiguous" },
    );
    throw caught;
  }
}

export async function uploadVerifiedFile(
  input: VerifiedFileInput,
): Promise<FinalizedUnifiedUpload> {
  if (!input.file || input.file.size <= 0) throw new Error("Cannot prepare an empty file.");
  const client = runtimeClient(input.client);
  // Session identity only partitions the retry cache. Server authorization and
  // finalization continue to validate the actual authenticated actor and scope.
  const session = await client.auth?.getSession();
  if (session?.error)
    throw new Error("Could not determine the upload session. Retry after reconnecting.");
  const scope = uploadScope(input, session?.data.session?.user.id ?? null);
  let files = pendingUploads.get(client);
  if (!files) pendingUploads.set(client, (files = new WeakMap()));
  let scopes = files.get(input.file);
  if (!scopes) files.set(input.file, (scopes = new Map()));
  let pending = scopes.get(scope);
  if (!pending || (pending.continuity && canCreateFreshV3MediaAuthorization(pending.continuity))) {
    pending = {};
    scopes.set(scope, pending);
  }
  if (pending.inFlight) return pending.inFlight;
  const current = pending;
  current.inFlight = runVerifiedUpload(input, current);
  try {
    return await current.inFlight;
  } finally {
    current.inFlight = undefined;
    if (!current.prepared) scopes.delete(scope);
  }
}
