import { createFileRoute, Outlet } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/wiki")({
  component: WikiLayout,
});

function WikiLayout() {
  return (
    <V3LegacyRouteAdapter phaseLabel="Wiki">
      <Outlet />
    </V3LegacyRouteAdapter>
  );
}
