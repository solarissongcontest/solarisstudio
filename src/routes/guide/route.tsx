import { createFileRoute, Outlet } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/guide")({ component: GuideLayout });

function GuideLayout() {
  return <V3LegacyRouteAdapter phaseLabel="Guide"><Outlet /></V3LegacyRouteAdapter>;
}
