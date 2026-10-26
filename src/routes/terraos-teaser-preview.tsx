import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import {
  TerraOSTeaserPreview,
  type TerraOSTeaserScreen,
} from "@/components/v3/TerraOSTeaserPreview";
import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";
import { requireTerraOsTeaserMaintenance } from "@/lib/terraos-teaser-preview-access";
import { installTerraOsTeaserHeroHandoff } from "@/lib/terraos-teaser-hero-handoff";
import { installTerraOsTeaserHostMicroMotion } from "@/lib/terraos-teaser-host-micro-motion";
import { installTerraOsTeaserMobileAccessibility } from "@/lib/terraos-teaser-mobile-accessibility";
import {
  TERRAOS_COMPACT_PREVIEW_MEDIA,
  installTerraOsTeaserHostMobilePolish,
  installTerraOsTeaserPreviewPolish,
} from "@/lib/terraos-teaser-mobile-polish";
import { installTerraOsTeaserMobileReferenceHero } from "@/lib/terraos-teaser-mobile-reference-hero";

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
    requireTerraOsTeaserMaintenance(GLOBAL_MAINTENANCE_MODE);
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

  useEffect(() => installTerraOsTeaserPreviewPolish(document), []);

  useEffect(() => {
    // The full Home renderer is the same-origin bridge already used by the
    // maintenance teaser. Content-only nested previews must never recursively
    // install host motion or outer-page presentation polish.
    if (screen !== "home" || chrome === "content") return;
    const frame = window.frameElement as HTMLElement | null;
    if (!frame) return;

    const hostWindow = frame.ownerDocument.defaultView;

    // Keep the approved three-phone opening and micro-motion. The continuous
    // desktop Home-device handoff remains useful on wider canvases, but it is
    // intentionally disabled at phone widths: fixing the first-look device to
    // the viewport while the next section enters was the source of the mobile
    // overlap shown in the regression captures.
    const cleanupMicroMotion = installTerraOsTeaserHostMicroMotion(frame);
    const cleanupReferenceHero = installTerraOsTeaserMobileReferenceHero(frame);
    const cleanupHostMobilePolish = installTerraOsTeaserHostMobilePolish(frame);
    const cleanupMobileAccessibility = installTerraOsTeaserMobileAccessibility(
      frame.ownerDocument,
    );
    const compactMedia = hostWindow?.matchMedia(TERRAOS_COMPACT_PREVIEW_MEDIA) ?? null;
    let cleanupHeroHandoff: () => void = () => undefined;

    const syncHeroHandoff = () => {
      cleanupHeroHandoff();
      cleanupHeroHandoff = compactMedia?.matches
        ? () => undefined
        : installTerraOsTeaserHeroHandoff(frame);
    };

    syncHeroHandoff();
    compactMedia?.addEventListener("change", syncHeroHandoff);

    return () => {
      compactMedia?.removeEventListener("change", syncHeroHandoff);
      cleanupHeroHandoff();
      cleanupMobileAccessibility();
      cleanupHostMobilePolish();
      cleanupReferenceHero();
      cleanupMicroMotion();
    };
  }, [screen, chrome]);

  return <TerraOSTeaserPreview screen={screen} showNavigation={chrome !== "content"} />;
}
