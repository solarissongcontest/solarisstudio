import { createFileRoute, Outlet } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/compare")({ component: CompareLayout });

function CompareLayout() {
  return <V3LegacyRouteAdapter phaseLabel="Compare"><Outlet /></V3LegacyRouteAdapter>;
}
