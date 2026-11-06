import { useSyncExternalStore } from "react";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { COUNTRY_DIRECTORY_MOBILE_MEDIA, resolveCountryDirectoryPresentation } from "@/lib/country-directory-presentation";

function mobileWebSnapshot() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(COUNTRY_DIRECTORY_MOBILE_MEDIA).matches);
}

function subscribeMobileViewport(onChange: () => void) {
  const media = window.matchMedia?.(COUNTRY_DIRECTORY_MOBILE_MEDIA);
  if (!media) return () => undefined;
  if (media.addEventListener) {
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }
  media.addListener?.(onChange);
  return () => media.removeListener?.(onChange);
}

/** A browser narrowed to phone width must remain a website, never an installed app. */
export function useCountryDirectoryPresentation() {
  const { isAppMode } = useSolarisApp();
  const narrow = useSyncExternalStore(subscribeMobileViewport, mobileWebSnapshot, () => false);
  return resolveCountryDirectoryPresentation(isAppMode, narrow);
}
