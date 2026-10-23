import { createFileRoute, Outlet } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/pulse")({
  component: PulseLayout,
});

function PulseLayout() {
  return (
    <V3LegacyRouteAdapter phaseLabel="Pulse">
      <Outlet />
    </V3LegacyRouteAdapter>
  );
}
