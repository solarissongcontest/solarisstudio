import { createFileRoute, notFound } from "@tanstack/react-router";

import {
  TerraOSTeaserPreview,
  type TerraOSTeaserScreen,
} from "@/components/v3/TerraOSTeaserPreview";
import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";

const SCREENS = new Set<TerraOSTeaserScreen>(["home", "explore", "participate"]);

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
  const { screen } = Route.useSearch();
  return <TerraOSTeaserPreview screen={screen} />;
}
