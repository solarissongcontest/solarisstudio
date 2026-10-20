import { createFileRoute, Outlet } from "@tanstack/react-router";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3FoundationShell, V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { V3LiveRouteGate } from "@/components/v3/V3LiveRouteGate";

export const Route = createFileRoute("/show-mode")({
  component: ShowModeLayout,
});

function ShowModeLayout() {
  const { isAppMode, platformResolved } = useSolarisApp();

  if (!platformResolved) {
    return (
      <V3FoundationShell>
        <V3Screen className="min-h-dvh" data-v3-live-boot="">
          <V3Surface level="raised" className="p-5">
            <h1 className="text-2xl font-bold">Show Mode</h1>
            <p role="status" className="mt-2 text-sm text-white/55">
              Opening the live experience…
            </p>
          </V3Surface>
        </V3Screen>
      </V3FoundationShell>
    );
  }

  if (!isAppMode) return <Outlet />;

  return <V3LiveRouteGate fallback={<Outlet />} />;
}
