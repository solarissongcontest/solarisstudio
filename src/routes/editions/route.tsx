import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";

import { V3LegacyRouteAdapter } from "@/components/v3/V3LegacyRouteAdapter";

export const Route = createFileRoute("/editions")({
  component: EditionsLayout,
});

function EditionsLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const directoryRoot = pathname === "/editions" || pathname === "/editions/";

  // Edition detail already owns its dedicated V3 Edition Hub cutover. Keep that
  // authority intact and adapt only the archive/directory root.
  if (!directoryRoot) return <Outlet />;

  return (
    <V3LegacyRouteAdapter phaseLabel="Editions">
      <Outlet />
    </V3LegacyRouteAdapter>
  );
}
