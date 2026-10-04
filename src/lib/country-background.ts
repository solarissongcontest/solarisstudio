import { supabase } from "@/integrations/supabase/client";
import { uploadCountryAsset } from "@/lib/country-account";

export async function uploadCountryBackground(countryId: string, file: File) {
  return uploadCountryAsset(countryId, file, "backgrounds");
}

export async function removeCountryBackground(storagePath?: string | null) {
  if (!storagePath) return;
  const { error } = await supabase.storage.from("country-media").remove([storagePath]);
  if (error) throw error;
}
