import { uploadCountryAsset } from "@/lib/country-account";

export async function uploadCountryBackground(countryId: string, file: File) {
  return uploadCountryAsset(countryId, file, "backgrounds");
}
