import { createFileRoute } from "@tanstack/react-router";

import {
  TerraOSTeaserPreview,
  type TerraOSTeaserScreen,
} from "@/components/v3/TerraOSTeaserPreview";

const SCREENS = new Set<TerraOSTeaserScreen>(["home", "explore", "participate"]);

export const Route = createFileRoute("/terraos-teaser-preview")({
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
