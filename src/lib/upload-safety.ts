export type ServerAuthorizedUploadDescriptor = {
  bucket: string;
  object_path: string;
  token_id?: string;
};

type UploadStorageClient = {
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

export async function uploadServerAuthorizedFile(input: {
  client: UploadStorageClient;
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
