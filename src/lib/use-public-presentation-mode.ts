import { useSyncExternalStore } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import {
  PUBLIC_PHONE_WEB_QUERY,
  resolvePublicPresentationMode,
  type PublicPresentationMode,
} from "@/lib/public-presentation-mode";

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

/** Resolve the existing app runtime first; viewport only selects a web layout. */
export function usePublicPresentationMode(): PublicPresentationMode {
  const { isAppMode } = useSolarisApp();
  const narrowViewport = useSyncExternalStore(
    subscribePhoneWebViewport,
    getPhoneWebViewport,
    () => false,
  );
  return resolvePublicPresentationMode(isAppMode, narrowViewport);
}
