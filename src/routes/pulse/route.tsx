import { createFileRoute, Outlet } from "@tanstack/react-router";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { V3PulseRouteGate } from "@/components/v3/V3PulseRouteGate";

export const Route = createFileRoute("/pulse")({
  component: PulseRouteLayout,
});

function PulseRouteLayout() {
  const { isAppMode, platformResolved } = useSolarisApp();

  if (!platformResolved) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10" data-v3-pulse-boot="">
        <h1 className="text-3xl font-bold">Solaris Pulse</h1>
        <p role="status" className="mt-3">Opening published updates…</p>
      </main>
    );
  }

  if (!isAppMode) return <Outlet />;

  return <V3PulseRouteGate fallback={<Outlet />} />;
}
