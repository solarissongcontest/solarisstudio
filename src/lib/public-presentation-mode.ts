/**
 * One canonical Solaris runtime, three intentional presentation families.
 * Width selects a WEB composition, never the installed-app identity.
 */
export type PublicPresentationMode = "installed-app" | "mobile-web" | "desktop-web";

export const PUBLIC_PHONE_WEB_QUERY = "(max-width: 767px)";

export function resolvePublicPresentationMode(
  isAppMode: boolean,
  narrowViewport: boolean,
): PublicPresentationMode {
  return isAppMode ? "installed-app" : narrowViewport ? "mobile-web" : "desktop-web";
}
