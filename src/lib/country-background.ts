import { supabase } from "@/integrations/supabase/client";

const ALLOWED_BACKGROUND_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024;

function safeFileName(name: string) {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "background";
}

export async function uploadCountryBackground(countryId: string, file: File) {
  if (!ALLOWED_BACKGROUND_TYPES.has(file.type)) {
    throw new Error("Use a JPG, PNG, WebP or GIF image.");
  }
  if (file.size > MAX_BACKGROUND_BYTES) {
    throw new Error("Country background images can be at most 8 MB.");
  }

  const storagePath = `${countryId}/backgrounds/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from("country-media").upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("country-media").getPublicUrl(storagePath);
  return { storagePath, publicUrl: data.publicUrl };
}

export async function removeCountryBackground(storagePath?: string | null) {
  if (!storagePath) return;
  const { error } = await supabase.storage.from("country-media").remove([storagePath]);
  if (error) throw error;
}
