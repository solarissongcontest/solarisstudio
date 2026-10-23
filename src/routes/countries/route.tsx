import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/countries")({
  component: CountriesLayout,
});

function CountriesLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const directoryRoot = pathname === "/countries" || pathname === "/countries/";

  // Country detail owns a dedicated V3 Delegation gate already. Only adapt the
  // still-legacy directory root here so we never nest two V3 shells.
  if (!directoryRoot) return <Outlet />;

  return (
    <V3LegacyRouteAdapter phaseLabel="Countries">
      <Outlet />
    </V3LegacyRouteAdapter>
  );
}
