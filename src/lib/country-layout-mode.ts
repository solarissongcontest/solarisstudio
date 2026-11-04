/** Explicit surface ownership: a phone-sized browser is not an installed app. */
export type CountryLayoutMode = "mobile-web" | "desktop-web" | "installed-app";
export const COUNTRY_MOBILE_WEB_MEDIA_QUERY = "(max-width: 767px)";

export function resolveCountryLayoutMode(
  isAppMode: boolean,
  narrowViewport: boolean,
): CountryLayoutMode {
  if (isAppMode) return "installed-app";
  return narrowViewport ? "mobile-web" : "desktop-web";
}
