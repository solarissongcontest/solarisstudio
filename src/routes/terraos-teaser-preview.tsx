import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";

import {
  TerraOSTeaserPreview,
  type TerraOSTeaserScreen,
} from "@/components/v3/TerraOSTeaserPreview";
import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";
import { installTerraOsTeaserHeroHandoff } from "@/lib/terraos-teaser-hero-handoff";
import { installTerraOsTeaserHostMicroMotion } from "@/lib/terraos-teaser-host-micro-motion";

const SCREENS = new Set<TerraOSTeaserScreen>([
  "home",
  "explore",
  "participate",
  "results",
  "me",
]);

export const Route = createFileRoute("/terraos-teaser-preview")({
  beforeLoad: () => {
    // This is a maintenance-only visual renderer, not a permanent public route.
    // Once launch removes global maintenance, stale/bookmarked teaser URLs must
    // disappear with it rather than exposing fixture data beside the live app.
    if (!GLOBAL_MAINTENANCE_MODE) throw notFound();
  },
  validateSearch: (search: Record<string, unknown>) => {
    const requested = typeof search.screen === "string" ? search.screen : "home";
    return {
      screen: (SCREENS.has(requested as TerraOSTeaserScreen)
        ? requested
        : "home") as TerraOSTeaserScreen,
      chrome: search.chrome === "content" ? ("content" as const) : ("full" as const),
    };
  },
  head: () => ({
    meta: [
      { title: "TerraOS 3 preview — Solaris Studio" },
      { name: "robots", content: "noindex,nofollow" },
      {
        name: "description",
        content: "Fixture-only TerraOS 3 visual preview used by the Solaris Studio maintenance teaser.",
      },
    ],
  }),
  component: TerraOSTeaserPreviewRoute,
});

function TerraOSTeaserPreviewRoute() {
  const { screen, chrome } = Route.useSearch();

  useEffect(() => {
    // The full Home renderer is the same-origin bridge already used by the
    // maintenance teaser. Content-only nested previews must never recursively
    // install host motion or the cross-scene hero handoff.
    if (screen !== "home" || chrome === "content") return;
    const frame = window.frameElement as HTMLElement | null;
    if (!frame) return;

    // Keep the original mobile hero composition from the maintenance host:
    // title + launch information + countdown + the three-phone product tableau.
    // Only the subtle physical response and later Home-device handoff refine it.
    const cleanupMicroMotion = installTerraOsTeaserHostMicroMotion(frame);
    const cleanupHeroHandoff = installTerraOsTeaserHeroHandoff(frame);
    return () => {
      cleanupHeroHandoff();
      cleanupMicroMotion();
    };
  }, [screen, chrome]);

  return <TerraOSTeaserPreview screen={screen} showNavigation={chrome !== "content"} />;
}
