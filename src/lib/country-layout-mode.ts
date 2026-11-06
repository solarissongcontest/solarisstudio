import {
  COUNTRY_DIRECTORY_MOBILE_MEDIA,
  resolveCountryDirectoryPresentation,
  type CountryDirectoryPresentation,
} from "@/lib/country-directory-presentation";

/** Country details and Countries discovery resolve the same three experiences. */
export type CountryLayoutMode = CountryDirectoryPresentation;
export const COUNTRY_MOBILE_WEB_MEDIA_QUERY = COUNTRY_DIRECTORY_MOBILE_MEDIA;
export const resolveCountryLayoutMode = resolveCountryDirectoryPresentation;
