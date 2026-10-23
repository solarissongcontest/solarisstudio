import { createFileRoute, Outlet } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/analysis")({ component: AnalysisLayout });

function AnalysisLayout() {
  return <V3LegacyRouteAdapter phaseLabel="Analysis"><Outlet /></V3LegacyRouteAdapter>;
}
