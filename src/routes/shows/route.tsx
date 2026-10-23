import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/shows")({
  component: ShowsLayout,
});

function ShowsLayout() {
  const searchStr = useRouterState({ select: (state) => state.location.searchStr });
  const search = new URLSearchParams(searchStr.startsWith("?") ? searchStr.slice(1) : searchStr);
  const fromResults = search.get("from") === "results";

  // Scoreboard/result authority stays inside the existing Show route. The
  // adapter changes installed-app chrome only, and the screen registry keeps
  // result-origin Shows under the Results tab while normal discovery stays in
  // Explore.
  return (
    <V3LegacyRouteAdapter phaseLabel={fromResults ? "Results" : "Shows"}>
      <Outlet />
    </V3LegacyRouteAdapter>
  );
}
