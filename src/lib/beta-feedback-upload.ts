import { supabase } from "@/integrations/supabase/client";
import { uploadVerifiedFile } from "@/lib/upload-safety";

const ALLOWED_BETA_SCREENSHOT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const MAX_BETA_SCREENSHOT_BYTES = 5 * 1024 * 1024;

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
    throw new Error(`Screenshot “${input.file.name}” is larger than 5 MB.`);
  }

  const receipt = await uploadVerifiedFile({
    client: supabase,
    domain: "beta_feedback",
    file: input.file,
    context: {
      admin: Boolean(input.admin),
      submissionId: input.submissionId,
      bugId: input.bugId,
    },
  });

  if (receipt.bucket !== "beta-feedback") {
    throw new Error("Solaris verified the beta screenshot into an unexpected bucket.");
  }

  return receipt.object_path;
}
