import { useCountryDirectoryPresentation } from "@/lib/use-country-directory-presentation";
import type { CountryLayoutMode } from "@/lib/country-layout-mode";

/** Country and Wiki details share the established runtime-first directory detector. */
export function useCountryLayoutMode(): CountryLayoutMode {
  return useCountryDirectoryPresentation();
}
