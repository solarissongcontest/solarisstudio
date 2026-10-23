import { createFileRoute, Outlet } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/tools")({ component: ToolsLayout });

function ToolsLayout() {
  return <V3LegacyRouteAdapter phaseLabel="Tools"><Outlet /></V3LegacyRouteAdapter>;
}
