import { createFileRoute, Outlet } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/encyclopedia")({
  component: EncyclopediaLayout,
});

function EncyclopediaLayout() {
  return (
    <V3LegacyRouteAdapter phaseLabel="Encyclopedia">
      <Outlet />
    </V3LegacyRouteAdapter>
  );
}
