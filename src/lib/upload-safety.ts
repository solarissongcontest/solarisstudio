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

type UploadRuntimeClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  functions: {
    invoke: (
      fn: string,
      options: { body: Record<string, unknown> },
    ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
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
  client: Pick<UploadRuntimeClient, "storage">;
  descriptor: ServerAuthorizedUploadDescriptor;
  file: File;
  cacheControl?: string;
}): Promise<void> {
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
  const { error } = await input.client.storage.from(bucket).upload(objectPath, input.file, {
    upsert: false,
    contentType,
    cacheControl: input.cacheControl ?? "0",
  });
  if (error) {
    throw new Error(error.message || "Could not upload the authorized file.");
  }
}

export async function prepareUnifiedUpload(input: {
  client: Pick<UploadRuntimeClient, "rpc">;
  domain: UnifiedUploadDomain;
  entityId?: string | null;
  scope?: string | null;
  file: File;
  context?: Record<string, unknown>;
}): Promise<PreparedUnifiedUpload> {
  if (!input.file || input.file.size <= 0) throw new Error("Cannot prepare an empty file.");

  const { data, error } = await input.client.rpc("studio2_prepare_upload", {
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
  client: Pick<UploadRuntimeClient, "functions">;
  prepared: PreparedUnifiedUpload;
}): Promise<FinalizedUnifiedUpload> {
  const { data, error } = await input.client.functions.invoke("solaris-upload-finalize", {
    body: {
      token_id: input.prepared.token_id,
      upload_secret: input.prepared.upload_secret,
    },
  });
  if (error) throw new Error(error.message || "Solaris could not verify this upload.");

  const row = object(data, "verified upload receipt");
  if (row.ok !== true) throw new Error("Solaris did not verify the uploaded file.");

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

export async function uploadVerifiedFile(input: {
  client: UploadRuntimeClient;
  domain: UnifiedUploadDomain;
  entityId?: string | null;
  scope?: string | null;
  file: File;
  context?: Record<string, unknown>;
}): Promise<FinalizedUnifiedUpload> {
  const prepared = await prepareUnifiedUpload(input);

  await uploadServerAuthorizedFile({
    client: input.client,
    descriptor: prepared,
    file: input.file,
    cacheControl: "0",
  });

  const receipt = await finalizeUnifiedUpload({
    client: input.client,
    prepared,
  });

  if (receipt.bucket !== prepared.final_bucket) {
    throw new Error("Verified upload destination did not match the authorized destination.");
  }

  return receipt;
}
