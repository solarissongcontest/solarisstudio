import { supabase } from "@/integrations/supabase/client";
import { uploadServerAuthorizedFile } from "@/lib/upload-safety";

const ALLOWED_BETA_SCREENSHOT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_BETA_SCREENSHOT_BYTES = 8 * 1024 * 1024;

function safeFileName(name: string) {
  const cleaned = name
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "screenshot";
}

export async function uploadBetaFeedbackScreenshot(input: {
  submissionId: string;
  bugId: string;
  file: File;
  admin?: boolean;
}) {
  if (!ALLOWED_BETA_SCREENSHOT_TYPES.has(input.file.type)) {
    throw new Error(`Screenshot “${input.file.name}” is not a supported image type.`);
  }
  if (input.file.size <= 0) {
    throw new Error(`Screenshot “${input.file.name}” is empty.`);
  }
  if (input.file.size > MAX_BETA_SCREENSHOT_BYTES) {
    throw new Error(`Screenshot “${input.file.name}” is larger than 8 MB.`);
  }

  const prefix = input.admin ? "admin/" : "";
  const storagePath =
    `${prefix}${input.submissionId}/${input.bugId}-${safeFileName(input.file.name)}`;

  await uploadServerAuthorizedFile({
    client: supabase,
    descriptor: {
      bucket: "beta-feedback",
      object_path: storagePath,
    },
    file: input.file,
    cacheControl: "3600",
  });

  return storagePath;
}
