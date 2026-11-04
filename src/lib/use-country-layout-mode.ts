import { useEffect, useState } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import {
  COUNTRY_MOBILE_WEB_MEDIA_QUERY,
  resolveCountryLayoutMode,
  type CountryLayoutMode,
} from "@/lib/country-layout-mode";

function matchesMobileWebViewport(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.(COUNTRY_MOBILE_WEB_MEDIA_QUERY).matches ?? false)
  );
}

/**
 * Installed-app identity comes from the existing runtime, never the viewport.
 * For ordinary browsers select the actual layout before first client paint and
 * subscribe to subsequent viewport changes, including older Safari.
 */
export function useCountryLayoutMode(): CountryLayoutMode {
  const { isAppMode } = useSolarisApp();
  const [narrowViewport, setNarrowViewport] = useState(matchesMobileWebViewport);

  useEffect(() => {
    const media = window.matchMedia?.(COUNTRY_MOBILE_WEB_MEDIA_QUERY);
    if (!media) return;
    const update = () => setNarrowViewport(media.matches);
    update();

    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener?.(update);
    return () => media.removeListener?.(update);
  }, []);

  return resolveCountryLayoutMode(isAppMode, narrowViewport);
}
