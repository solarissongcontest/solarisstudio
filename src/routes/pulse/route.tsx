import { createFileRoute, Outlet } from "@tanstack/react-router";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3FoundationShell, V3Screen, V3Surface } from "@/components/v3/V3Foundation";
import { V3PulseRouteGate } from "@/components/v3/V3PulseRouteGate";

export const Route = createFileRoute("/pulse")({
  component: PulseRouteLayout,
});

function PulseRouteLayout() {
  const { isAppMode, platformResolved } = useSolarisApp();

  if (!platformResolved) {
    return (
      <V3FoundationShell>
        <V3Screen className="min-h-dvh" data-v3-pulse-boot="">
          <V3Surface level="raised" className="p-5">
            <h1 className="text-2xl font-bold">Solaris Pulse</h1>
            <p role="status" className="mt-2 text-sm text-white/55">
              Opening published updates…
            </p>
          </V3Surface>
        </V3Screen>
      </V3FoundationShell>
    );
  }

  if (!isAppMode) return <Outlet />;

  return <V3PulseRouteGate fallback={<Outlet />} />;
}
