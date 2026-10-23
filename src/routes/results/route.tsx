import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/results")({
  component: ResultsLayout,
});

function ResultsLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const resultsRoot = pathname === "/results" || pathname === "/results/";

  // The Results root already owns a native V3 Results gate. Adapt only legacy
  // descendants such as the historical edition-result redirect so the native
  // root never receives a nested V3 shell.
  if (resultsRoot) return <Outlet />;

  return (
    <V3LegacyRouteAdapter phaseLabel="Results">
      <Outlet />
    </V3LegacyRouteAdapter>
  );
}
