import { useSyncExternalStore } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";

/**
 * One canonical Solaris runtime, three intended presentation families.
 * Breakpoints choose a WEB composition only after installed-app identity is
 * established; they must never turn browser Safari into the PWA shell.
 */
export type PublicPresentationMode = "installed-app" | "mobile-web" | "desktop-web";

export const PUBLIC_PHONE_WEB_QUERY = "(max-width: 767px)";

export function resolvePublicPresentationMode(
  isAppMode: boolean,
  narrowViewport: boolean,
): PublicPresentationMode {
  return isAppMode ? "installed-app" : narrowViewport ? "mobile-web" : "desktop-web";
}

function subscribePhoneWebViewport(notify: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const query = window.matchMedia(PUBLIC_PHONE_WEB_QUERY);
  if (query.addEventListener) {
    query.addEventListener("change", notify);
    return () => query.removeEventListener("change", notify);
  }
  query.addListener?.(notify);
  return () => query.removeListener?.(notify);
}

function getPhoneWebViewport(): boolean {
  return typeof window !== "undefined" &&
    (window.matchMedia?.(PUBLIC_PHONE_WEB_QUERY).matches ?? false);
}

/** Hydration-safe; caller keeps the established platform-resolution gate. */
export function usePublicPresentationMode(): PublicPresentationMode {
  const { isAppMode } = useSolarisApp();
  const narrowViewport = useSyncExternalStore(
    subscribePhoneWebViewport,
    getPhoneWebViewport,
    () => false,
  );
  return resolvePublicPresentationMode(isAppMode, narrowViewport);
}
