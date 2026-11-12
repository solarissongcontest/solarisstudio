/** App identity comes from the runtime; viewport selects only website composition. */
export type CountryDirectoryPresentation = "installed-app" | "mobile-web" | "desktop-web";
export const COUNTRY_DIRECTORY_MOBILE_MEDIA = "(max-width: 767px)";

export function resolveCountryDirectoryPresentation(isAppMode: boolean, isMobileViewport: boolean): CountryDirectoryPresentation {
  if (isAppMode) return "installed-app";
  return isMobileViewport ? "mobile-web" : "desktop-web";
}
